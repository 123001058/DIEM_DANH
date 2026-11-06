#include "Arduino.h"
#include "esp_http_server.h"
#include "esp_timer.h"
#include "esp_camera.h"
#include "img_converters.h"
#include "board_config.h"
#include <WiFi.h>

extern "C" {
  // Driver esp32-camera (cam_hal.c) khai bao 2 ham nay la void (da kiem tra bang objdump libespressif__esp32-camera.a)
  void cam_start(void);
  void cam_stop(void);
}

// Dinh nghia trong esp32_cam_ai.ino: khoi tao (lai) driver cam voi dung chan/cau hinh board
esp_err_t cameraInitPins(void);

#define PART_BOUNDARY "123456789000000000000987654321"
static const char *_STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char *_STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char *_STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\nX-Timestamp: %d.%06d\r\n\r\n";

httpd_handle_t stream_httpd = NULL;
httpd_handle_t camera_httpd = NULL;

// =============================================================================
// QUẢN LÝ NGUỒN TIẾT KIỆM ĐIỆN & ĐỒNG BỘ ĐA LUỒNG (R1, R2, R3)
// =============================================================================
typedef enum {
  CAM_POWER_STANDBY,
  CAM_POWER_TRANSITIONING,
  CAM_POWER_ACTIVE
} cam_power_state_t;

static SemaphoreHandle_t s_power_mutex = NULL;
static portMUX_TYPE s_client_mux = portMUX_INITIALIZER_UNLOCKED;
static volatile cam_power_state_t s_power_state = CAM_POWER_ACTIVE;
static volatile int s_active_stream_clients = 0;
static volatile int s_in_flight_captures = 0;
static volatile unsigned long s_last_activity_ms = 0;

// Standby theo Idle Timeout. Phase-1: tat auto-standby de cam khong bao gio ket I2C/VSYNC;
// Dat 1 de bat lai (khi da va xong thu tu set_reg/cam_stop trong enterCameraStandby)
#ifndef ENABLE_CAM_IDLE_STANDBY
#define ENABLE_CAM_IDLE_STANDBY 0
#endif

// Cấu hình hạ xung CPU (mặc định tắt theo R2 nhằm bảo vệ ngoại vi & mạng)
#ifndef ENABLE_CPU_FREQ_SCALING
#define ENABLE_CPU_FREQ_SCALING 0
#endif

// Ham danh thuc noi bo (yeu cau caller giu s_power_mutex)
static esp_err_t wakeCameraActiveInternal(void) {
  if (s_power_state == CAM_POWER_ACTIVE) {
    s_last_activity_ms = millis();
    return ESP_OK;
  }

  s_power_state = CAM_POWER_TRANSITIONING;
  Serial.println("[POWER] WAKEUP: Kich hoat camera -> ACTIVE...");

#if ENABLE_CPU_FREQ_SCALING
  setCpuFrequencyMhz(240);
#endif

  // 1. Tat Wi-Fi sleep de giu ket noi mang on dinh va FPS cao
  WiFi.setSleep(false);

  // 2. Xoa bit Soft Sleep tren thanh ghi COM2 (0x09) cua cam bien OV2640
  sensor_t *s = esp_camera_sensor_get();
  if (s && s->set_reg) {
    // Bit 8 cua reg = bank (0x100 = Sensor bank). Driver tu chon bank va nho cache, khong ghi tay 0xFF
    s->set_reg(s, 0x100 | 0x09, 0x10, 0x00); // COM2 bit 4 = 0 (Soft Sleep OFF)
  }

  // 3. Tri hoan ~150ms cho mach analog va dien ap cam bien on dinh
  vTaskDelay(pdMS_TO_TICKS(150));

  // 4. Bat lai ngat VSYNC; frame ke tiep tu khoi dong lai GDMA (cam_start la ham void, khong co ma loi)
  cam_start();

  // 5. Xa sach toi da 2 frame buffer ton du va doc bo them 1 frame moi thu de AEC/AGC can bang do sang
  // Khong them delay delay nhan tao giua cac frame de dam bao thoi gian wake < 300ms, khong gay timeout tren Kiosk
  for (int i = 0; i < 3; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) {
      esp_camera_fb_return(fb);
    } else {
      break;
    }
  }

  s_power_state = CAM_POWER_ACTIVE;
  s_last_activity_ms = millis();
  Serial.println("[POWER] Camera da o trang thai ACTIVE (XCLK 20MHz, fb_count=2, No-Sleep)!");
  return ESP_OK;
}

// Đánh thức camera về trạng thái ACTIVE cho external callers (/power)
esp_err_t wakeCameraActive(void) {
  if (s_power_mutex == NULL) return ESP_FAIL;
  if (xSemaphoreTake(s_power_mutex, pdMS_TO_TICKS(3000)) != pdTRUE) {
    Serial.println("[POWER] Timeout cho Mutex khi danh thuc camera!");
    return ESP_ERR_TIMEOUT;
  }

  esp_err_t res = wakeCameraActiveInternal();
  xSemaphoreGive(s_power_mutex);
  return res;
}

// Dua camera vao trang thai STANDBY tiet kiem dien
esp_err_t enterCameraStandby(void) {
  if (s_power_mutex == NULL) return ESP_FAIL;
  if (xSemaphoreTake(s_power_mutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
    return ESP_ERR_TIMEOUT;
  }

  if (s_power_state == CAM_POWER_STANDBY) {
    xSemaphoreGive(s_power_mutex);
    return ESP_OK;
  }

  // Neu con bat ky client stream (cong 81) hoac capture request (cong 80) nao dang chay, khong duoc vao sleep
  int curStreams = 0;
  int curCaptures = 0;
  portENTER_CRITICAL(&s_client_mux);
  curStreams = s_active_stream_clients;
  curCaptures = s_in_flight_captures;
  portEXIT_CRITICAL(&s_client_mux);

  if (curStreams > 0 || curCaptures > 0) {
    Serial.printf("[POWER] Khong the vao STANDBY vi con client (Stream: %d, Captures: %d)\n", curStreams, curCaptures);
    xSemaphoreGive(s_power_mutex);
    return ESP_ERR_INVALID_STATE;
  }

  s_power_state = CAM_POWER_TRANSITIONING;
  Serial.println("[POWER] STANDBY: Chuyen camera sang Soft Sleep + cam_stop + Modem Sleep...");

  // 2. Dua cam bien OV2640 vao Soft Sleep TRUOC khi dung XCLK: ghi SCCB luon thuc hien duoc khi cam con chay xung
  sensor_t *s = esp_camera_sensor_get();
  if (s && s->set_reg) {
    // Bit 8 cua reg = bank (0x100 = Sensor bank). Driver tu chon bank va nho cache, khong ghi tay 0xFF
    s->set_reg(s, 0x100 | 0x09, 0x10, 0x10); // COM2 bit 4 = 1 (Soft Sleep ON)
  }

  // 3. Dung GDMA + ngat VSYNC sau (cam_stop la ham void), tranh cat ngang frame dang ghi
  cam_stop();

  // 4. Bat che do Wi-Fi Modem Sleep de tiet kiem dien
  WiFi.setSleep(true);

#if ENABLE_CPU_FREQ_SCALING
  setCpuFrequencyMhz(80);
#endif

  s_power_state = CAM_POWER_STANDBY;
  Serial.println("[POWER] Camera da vao STANDBY tiet kiem dien thanh cong!");

  xSemaphoreGive(s_power_mutex);
  return ESP_OK;
}

// Chuan bi camera truoc khi capture hoac stream (Atomic dang ky client & tu dong danh thuc chong race condition)
static esp_err_t prepareCameraActive(bool isStream) {
  if (s_power_mutex == NULL) return ESP_FAIL;
  if (xSemaphoreTake(s_power_mutex, pdMS_TO_TICKS(3000)) != pdTRUE) {
    Serial.println("[POWER] Timeout cho Mutex khi dang ky client camera!");
    return ESP_ERR_TIMEOUT;
  }

  if (s_power_state != CAM_POWER_ACTIVE) {
    esp_err_t wakeErr = wakeCameraActiveInternal();
    if (wakeErr != ESP_OK) {
      xSemaphoreGive(s_power_mutex);
      return wakeErr;
    }
  }

  portENTER_CRITICAL(&s_client_mux);
  if (isStream) {
    s_active_stream_clients++;
  } else {
    s_in_flight_captures++;
  }
  s_last_activity_ms = millis();
  portEXIT_CRITICAL(&s_client_mux);

  xSemaphoreGive(s_power_mutex);
  return ESP_OK;
}

// Giai phong client sau khi capture hoac stream ket thuc
static void releaseCameraClient(bool isStream) {
  portENTER_CRITICAL(&s_client_mux);
  if (isStream) {
    if (s_active_stream_clients > 0) s_active_stream_clients--;
  } else {
    if (s_in_flight_captures > 0) s_in_flight_captures--;
  }
  s_last_activity_ms = millis();
  portEXIT_CRITICAL(&s_client_mux);
}

// Kiem tra Idle Timeout (15 giay khong co client -> tu ve STANDBY)
void checkCameraPowerTimeout(void) {
#if !ENABLE_CAM_IDLE_STANDBY
  // Phase-1: giu cam luon ACTIVE (khong goi cam_stop/set_reg khi khong co client)
  portENTER_CRITICAL(&s_client_mux);
  s_last_activity_ms = millis();
  portEXIT_CRITICAL(&s_client_mux);
  return;
#endif
  if (s_power_state != CAM_POWER_ACTIVE) return;

  int curStreams = 0;
  int curCaptures = 0;
  unsigned long lastAct = 0;
  portENTER_CRITICAL(&s_client_mux);
  curStreams = s_active_stream_clients;
  curCaptures = s_in_flight_captures;
  lastAct = s_last_activity_ms;
  portEXIT_CRITICAL(&s_client_mux);

  if (curStreams > 0 || curCaptures > 0) {
    portENTER_CRITICAL(&s_client_mux);
    s_last_activity_ms = millis();
    portEXIT_CRITICAL(&s_client_mux);
    return;
  }

#if ENABLE_CAM_IDLE_STANDBY
  if (millis() - lastAct >= 15000) {
    Serial.println("[POWER] Het 15s Idle Timeout khong co client nao -> Tu dong vao STANDBY");
    enterCameraStandby();
  }
#endif
}

// Loi thoat cuoi: cam bien ket soft-sleep/khong cap VSYNC -> khoi tao lai toan bo driver
// (PWDN/XCLK/SCCB) de phuc hoi ma khong can rut nguon. Chi goi khi khong con client nao.
static bool recoverCameraDriver(void) {
  if (xSemaphoreTake(s_power_mutex, pdMS_TO_TICKS(5000)) != pdTRUE) {
    Serial.println("[POWER] Khoi tao lai cam that bai: timeout cho Mutex");
    return false;
  }
  portENTER_CRITICAL(&s_client_mux);
  bool busy = (s_active_stream_clients > 0 || s_in_flight_captures > 0);
  portEXIT_CRITICAL(&s_client_mux);
  if (busy) {
    xSemaphoreGive(s_power_mutex);
    return false;
  }

  Serial.println("[POWER] Camera khong tra frame -> Khoi tao lai driver cam...");
  esp_camera_deinit();
  esp_err_t err = cameraInitPins(); // dinh nghia trong esp32_cam_ai.ino
  if (err == ESP_OK) {
    s_power_state = CAM_POWER_ACTIVE;
    WiFi.setSleep(false);
    s_last_activity_ms = millis();
  }
  Serial.printf("[POWER] Khoi tao lai driver cam: %s\n", err == ESP_OK ? "OK" : "THAT BAI");

  xSemaphoreGive(s_power_mutex);
  return err == ESP_OK;
}

static esp_err_t capture_handler(httpd_req_t *req) {
  // Tu dong danh thuc va dang ky capture duoi Mutex (chong race condition voi enterCameraStandby)
  esp_err_t prepErr = prepareCameraActive(false);
  if (prepErr != ESP_OK) {
    httpd_resp_send_500(req);
    return prepErr;
  }

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    releaseCameraClient(false);
    if (recoverCameraDriver()) {
      // Dang ky lai capture va lay frame ngay sau khi phuc hoi
      if (prepareCameraActive(false) == ESP_OK) {
        fb = esp_camera_fb_get();
        if (fb) {
          httpd_resp_set_type(req, "image/jpeg");
          httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
          httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
          httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, OPTIONS");
          httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
          httpd_resp_set_hdr(req, "Access-Control-Allow-Private-Network", "true");
          esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
          esp_camera_fb_return(fb);
          releaseCameraClient(false);
          return res;
        }
        releaseCameraClient(false);
      }
    }
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, OPTIONS");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Private-Network", "true");

  esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);

  releaseCameraClient(false);
  return res;
}

static esp_err_t stream_handler(httpd_req_t *req) {
  // Tu dong danh thuc va dang ky stream client duoi Mutex (chong race condition voi enterCameraStandby)
  esp_err_t prepErr = prepareCameraActive(true);
  if (prepErr != ESP_OK) {
    return prepErr;
  }

  camera_fb_t *fb = NULL;
  struct timeval _timestamp;
  esp_err_t res = ESP_OK;
  char part_buf[128];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) {
    releaseCameraClient(true);
    return res;
  }

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, OPTIONS");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Private-Network", "true");
  httpd_resp_set_hdr(req, "X-Framerate", "30");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      // Client stream dang chay nen khong the deinit tai day; khoi tao lai khi ket thuc stream
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

    portENTER_CRITICAL(&s_client_mux);
    s_last_activity_ms = millis();
    portEXIT_CRITICAL(&s_client_mux);
    // Giam tai CPU & chong nong chip: Delay nhe 10ms (~30 FPS muot ma)
    vTaskDelay(pdMS_TO_TICKS(10));
  }

  releaseCameraClient(true);
  if (res == ESP_FAIL) {
    // Stream chet vi cam khong tra frame -> phuc hoi driver de lan bam sau (mở phiên/ capture) lên hình ngay
    recoverCameraDriver();
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
  // Chống dồn dập request kích còi liên tục: Debounce tối thiểu 1200ms
  static unsigned long lastBeepMs = 0;
  unsigned long nowMs = millis();
  if (nowMs - lastBeepMs < 1200) {
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    return httpd_resp_send(req, "{\"ok\":true,\"debounced\":true}", -1);
  }
  lastBeepMs = nowMs;

  char query[64] = {0};
  int duration = 120; // Người thật thành công: Kêu đúng 1 tiếng 'tít' (120ms)
  int repeats = 1;

  if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
    if (strstr(query, "type=warn") != NULL || strstr(query, "type=error") != NULL || strstr(query, "type=fake") != NULL) {
      // Fake (ảnh/video giả mạo): 0 kêu gì hết, im lặng hoàn toàn
      repeats = 0;
    }
  }

  // Kêu theo định nghĩa BUZZER_ON / BUZZER_OFF trong board_config.h
  for (int i = 0; i < repeats; i++) {
    setFlashLedState(true);
    digitalWrite(BUZZER_PIN, BUZZER_ON);

    vTaskDelay(pdMS_TO_TICKS(duration));

    digitalWrite(BUZZER_PIN, BUZZER_OFF);
    setFlashLedState(false);
  }

  // Đảm bảo tuyệt đối còi luôn ở trạng thái NGẮT sau khi xử lý
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
  setFlashLedState(false);

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
        digitalWrite(targetPin, (targetPin == BUZZER_PIN) ? BUZZER_OFF : LOW);
      } else if (holdOn) {
        Serial.printf(">> [TEST] Bat giu sang lien tuc GPIO %d\n", targetPin);
        digitalWrite(targetPin, (targetPin == BUZZER_PIN) ? BUZZER_ON : HIGH);
      } else {
        Serial.printf(">> [TEST] Bat GPIO %d trong 5 giay de quan sat...\n", targetPin);
        digitalWrite(targetPin, (targetPin == BUZZER_PIN) ? BUZZER_ON : HIGH);
        vTaskDelay(pdMS_TO_TICKS(5000));
        digitalWrite(targetPin, (targetPin == BUZZER_PIN) ? BUZZER_OFF : LOW);
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

static esp_err_t power_handler(httpd_req_t *req) {
  char query[64] = {0};
  char mode[16] = {0};

  if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
    httpd_query_key_value(query, "mode", mode, sizeof(mode));
  }

  // Ho tro parse body neu goi qua POST body JSON/form
  if (mode[0] == '\0' && req->content_len > 0) {
    char body[64] = {0};
    int toRead = (req->content_len < sizeof(body) - 1) ? req->content_len : (sizeof(body) - 1);
    int ret = httpd_req_recv(req, body, toRead);
    if (ret > 0) {
      if (strstr(body, "active") || strstr(body, "wake") || strstr(body, "\"mode\":\"active\"")) {
        snprintf(mode, sizeof(mode), "active");
      } else if (strstr(body, "sleep") || strstr(body, "standby") || strstr(body, "\"mode\":\"sleep\"")) {
        snprintf(mode, sizeof(mode), "sleep");
      }
    }
  }

  if (strcmp(mode, "active") == 0 || strcmp(mode, "wake") == 0 || strcmp(mode, "1") == 0) {
    wakeCameraActive();
  } else if (strcmp(mode, "sleep") == 0 || strcmp(mode, "standby") == 0 || strcmp(mode, "0") == 0) {
    enterCameraStandby();
  }

  const char *stateStr = (s_power_state == CAM_POWER_ACTIVE) ? "ACTIVE" :
                         (s_power_state == CAM_POWER_STANDBY) ? "STANDBY" : "TRANSITIONING";

  int curStreams = 0;
  int curCaptures = 0;
  unsigned long lastAct = 0;
  portENTER_CRITICAL(&s_client_mux);
  curStreams = s_active_stream_clients;
  curCaptures = s_in_flight_captures;
  lastAct = s_last_activity_ms;
  portEXIT_CRITICAL(&s_client_mux);

  unsigned long nowMs = millis();
  unsigned long idleMs = (s_power_state == CAM_POWER_ACTIVE && nowMs >= lastAct) ? (nowMs - lastAct) : 0UL;

  char jsonBuf[192];
  snprintf(jsonBuf, sizeof(jsonBuf),
           "{\"ok\":true,\"state\":\"%s\",\"stream_clients\":%d,\"in_flight_captures\":%d,\"idle_ms\":%lu}",
           stateStr, curStreams, curCaptures, idleMs);

  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Private-Network", "true");

  return httpd_resp_send(req, jsonBuf, strlen(jsonBuf));
}

static esp_err_t options_handler(httpd_req_t *req) {
  httpd_resp_set_status(req, "204 No Content");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Private-Network", "true");
  httpd_resp_set_hdr(req, "Access-Control-Max-Age", "86400");
  return httpd_resp_send(req, NULL, 0);
}

void startCameraServer() {
  if (!s_power_mutex) {
    s_power_mutex = xSemaphoreCreateMutex();
  }
  s_last_activity_ms = millis();
  s_power_state = CAM_POWER_ACTIVE;

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.max_uri_handlers = 16;
  config.lru_purge_enable = true;
  config.server_port = 80;

  httpd_uri_t index_uri = { .uri = "/", .method = HTTP_GET, .handler = index_handler, .user_ctx = NULL };
  httpd_uri_t capture_uri = { .uri = "/capture", .method = HTTP_GET, .handler = capture_handler, .user_ctx = NULL };
  httpd_uri_t capture_options_uri = { .uri = "/capture", .method = HTTP_OPTIONS, .handler = options_handler, .user_ctx = NULL };
  httpd_uri_t stream_uri = { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL };
  httpd_uri_t stream_options_uri = { .uri = "/stream", .method = HTTP_OPTIONS, .handler = options_handler, .user_ctx = NULL };
  httpd_uri_t beep_uri = { .uri = "/beep", .method = HTTP_GET, .handler = beep_handler, .user_ctx = NULL };
  httpd_uri_t beep_options_uri = { .uri = "/beep", .method = HTTP_OPTIONS, .handler = options_handler, .user_ctx = NULL };
  httpd_uri_t flash_uri = { .uri = "/flash", .method = HTTP_GET, .handler = flash_handler, .user_ctx = NULL };
  httpd_uri_t test_pin_uri = { .uri = "/test_pin", .method = HTTP_GET, .handler = test_pin_handler, .user_ctx = NULL };
  httpd_uri_t rgb_uri = { .uri = "/rgb", .method = HTTP_GET, .handler = rgb_handler, .user_ctx = NULL };
  httpd_uri_t power_uri = { .uri = "/power", .method = HTTP_GET, .handler = power_handler, .user_ctx = NULL };
  httpd_uri_t power_post_uri = { .uri = "/power", .method = HTTP_POST, .handler = power_handler, .user_ctx = NULL };
  httpd_uri_t power_options_uri = { .uri = "/power", .method = HTTP_OPTIONS, .handler = options_handler, .user_ctx = NULL };

  if (httpd_start(&camera_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(camera_httpd, &index_uri);
    httpd_register_uri_handler(camera_httpd, &capture_uri);
    httpd_register_uri_handler(camera_httpd, &capture_options_uri);
    httpd_register_uri_handler(camera_httpd, &beep_uri);
    httpd_register_uri_handler(camera_httpd, &beep_options_uri);
    httpd_register_uri_handler(camera_httpd, &flash_uri);
    httpd_register_uri_handler(camera_httpd, &test_pin_uri);
    httpd_register_uri_handler(camera_httpd, &rgb_uri);
    httpd_register_uri_handler(camera_httpd, &power_uri);
    httpd_register_uri_handler(camera_httpd, &power_post_uri);
    httpd_register_uri_handler(camera_httpd, &power_options_uri);
  }

  config.server_port = 81;
  config.ctrl_port = 32769;
  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    httpd_register_uri_handler(stream_httpd, &stream_options_uri);
    httpd_register_uri_handler(stream_httpd, &capture_uri);
    httpd_register_uri_handler(stream_httpd, &capture_options_uri);
    httpd_register_uri_handler(stream_httpd, &beep_uri);
    httpd_register_uri_handler(stream_httpd, &beep_options_uri);
    httpd_register_uri_handler(stream_httpd, &flash_uri);
    httpd_register_uri_handler(stream_httpd, &test_pin_uri);
    httpd_register_uri_handler(stream_httpd, &rgb_uri);
    httpd_register_uri_handler(stream_httpd, &power_uri);
    httpd_register_uri_handler(stream_httpd, &power_post_uri);
    httpd_register_uri_handler(stream_httpd, &power_options_uri);
  }
}
