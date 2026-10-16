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
  config.jpeg_quality = 12; // Cân bằng độ nét và băng thông, giúp stream mượt 20-30 FPS không giật
  config.fb_count     = 2;

  // Khởi tạo camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ Camera init failed with error 0x%x\n", err);
    while (true) { delay(1000); }
  }
  Serial.println("✓ Camera OV2640 khoi tao thanh cong!");

  // Cấu hình cảm biến OV2640 tối ưu cho mô hình Face AI & Liveness
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_framesize(s, FRAMESIZE_VGA);  // 640x480
    s->set_quality(s, 12);
    s->set_sharpness(s, 0);              // Độ nét tự nhiên (0): Tránh hiện tượng gai viền nhân tạo làm AI lệch landmark mắt mũi
    s->set_contrast(s, 0);               // Giữ chi tiết vùng bóng đổ quanh hốc mắt
    s->set_brightness(s, 1);             // Nâng nhẹ độ sáng (+1) giúp mặt người trong phòng không bị tối đen
    s->set_saturation(s, 0);
    s->set_denoise(s, 1);                // Bật bộ lọc khử nhiễu hạt cảm biến
    s->set_lenc(s, 1);                   // Bù méo viền thấu kính OV2640
    s->set_gainceiling(s, GAINCEILING_8X); // Tăng dải nhạy sáng cho phòng học/kiosk
    s->set_whitebal(s, 1);               // Cân bằng trắng tự động (AWB)
    s->set_awb_gain(s, 1);
    s->set_exposure_ctrl(s, 1);          // Tự động phơi sáng (AEC)
    s->set_aec2(s, 1);                   // Thuật toán đo sáng nâng cao
    s->set_ae_level(s, 1);               // Nâng mức sáng mục tiêu thêm 1 nấc cho rõ mặt
    s->set_bpc(s, 1);                    // Khử điểm ảnh đen chết (Black Pixel Correction)
    s->set_wpc(s, 1);                    // Khử điểm ảnh trắng chết (White Pixel Correction)
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
