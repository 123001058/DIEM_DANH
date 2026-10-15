#include <Arduino.h>
#include "esp_camera.h"
#include <WiFi.h>
#include "board_config.h"

// ===========================
// CẤU HÌNH WIFI
// ===========================
const char* ssid = "Robocon Sinh Vien";
const char* password = "tamsotam";

void startCameraServer();

void setup() {
  Serial.begin(115200);
  delay(2000); // Đợi ổn định USB CDC trên cổng OTG
  Serial.println("\n\n========================================");
  Serial.println("  ESP32-S3 CAM AI - LH-NaviX KIOSK");
  Serial.println("========================================");

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  
  // Tối ưu độ nét cho nhận diện mặt: VGA 640x480
  config.frame_size   = FRAMESIZE_VGA;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode    = CAMERA_GRAB_LATEST;
  config.fb_location  = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = 10; // Chất lượng cao, ảnh mịn không vỡ hạt
  config.fb_count     = 2;

  // Khởi tạo camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ Camera init failed with error 0x%x\n", err);
    while (true) { delay(1000); }
  }
  Serial.println("✓ Camera OV2640 khoi tao thanh cong!");

  // Bật các bộ lọc nâng cao độ nét phần cứng (DSP) của chip OV2640
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_framesize(s, FRAMESIZE_VGA);  // 640x480 chuẩn nét
    s->set_quality(s, 10);               // Độ nén ít, giữ chi tiết mắt mũi
    s->set_sharpness(s, 2);              // TĂNG ĐỘ NÉT CẠNH TỐI ĐA (+2)
    s->set_contrast(s, 1);               // Tăng tương phản (+1)
    s->set_brightness(s, 0);             // Độ sáng cân bằng
    s->set_saturation(s, 0);
    s->set_denoise(s, 1);                // Bật bộ lọc khử nhiễu hạt
    s->set_lenc(s, 1);                   // Bật tính năng bù quang sai ống kính (Lens Correction)
    s->set_gainceiling(s, GAINCEILING_4X);
    s->set_whitebal(s, 1);               // Cân bằng trắng tự động
    s->set_awb_gain(s, 1);
    s->set_exposure_ctrl(s, 1);          // Tự động phơi sáng
    s->set_aec2(s, 1);                   // Thuật toán đo sáng nâng cao
    s->set_ae_level(s, 0);
    s->set_bpc(s, 1);                    // Bù điểm ảnh đen
    s->set_wpc(s, 1);                    // Bù điểm ảnh trắng
  }

  // Kết nối WiFi
  WiFi.begin(ssid, password);
  WiFi.setSleep(false); // Chống ngắt quãng WiFi

  Serial.print("Dang ket noi WiFi: ");
  Serial.println(ssid);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\n✓ WiFi da ket noi thanh cong!");

  // Bật Web server stream
  startCameraServer();

  Serial.println("----------------------------------------");
  Serial.print("👉 DIA CHI IP CUA ESP32: http://");
  Serial.println(WiFi.localIP());
  Serial.print("👉 LUONG STREAM CHUAN:   http://");
  Serial.print(WiFi.localIP());
  Serial.println(":81/stream");
  Serial.println("========================================\n");
}

void loop() {
  delay(10000);
}
