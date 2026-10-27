#ifndef BOARD_CONFIG_H
#define BOARD_CONFIG_H

#define CAMERA_MODEL_ESP32S3_EYE
// Cấu hình còi Buzzer (Chân G14)
#define BUZZER_PIN 14
// Đa số module còi 3 chân trên thị trường là Active LOW (Mức LOW = Kêu, Mức HIGH = Tắt)
// Nếu dùng còi rời Active HIGH, chỉ cần đổi số 1 thành số 0
#define BUZZER_ACTIVE_LOW 1

#if BUZZER_ACTIVE_LOW
#define BUZZER_ON  LOW
#define BUZZER_OFF HIGH
#else
#define BUZZER_ON  HIGH
#define BUZZER_OFF LOW
#endif

// Đèn LED thông minh WS2812B trên ESP32-S3 (chân chuẩn 100% là GPIO 48)
#define WS2812_LED_PIN 48
#define FLASH_LED_PIN 3

#include "camera_pins.h"

#endif  // BOARD_CONFIG_H
