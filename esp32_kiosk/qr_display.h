#pragma once
#include <Arduino.h>
#include <TFT_eSPI.h>
#include "qrcode.h"

extern TFT_eSPI tft;

// Phan vung man hinh LCD 320x240:
// Vung QR (Ben trai): X = 0..213, Y = 0..239 (rong 214px, cao 240px)
// Vung thong bao (Ben phai): X = 214..319, Y = 0..239 (rong 106px, cao 240px)
#define QR_ZONE_X 0
#define QR_ZONE_Y 0
#define QR_ZONE_W 214
#define QR_ZONE_H 240

#define NOTICE_ZONE_X 214
#define NOTICE_ZONE_Y 0
#define NOTICE_ZONE_W (320 - NOTICE_ZONE_X) // 106 px
#define NOTICE_ZONE_H 240

// Callback ve QR dung ti le nguyen (Integer Scaling) ben trong vung QR
// TUYET DOI KHONG xoa toan man hinh (fillScreen) de tranh lam mat thong bao
inline void displayQrCallback(esp_qrcode_handle_t qrcode) {
  int size = esp_qrcode_get_size(qrcode);
  
  // Tinh scale nguyen de moi module luon vuong vuc va nam gon trong QR_ZONE
  int scale = (QR_ZONE_W - 14) / size;
  int scaleH = (QR_ZONE_H - 14) / size;
  if (scaleH < scale) scale = scaleH;
  if (scale < 1) scale = 1;
  
  int qrPixelSize = size * scale;
  int offsetX = QR_ZONE_X + (QR_ZONE_W - qrPixelSize) / 2;
  int offsetY = QR_ZONE_Y + (QR_ZONE_H - qrPixelSize) / 2;

  // Chi to trang vung QR de tao Quiet Zone, giu nguyen 100% vung thong bao ben phai
  tft.fillRect(QR_ZONE_X, QR_ZONE_Y, QR_ZONE_W, QR_ZONE_H, TFT_WHITE);

  for (int y = 0; y < size; y++) {
    int py = offsetY + y * scale;
    for (int x = 0; x < size; x++) {
      if (esp_qrcode_get_module(qrcode, x, y)) {
        tft.fillRect(offsetX + x * scale, py, scale, scale, TFT_BLACK);
      }
    }
  }

  // Duong phan cach giua vung QR va vung thong bao
  tft.drawFastVLine(QR_ZONE_W - 1, 0, 240, TFT_NAVY);
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

// Xoa thong bao diem danh ben phai, dua ve man hinh cho mac dinh
// MA QR BEN TRAI NGUYEN VEN 100%, KHONG BI XOA, KHONG BI VE LAI
inline void clearCheckinNotice() {
  tft.fillRect(NOTICE_ZONE_X, NOTICE_ZONE_Y, NOTICE_ZONE_W, NOTICE_ZONE_H, TFT_BLACK);
  tft.drawFastVLine(NOTICE_ZONE_X - 1, 0, 240, TFT_NAVY);

  int centerX = NOTICE_ZONE_X + NOTICE_ZONE_W / 2;

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawCentreString("LH-NaviX", centerX, 18, 2);
  
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawCentreString("KIOSK", centerX, 40, 2);

  tft.drawFastHLine(NOTICE_ZONE_X + 8, 65, NOTICE_ZONE_W - 16, TFT_DARKGREY);

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawCentreString("SAN SANG", centerX, 82, 2);

  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawCentreString("QUET QR", centerX, 118, 2);
  tft.drawCentreString("HOAC", centerX, 142, 1);
  tft.drawCentreString("FACE AI", centerX, 158, 2);

  tft.drawFastHLine(NOTICE_ZONE_X + 8, 190, NOTICE_ZONE_W - 16, TFT_DARKGREY);

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  tft.drawCentreString("Camera/Kiosk", centerX, 210, 1);
}

// Hien thi "DA DIEM DANH" cung Ho Ten o cot phai (khong che cac o cua QR)
// QR ben trai van tiep tuc hien thi de sinh vien tiep theo quet ngay lap tuc
inline void drawCheckinNotice(String studentName) {
  studentName = nameForTft(studentName);
  
  // Chi xoa rieng vung thong bao ben phai
  tft.fillRect(NOTICE_ZONE_X, NOTICE_ZONE_Y, NOTICE_ZONE_W, NOTICE_ZONE_H, TFT_BLACK);
  tft.drawFastVLine(NOTICE_ZONE_X - 1, 0, 240, TFT_GREEN);

  int centerX = NOTICE_ZONE_X + NOTICE_ZONE_W / 2;

  // Header hop xanh la thong bao diem danh
  tft.fillRoundRect(NOTICE_ZONE_X + 4, 8, NOTICE_ZONE_W - 8, 38, 4, TFT_DARKGREEN);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREEN);
  tft.drawCentreString("DA DIEM", centerX, 12, 2);
  tft.drawCentreString("DANH", centerX, 28, 2);

  // Tach ten thanh cac tu de ngat dong vua van trong cot 106px
  int font = 2;
  int maxLineW = NOTICE_ZONE_W - 8;
  int wordCount = 0;
  String words[6];
  int startIdx = 0;
  while (startIdx < studentName.length() && wordCount < 6) {
    int spaceIdx = studentName.indexOf(' ', startIdx);
    if (spaceIdx == -1) {
      words[wordCount++] = studentName.substring(startIdx);
      break;
    } else {
      words[wordCount++] = studentName.substring(startIdx, spaceIdx);
      startIdx = spaceIdx + 1;
    }
  }

  // Gom tu thanh cac dong (toi da 4 dong)
  String lines[4];
  int lineCount = 0;
  for (int i = 0; i < wordCount; i++) {
    if (lineCount == 0 && lines[lineCount].length() == 0) {
      lines[lineCount] = words[i];
    } else if (lineCount < 4) {
      String testLine = lines[lineCount] + " " + words[i];
      if (tft.textWidth(testLine, font) <= maxLineW) {
        lines[lineCount] = testLine;
      } else {
        lineCount++;
        if (lineCount < 4) lines[lineCount] = words[i];
      }
    }
  }
  if (lineCount < 4 && lines[lineCount].length() > 0) lineCount++;

  // Can giua cac dong ten theo chieu doc
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  int startY = 58 + (82 - lineCount * 22) / 2;
  if (startY < 52) startY = 52;
  for (int i = 0; i < lineCount; i++) {
    tft.drawCentreString(lines[i], centerX, startY + i * 22, font);
  }

  // Ghi chu trang thai ben duoi
  tft.drawFastHLine(NOTICE_ZONE_X + 8, 156, NOTICE_ZONE_W - 16, TFT_DARKGREY);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawCentreString("THANH CONG", centerX, 168, 2);

  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawCentreString("Quet tiep...", centerX, 205, 1);
}

// Alias de tuong thich nguoc neu co cho nao goi drawCheckinName
inline void drawCheckinName(String studentName) {
  drawCheckinNotice(studentName);
}
