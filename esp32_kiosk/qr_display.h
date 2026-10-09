#pragma once
#include <Arduino.h>
#include <TFT_eSPI.h>
#include "qrcode.h"

extern TFT_eSPI tft;

// Callback ve QR phong to 100% kịch trần chieu cao man hinh (240px)
inline void displayQrCallback(esp_qrcode_handle_t qrcode) {
  int size = esp_qrcode_get_size(qrcode);
  int screenH = tft.height(); // Chieu cao man hinh (240px)
  int screenW = tft.width();  // Chieu rong man hinh (320px)
  
  int targetDim = screenH; // Chiem tron 100% chieu cao (240px)
  int offsetX = (screenW - targetDim) / 2; // Can giua theo chieu ngang

  tft.fillScreen(TFT_WHITE); // Nen trang toan man hinh tao vien Quiet Zone

  for (int y = 0; y < size; y++) {
    int y0 = (y * targetDim) / size;
    int y1 = ((y + 1) * targetDim) / size;
    int h = y1 - y0;

    for (int x = 0; x < size; x++) {
      if (esp_qrcode_get_module(qrcode, x, y)) {
        int x0 = offsetX + (x * targetDim) / size;
        int x1 = offsetX + ((x + 1) * targetDim) / size;
        int w = x1 - x0;
        tft.fillRect(x0, y0, w, h, TFT_BLACK);
      }
    }
  }
}

inline void drawQRCode(String text) {
  esp_qrcode_config_t cfg = {
    .display_func = displayQrCallback,
    .max_qrcode_version = 10,
    .qrcode_ecc_level = ESP_QRCODE_ECC_LOW
  };
  esp_qrcode_generate(&cfg, text.c_str());
}
