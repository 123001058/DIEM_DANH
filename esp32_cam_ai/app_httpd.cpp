#include "Arduino.h"
#include "esp_http_server.h"
#include "esp_timer.h"
#include "esp_camera.h"
#include "img_converters.h"
#include "board_config.h"

#define PART_BOUNDARY "123456789000000000000987654321"
static const char *_STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char *_STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char *_STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\nX-Timestamp: %d.%06d\r\n\r\n";

httpd_handle_t stream_httpd = NULL;
httpd_handle_t camera_httpd = NULL;

static esp_err_t capture_handler(httpd_req_t *req) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return res;
}

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t *fb = NULL;
  struct timeval _timestamp;
  esp_err_t res = ESP_OK;
  char part_buf[128];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "X-Framerate", "30");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      res = ESP_FAIL;
    } else {
      _timestamp.tv_sec = fb->timestamp.tv_sec;
      _timestamp.tv_usec = fb->timestamp.tv_usec;
      size_t hlen = snprintf(part_buf, 128, _STREAM_PART, fb->len, _timestamp.tv_sec, _timestamp.tv_usec);
      
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
      if (res == ESP_OK) res = httpd_resp_send_chunk(req, part_buf, hlen);
      if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
      
      esp_camera_fb_return(fb);
      fb = NULL;
    }

    if (res != ESP_OK) break;

    // Giảm tải CPU & chống nóng chip: Delay nhẹ 10ms (~30 FPS mượt mà)
    vTaskDelay(pdMS_TO_TICKS(10));
  }

  return res;
}

static esp_err_t index_handler(httpd_req_t *req) {
  const char* html = 
    "<!DOCTYPE html><html><head><meta charset='utf-8'><title>ESP32-S3 Cam</title>"
    "<style>body{margin:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;color:#fff;font-family:sans-serif;}"
    "img{max-width:95vw;max-height:85vh;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.8);}"
    "p{color:#94a3b8;font-size:14px;margin-top:12px;}</style></head>"
    "<body><h2>ESP32-S3 CAM AI - LH-NaviX</h2>"
    "<img src=':81/stream' onerror=\"this.src='/capture?t='+Date.now();\">"
    "<p>Stream cổng 81 · Độ phân giải VGA sắc nét</p></body></html>";

  httpd_resp_set_type(req, "text/html");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, html, strlen(html));
}

static esp_err_t beep_handler(httpd_req_t *req) {
  char query[64] = {0};
  int duration = 80; // Thành công: 1 tiếng 'tít' ngắn dứt khoát (80ms)
  int repeats = 1;

  if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
    if (strstr(query, "type=warn") != NULL || strstr(query, "type=error") != NULL) {
      // Giả mạo (Fake ảnh/màn hình): Kêu 1 tiếng DÀI 750ms báo lỗi từ chối rõ rệt
      duration = 750;
      repeats = 1;
    }
  }

  // Active Low: LOW = kêu, HIGH = ngắt
  for (int i = 0; i < repeats; i++) {
    digitalWrite(BUZZER_PIN, LOW);
    vTaskDelay(pdMS_TO_TICKS(duration));
    digitalWrite(BUZZER_PIN, HIGH);
    if (i < repeats - 1) {
      vTaskDelay(pdMS_TO_TICKS(100));
    }
  }

  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, "{\"ok\":true,\"buzzer\":\"beeped\"}", strlen("{\"ok\":true,\"buzzer\":\"beeped\"}"));
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.max_uri_handlers = 8;
  config.server_port = 80;

  httpd_uri_t index_uri = { .uri = "/", .method = HTTP_GET, .handler = index_handler, .user_ctx = NULL };
  httpd_uri_t capture_uri = { .uri = "/capture", .method = HTTP_GET, .handler = capture_handler, .user_ctx = NULL };
  httpd_uri_t stream_uri = { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL };
  httpd_uri_t beep_uri = { .uri = "/beep", .method = HTTP_GET, .handler = beep_handler, .user_ctx = NULL };

  if (httpd_start(&camera_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(camera_httpd, &index_uri);
    httpd_register_uri_handler(camera_httpd, &capture_uri);
    httpd_register_uri_handler(camera_httpd, &beep_uri);
  }

  config.server_port = 81;
  config.ctrl_port = 32769;
  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    httpd_register_uri_handler(stream_httpd, &beep_uri);
  }
}
