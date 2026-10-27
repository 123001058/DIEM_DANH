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

inline char vietnameseBaseLetter(uint32_t codepoint) {
  if (codepoint == 0x0110) return 'D';
  if (codepoint == 0x0111) return 'd';
  if ((codepoint >= 0x00C0 && codepoint <= 0x00C3) || codepoint == 0x00C2 ||
      (codepoint >= 0x00C4 && codepoint <= 0x00C5) || codepoint == 0x0102 ||
      (codepoint >= 0x1EA0 && codepoint <= 0x1EB7)) return 'A';
  if ((codepoint >= 0x00E0 && codepoint <= 0x00E3) ||
      (codepoint >= 0x00E4 && codepoint <= 0x00E5) || codepoint == 0x0103 ||
      (codepoint >= 0x1EA1 && codepoint <= 0x1EB7)) return 'a';
  if ((codepoint >= 0x00C8 && codepoint <= 0x00CB) ||
      (codepoint >= 0x1EB8 && codepoint <= 0x1EC7)) return 'E';
  if ((codepoint >= 0x00E8 && codepoint <= 0x00EB) ||
      (codepoint >= 0x1EB9 && codepoint <= 0x1EC7)) return 'e';
  if ((codepoint >= 0x00CC && codepoint <= 0x00CF) || codepoint == 0x0128 ||
      (codepoint >= 0x1EC8 && codepoint <= 0x1ECB)) return 'I';
  if ((codepoint >= 0x00EC && codepoint <= 0x00EF) || codepoint == 0x0129 ||
      (codepoint >= 0x1EC9 && codepoint <= 0x1ECB)) return 'i';
  if ((codepoint >= 0x00D2 && codepoint <= 0x00D6) || codepoint == 0x01A0 ||
      (codepoint >= 0x1ECC && codepoint <= 0x1EE3)) return 'O';
  if ((codepoint >= 0x00F2 && codepoint <= 0x00F6) || codepoint == 0x01A1 ||
      (codepoint >= 0x1ECD && codepoint <= 0x1EE3)) return 'o';
  if ((codepoint >= 0x00D9 && codepoint <= 0x00DC) || codepoint == 0x0168 ||
      codepoint == 0x01AF || (codepoint >= 0x1EE4 && codepoint <= 0x1EF1)) return 'U';
  if ((codepoint >= 0x00F9 && codepoint <= 0x00FC) || codepoint == 0x0169 ||
      codepoint == 0x01B0 || (codepoint >= 0x1EE5 && codepoint <= 0x1EF1)) return 'u';
  if (codepoint == 0x00DD || (codepoint >= 0x1EF2 && codepoint <= 0x1EF9)) return 'Y';
  if (codepoint == 0x00FD || (codepoint >= 0x1EF3 && codepoint <= 0x1EF9)) return 'y';
  return 0;
}

inline String nameForTft(String utf8Name) {
  String result;
  result.reserve(utf8Name.length());

  for (size_t i = 0; i < utf8Name.length();) {
    uint8_t first = static_cast<uint8_t>(utf8Name[i++]);
    uint32_t codepoint = first;
    if ((first & 0xE0) == 0xC0 && i < utf8Name.length()) {
      codepoint = ((first & 0x1F) << 6) | (static_cast<uint8_t>(utf8Name[i++]) & 0x3F);
    } else if ((first & 0xF0) == 0xE0 && i + 1 < utf8Name.length()) {
      codepoint = ((first & 0x0F) << 12) |
                  ((static_cast<uint8_t>(utf8Name[i++]) & 0x3F) << 6) |
                  (static_cast<uint8_t>(utf8Name[i++]) & 0x3F);
    } else if (first >= 0x80) {
      result += '?';
      continue;
    }

    char base = vietnameseBaseLetter(codepoint);
    if (base) result += base;
    else if (codepoint < 0x80) result += static_cast<char>(codepoint);
    else result += '?';
  }
  result.trim();
  result.toUpperCase();
  return result;
}

inline void drawCheckinName(String studentName) {
  studentName = nameForTft(studentName);
  const int centerX = tft.width() / 2;
  const int maxWidth = tft.width() - 20;

  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawCentreString("DA DIEM DANH", centerX, 34, 2);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);

  int font = tft.textWidth(studentName, 4) <= maxWidth ? 4 : 2;
  if (tft.textWidth(studentName, font) <= maxWidth) {
    tft.drawCentreString(studentName, centerX, 96, font);
  } else {
    int splitAt = studentName.lastIndexOf(' ', studentName.length() / 2);
    if (splitAt < 0) splitAt = studentName.indexOf(' ', studentName.length() / 2);
    if (splitAt > 0) {
      String firstLine = studentName.substring(0, splitAt);
      String secondLine = studentName.substring(splitAt + 1);
      tft.drawCentreString(firstLine, centerX, 82, 2);
      tft.drawCentreString(secondLine, centerX, 116, 2);
    } else {
      tft.drawCentreString(studentName, centerX, 96, 1);
    }
  }

  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawCentreString("DANG QUAY LAI MA QR...", centerX, 192, 2);
}
