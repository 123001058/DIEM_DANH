#pragma once
#include <Arduino.h>
#include <TFT_eSPI.h>
#include "qrcode.h"

extern TFT_eSPI tft;

// Callback ve QR dung ti le nguyen (Integer Scaling) cho camera iOS/Android
inline void displayQrCallback(esp_qrcode_handle_t qrcode) {
  int size = esp_qrcode_get_size(qrcode);
  int screenH = tft.height(); // 240px
  int screenW = tft.width();  // 320px
  
  // Tinh scale nguyen (Integer Scaling) de moi module luon vuong vuc
  // Khong bi lech ti le chuan 1:1:3:1:1 cua 3 goc dinh vi (Finder Patterns) tren iOS
  int scale = (screenH - 16) / size;
  if (scale < 1) scale = 1;
  
  int qrPixelSize = size * scale;
  int offsetX = (screenW - qrPixelSize) / 2;
  int offsetY = (screenH - qrPixelSize) / 2;

  tft.fillScreen(TFT_WHITE); // Nen trang toan man hinh tao Quiet Zone

  for (int y = 0; y < size; y++) {
    int py = offsetY + y * scale;
    for (int x = 0; x < size; x++) {
      if (esp_qrcode_get_module(qrcode, x, y)) {
        tft.fillRect(offsetX + x * scale, py, scale, scale, TFT_BLACK);
      }
    }
  }
}

inline void drawQRCode(String text) {
  esp_qrcode_config_t cfg = {
    .display_func = displayQrCallback,
    .max_qrcode_version = 10,
    .qrcode_ecc_level = ESP_QRCODE_ECC_MED // Tang sua loi len MED chong loa mat kinh TFT
  };
  esp_qrcode_generate(&cfg, text.c_str());
}
