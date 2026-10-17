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

static void setFlashLedState(bool on) {
  #ifdef FLASH_LED_PIN
  digitalWrite(FLASH_LED_PIN, on ? HIGH : LOW);
  #endif
  #ifdef WS2812_LED_PIN
  if (on) {
    neopixelWrite(WS2812_LED_PIN, 255, 255, 255); // Màu trắng cực đại
  } else {
    neopixelWrite(WS2812_LED_PIN, 0, 0, 0); // Tắt
  }
  #endif
}

static esp_err_t beep_handler(httpd_req_t *req) {
  char query[64] = {0};
  int duration = 120; // Người thật thành công: Kêu đúng 1 tiếng 'tít' (120ms)
  int repeats = 1;

  if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
    if (strstr(query, "type=warn") != NULL || strstr(query, "type=error") != NULL || strstr(query, "type=fake") != NULL) {
      // Fake (ảnh/video giả mạo): 0 kêu gì hết, im lặng hoàn toàn
      repeats = 0;
    }
  }

  // Active Low với Buzzer: LOW = kêu, HIGH = ngắt
  for (int i = 0; i < repeats; i++) {
    setFlashLedState(true);
    digitalWrite(BUZZER_PIN, LOW);

    vTaskDelay(pdMS_TO_TICKS(duration));

    digitalWrite(BUZZER_PIN, HIGH);
    setFlashLedState(false);
  }

  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, "{\"ok\":true,\"buzzer\":\"beeped\",\"flash\":\"blinked\"}", strlen("{\"ok\":true,\"buzzer\":\"beeped\",\"flash\":\"blinked\"}"));
}

static esp_err_t flash_handler(httpd_req_t *req) {
  char query[64] = {0};
  if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
    if (strstr(query, "val=1") != NULL || strstr(query, "state=1") != NULL) {
      setFlashLedState(true);
    } else if (strstr(query, "val=0") != NULL || strstr(query, "state=0") != NULL) {
      setFlashLedState(false);
    } else {
      setFlashLedState(true);
      vTaskDelay(pdMS_TO_TICKS(3000));
      setFlashLedState(false);
    }
  } else {
    setFlashLedState(true);
    vTaskDelay(pdMS_TO_TICKS(3000));
    setFlashLedState(false);
  }
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, "{\"ok\":true}", strlen("{\"ok\":true}"));
}

static esp_err_t rgb_handler(httpd_req_t *req) {
  char query[64] = {0};
  int pin = 48; // Mặc định chân 48 của ESP32-S3

  if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
    char pinStr[16] = {0};
    if (httpd_query_key_value(query, "pin", pinStr, sizeof(pinStr)) == ESP_OK) {
      pin = atoi(pinStr);
    }
  }

  Serial.printf(">> [RGB WS2812B] Kich hoat neopixelWrite tren GPIO %d\n", pin);

  // Đỏ
  neopixelWrite(pin, 255, 0, 0);
  vTaskDelay(pdMS_TO_TICKS(500));
  // Xanh lá
  neopixelWrite(pin, 0, 255, 0);
  vTaskDelay(pdMS_TO_TICKS(500));
  // Xanh dương
  neopixelWrite(pin, 0, 0, 255);
  vTaskDelay(pdMS_TO_TICKS(500));
  // Trắng siêu sáng giữ 4 giây
  neopixelWrite(pin, 255, 255, 255);
  vTaskDelay(pdMS_TO_TICKS(4000));
  // Tắt
  neopixelWrite(pin, 0, 0, 0);

  char res[96];
  snprintf(res, sizeof(res), "{\"ok\":true,\"tested_ws2812_pin\":%d,\"message\":\"Da chay test WS2812B tren chan %d\"}", pin, pin);
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, res, strlen(res));
}

static esp_err_t test_pin_handler(httpd_req_t *req) {
  char query[64] = {0};
  int targetPin = -1;

  if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
    // 1. Quét tự động lần lượt các chân ứng viên: 38, 47, 3, 21, 1, 48, 2
    if (strstr(query, "scan=1") != NULL) {
      const int candidatePins[] = {38, 47, 3, 21, 1, 48, 2};
      for (int i = 0; i < 7; i++) {
        int p = candidatePins[i];
        Serial.printf(">> [SCAN] Dang thu chan GPIO %d...\n", p);
        pinMode(p, OUTPUT);
        // Thử cả nhịp Active HIGH và Active LOW
        for (int k = 0; k < 3; k++) {
          digitalWrite(p, HIGH);
          vTaskDelay(pdMS_TO_TICKS(150));
          digitalWrite(p, LOW);
          vTaskDelay(pdMS_TO_TICKS(150));
        }
        vTaskDelay(pdMS_TO_TICKS(500));
      }
      httpd_resp_set_type(req, "application/json");
      httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
      return httpd_resp_send(req, "{\"ok\":true,\"message\":\"Da quet xong cac chan 38, 47, 3, 21, 1, 48, 2. Xem Serial Monitor va quan sat den!\"}", strlen("{\"ok\":true,\"message\":\"Da quet xong cac chan 38, 47, 3, 21, 1, 48, 2. Xem Serial Monitor va quan sat den!\"}"));
    }

    // 2. Thử 1 chân cụ thể
    char pinStr[16] = {0};
    if (httpd_query_key_value(query, "pin", pinStr, sizeof(pinStr)) == ESP_OK) {
      targetPin = atoi(pinStr);
    }
  }

  // Bảo vệ an toàn: Không chạm vào chân Camera (4..13, 15..18) và USB (19, 20)
  if (targetPin >= 0 && targetPin <= 48) {
    if (targetPin != 4 && targetPin != 5 && targetPin != 6 && targetPin != 7 &&
        targetPin != 8 && targetPin != 9 && targetPin != 10 && targetPin != 11 &&
        targetPin != 12 && targetPin != 13 && targetPin != 15 && targetPin != 16 &&
        targetPin != 17 && targetPin != 18 && targetPin != 19 && targetPin != 20 &&
        targetPin != 35 && targetPin != 36 && targetPin != 37) {

      bool holdOn = (strstr(query, "val=1") != NULL || strstr(query, "state=1") != NULL || strstr(query, "on=1") != NULL);
      bool turnOff = (strstr(query, "val=0") != NULL || strstr(query, "state=0") != NULL || strstr(query, "off=1") != NULL);

      pinMode(targetPin, OUTPUT);

      if (turnOff) {
        Serial.printf(">> [TEST] Tat GPIO %d\n", targetPin);
        digitalWrite(targetPin, LOW);
      } else if (holdOn) {
        Serial.printf(">> [TEST] Bat giu sang lien tuc GPIO %d\n", targetPin);
        digitalWrite(targetPin, HIGH);
      } else {
        Serial.printf(">> [TEST] Bat sang GPIO %d trong 5 giay de quan sat...\n", targetPin);
        digitalWrite(targetPin, HIGH);
        vTaskDelay(pdMS_TO_TICKS(5000));
        digitalWrite(targetPin, LOW);
      }

      char res[96];
      snprintf(res, sizeof(res), "{\"ok\":true,\"tested_pin\":%d,\"message\":\"Da kich hoat GPIO %d thanh cong\"}", targetPin, targetPin);
      httpd_resp_set_type(req, "application/json");
      httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
      return httpd_resp_send(req, res, strlen(res));
    }
  }

  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, "{\"ok\":false,\"message\":\"Chân không hợp lệ hoặc đang dùng cho Camera\"}", strlen("{\"ok\":false,\"message\":\"Chân không hợp lệ hoặc đang dùng cho Camera\"}"));
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.max_uri_handlers = 12;
  config.server_port = 80;

  httpd_uri_t index_uri = { .uri = "/", .method = HTTP_GET, .handler = index_handler, .user_ctx = NULL };
  httpd_uri_t capture_uri = { .uri = "/capture", .method = HTTP_GET, .handler = capture_handler, .user_ctx = NULL };
  httpd_uri_t stream_uri = { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL };
  httpd_uri_t beep_uri = { .uri = "/beep", .method = HTTP_GET, .handler = beep_handler, .user_ctx = NULL };
  httpd_uri_t flash_uri = { .uri = "/flash", .method = HTTP_GET, .handler = flash_handler, .user_ctx = NULL };
  httpd_uri_t test_pin_uri = { .uri = "/test_pin", .method = HTTP_GET, .handler = test_pin_handler, .user_ctx = NULL };
  httpd_uri_t rgb_uri = { .uri = "/rgb", .method = HTTP_GET, .handler = rgb_handler, .user_ctx = NULL };

  if (httpd_start(&camera_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(camera_httpd, &index_uri);
    httpd_register_uri_handler(camera_httpd, &capture_uri);
    httpd_register_uri_handler(camera_httpd, &beep_uri);
    httpd_register_uri_handler(camera_httpd, &flash_uri);
    httpd_register_uri_handler(camera_httpd, &test_pin_uri);
    httpd_register_uri_handler(camera_httpd, &rgb_uri);
  }

  config.server_port = 81;
  config.ctrl_port = 32769;
  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    httpd_register_uri_handler(stream_httpd, &beep_uri);
    httpd_register_uri_handler(stream_httpd, &flash_uri);
    httpd_register_uri_handler(stream_httpd, &test_pin_uri);
    httpd_register_uri_handler(stream_httpd, &rgb_uri);
  }
}
