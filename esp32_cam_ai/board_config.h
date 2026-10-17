#ifndef BOARD_CONFIG_H
#define BOARD_CONFIG_H

#define CAMERA_MODEL_ESP32S3_EYE
#define BUZZER_PIN 14

// Đèn LED thông minh WS2812B trên ESP32-S3 (chân chuẩn 100% là GPIO 48)
#define WS2812_LED_PIN 48
#define FLASH_LED_PIN 3

#include "camera_pins.h"

#endif  // BOARD_CONFIG_H
