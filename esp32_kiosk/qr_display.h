#pragma once
#include <Arduino.h>
#include <TFT_eSPI.h>
#include <TJpg_Decoder.h>
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

// Toa do va kich thuoc khung Avatar tren man hinh thong bao toan man hinh (320x240)
#define AVATAR_BOX_X 10
#define AVATAR_BOX_Y 48
#define AVATAR_BOX_W 100
#define AVATAR_BOX_H 100

// Callback ve khoi pixel JPEG len man hinh qua TFT_eSPI
inline bool tft_output(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap) {
  if (y >= tft.height() || x >= tft.width()) return 0;
  tft.pushImage(x, y, w, h, bitmap);
  return 1;
}

// Khoi tao cau hinh cho bo giai ma anh TJpg_Decoder
inline void initJpgDecoder() {
  TJpgDec.setJpgScale(1);
  TJpgDec.setSwapBytes(true); // Can thiet cho TFT_eSPI 16-bit RGB565 mau chuan
  TJpgDec.setCallback(tft_output);
}

// Callback ve QR dung ti le nguyen (Integer Scaling) ben trong vung QR
inline void displayQrCallback(esp_qrcode_handle_t qrcode) {
  int size = esp_qrcode_get_size(qrcode);
  
  int scale = (QR_ZONE_W - 14) / size;
  int scaleH = (QR_ZONE_H - 14) / size;
  if (scaleH < scale) scale = scaleH;
  if (scale < 1) scale = 1;
  
  int qrPixelSize = size * scale;
  int offsetX = QR_ZONE_X + (QR_ZONE_W - qrPixelSize) / 2;
  int offsetY = QR_ZONE_Y + (QR_ZONE_H - qrPixelSize) / 2;

  tft.fillRect(QR_ZONE_X, QR_ZONE_Y, QR_ZONE_W, QR_ZONE_H, TFT_WHITE);

  for (int y = 0; y < size; y++) {
    int py = offsetY + y * scale;
    for (int x = 0; x < size; x++) {
      if (esp_qrcode_get_module(qrcode, x, y)) {
        tft.fillRect(offsetX + x * scale, py, scale, scale, TFT_BLACK);
      }
    }
  }

  tft.drawFastVLine(QR_ZONE_W - 1, 0, 240, TFT_NAVY);
}

inline void drawQRCode(String text) {
  esp_qrcode_config_t cfg = {
    .display_func = displayQrCallback,
    .max_qrcode_version = 10,
    .qrcode_ecc_level = ESP_QRCODE_ECC_MED
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

inline char getInitialLetter(String normalizedName) {
  int lastSpace = normalizedName.lastIndexOf(' ');
  String lastName = (lastSpace >= 0) ? normalizedName.substring(lastSpace + 1) : normalizedName;
  if (lastName.length() > 0) {
    char c = lastName[0];
    if (c >= 'A' && c <= 'Z') return c;
    if (c >= 'a' && c <= 'z') return static_cast<char>(c - 32);
  }
  return 'U';
}

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

inline void drawCheckinNotice(String studentName) {
  studentName = nameForTft(studentName);
  
  tft.fillRect(NOTICE_ZONE_X, NOTICE_ZONE_Y, NOTICE_ZONE_W, NOTICE_ZONE_H, TFT_BLACK);
  tft.drawFastVLine(NOTICE_ZONE_X - 1, 0, 240, TFT_GREEN);

  int centerX = NOTICE_ZONE_X + NOTICE_ZONE_W / 2;

  tft.fillRoundRect(NOTICE_ZONE_X + 4, 8, NOTICE_ZONE_W - 8, 38, 4, TFT_DARKGREEN);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREEN);
  tft.drawCentreString("DA DIEM", centerX, 12, 2);
  tft.drawCentreString("DANH", centerX, 28, 2);

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

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  int startY = 58 + (82 - lineCount * 22) / 2;
  if (startY < 52) startY = 52;
  for (int i = 0; i < lineCount; i++) {
    tft.drawCentreString(lines[i], centerX, startY + i * 22, font);
  }

  tft.drawFastHLine(NOTICE_ZONE_X + 8, 156, NOTICE_ZONE_W - 16, TFT_DARKGREY);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawCentreString("THANH CONG", centerX, 168, 2);

  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawCentreString("Quet tiep...", centerX, 205, 1);
}

inline void drawCheckinName(String studentName) {
  drawCheckinNotice(studentName);
}

// -------------------------------------------------------------------------------------------------
// GIAO DIEN DIEM DANH TOAN MAN HINH 320x240 (FULLSCREEN CHECKIN DISPLAY)
// -------------------------------------------------------------------------------------------------

// Wrap by measured pixel width, rather than splitting the string at its midpoint.
inline bool wrapFullscreenName(String name, uint8_t font, String* lines, int limit, int width, int& count) {
  count = 0;
  name.trim();
  while (name.length() > 0 && count < limit) {
    int fit = 0;
    while (fit < int(name.length()) && tft.textWidth(name.substring(0, fit + 1), font) <= width) fit++;
    if (fit == 0) return false;
    int end = fit;
    if (fit < int(name.length())) {
      int space = name.lastIndexOf(' ', fit);
      if (space > 0) end = space;
    }
    lines[count] = name.substring(0, end);
    lines[count++].trim();
    name = name.substring(end);
    name.trim();
  }
  return name.length() == 0;
}

inline void drawFullscreenName(const String& name) {
  const int x = 122, y = 48, width = tft.width() - x - 8, height = 60;
  String lines[6];
  int count = 0;
  uint8_t font = 4;
  bool fits = false;
  const uint8_t fonts[] = {4, 2, 1};
  for (uint8_t candidate : fonts) {
    font = candidate;
    int limit = height / tft.fontHeight(font);
    if (limit > 6) limit = 6;
    fits = wrapFullscreenName(name, font, lines, limit, width, count);
    if (fits) break;
  }
  if (!fits && count > 0) {
    String& last = lines[count - 1];
    while (last.length() && tft.textWidth(last + "...", font) > width) last.remove(last.length() - 1);
    last += "...";
  }
  int lineHeight = tft.fontHeight(font);
  int top = y + (height - count * lineHeight) / 2;
  for (int i = 0; i < count; i++) tft.drawString(lines[i], x, top + i * lineHeight, font);
}

inline void drawCheckinFullscreen(String studentName, String mssv) {
  String asciiName = nameForTft(studentName);
  char initialChar = getInitialLetter(asciiName);

  // 1. Xoa toan man hinh ve mau den
  tft.fillScreen(TFT_BLACK);

  // 2. Header xanh la tren cung
  tft.fillRect(0, 0, 320, 36, TFT_DARKGREEN);
  tft.drawFastHLine(0, 36, 320, TFT_GREEN);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREEN);
  tft.drawCentreString("DA DIEM DANH THANH CONG", 160, 8, 2);

  // 3. Khung Avatar voi chu cai dau (Initials Badge fallback ngay lap tuc)
  tft.fillRect(AVATAR_BOX_X, AVATAR_BOX_Y, AVATAR_BOX_W, AVATAR_BOX_H, tft.color565(24, 32, 47));
  tft.drawRoundRect(AVATAR_BOX_X - 1, AVATAR_BOX_Y - 1, AVATAR_BOX_W + 2, AVATAR_BOX_H + 2, 4, TFT_GREEN);
  tft.setTextColor(TFT_WHITE, tft.color565(24, 32, 47));
  tft.setTextSize(2);
  tft.drawCentreString(String(initialChar), AVATAR_BOX_X + AVATAR_BOX_W / 2, AVATAR_BOX_Y + 26, 4);
  tft.setTextSize(1);

  // 4. Ho ten sinh vien ben phai
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  drawFullscreenName(asciiName);

  // 5. MSSV
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString("MSSV: " + mssv, 122, 115, 2);

  // 6. Duong ke phan cach ngang
  tft.drawFastHLine(10, 160, 300, TFT_DARKGREY);

  // 7. Footer trang thai
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawString("GHI NHAN: CO MAT HOP LE", 16, 172, 2);

  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawString("He thong LH-NaviX Kiosk", 16, 202, 2);
  tft.drawRightString("Tro lai QR...", 304, 202, 2);
}

// Generated portraits are baseline JPEGs <=100x100 stored in flash.
// Return the actual decoder result so the caller can restore initials on failure.
inline bool drawCheckinAvatar(const uint8_t* jpgData, size_t jpgLen) {
  uint16_t w = 0, h = 0;
  JRESULT header = TJpgDec.getJpgSize(&w, &h, jpgData, jpgLen);
  if (header != JDR_OK || w == 0 || h == 0 || w > AVATAR_BOX_W || h > AVATAR_BOX_H) {
    Serial.printf("[AVT] Invalid thumbnail: result=%d w=%u h=%u\n", int(header), w, h);
    return false;
  }
  TJpgDec.setJpgScale(1);
  int drawX = AVATAR_BOX_X + (AVATAR_BOX_W - w) / 2;
  int drawY = AVATAR_BOX_Y + (AVATAR_BOX_H - h) / 2;
  tft.fillRect(AVATAR_BOX_X, AVATAR_BOX_Y, AVATAR_BOX_W, AVATAR_BOX_H, TFT_BLACK);
  JRESULT decoded = TJpgDec.drawJpg(drawX, drawY, jpgData, jpgLen);
  Serial.printf("[AVT] JPEG decode result=%d\n", int(decoded));
  tft.drawRoundRect(AVATAR_BOX_X - 1, AVATAR_BOX_Y - 1, AVATAR_BOX_W + 2, AVATAR_BOX_H + 2, 4, TFT_GREEN);
  return decoded == JDR_OK;
}

// =================================================================================
// BỐ CỤC CHIA ĐÔI MÀN HÌNH KIOSK LCD 320x240 (SPLIT-SCREEN: CAMERA TRÁI, QR PHẢI)
// =================================================================================
#define SPLIT_CAM_X 0
#define SPLIT_CAM_Y 0
#define SPLIT_CAM_W 160
#define SPLIT_CAM_H 240

#define SPLIT_QR_X 160
#define SPLIT_QR_Y 0
#define SPLIT_QR_W 160
#define SPLIT_QR_H 240

#define CAM_BOX_X 20
#define CAM_BOX_Y 52
#define CAM_BOX_W 120
#define CAM_BOX_H 80

// Callback ve QR vung ben phai 160px
inline void displaySplitQrCallback(esp_qrcode_handle_t qrcode) {
  int size = esp_qrcode_get_size(qrcode);
  
  int maxBox = 135;
  int scale = maxBox / size;
  if (scale < 1) scale = 1;
  
  int qrPixelSize = size * scale;
  int offsetX = SPLIT_QR_X + (SPLIT_QR_W - qrPixelSize) / 2;
  int offsetY = 46 + (130 - qrPixelSize) / 2;

  // 1. To nen den nua ben phai
  tft.fillRect(SPLIT_QR_X, SPLIT_QR_Y, SPLIT_QR_W, SPLIT_QR_H, TFT_BLACK);
  
  // 2. Tieu de nua ben phai
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawCentreString("QUET MA QR", SPLIT_QR_X + SPLIT_QR_W / 2, 10, 2);

  // 3. Vien trang bao quanh QR (Quiet Zone)
  int pad = 8;
  tft.fillRect(offsetX - pad, offsetY - pad, qrPixelSize + pad * 2, qrPixelSize + pad * 2, TFT_WHITE);

  // 4. Ve tung module QR
  for (int y = 0; y < size; y++) {
    int py = offsetY + y * scale;
    for (int x = 0; x < size; x++) {
      if (esp_qrcode_get_module(qrcode, x, y)) {
        tft.fillRect(offsetX + x * scale, py, scale, scale, TFT_BLACK);
      }
    }
  }

  // 5. Huong dan ben duoi QR
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawCentreString("Dung dien thoai", SPLIT_QR_X + SPLIT_QR_W / 2, 190, 2);
  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawCentreString("Doi ma: 15s", SPLIT_QR_X + SPLIT_QR_W / 2, 214, 1);

  // 6. Duong phan cach doc giua 2 nua man hinh
  tft.drawFastVLine(SPLIT_QR_X - 1, 0, 240, TFT_NAVY);
}

inline void drawSplitQRCode(String text) {
  esp_qrcode_config_t cfg = {
    .display_func = displaySplitQrCallback,
    .max_qrcode_version = 10,
    .qrcode_ecc_level = ESP_QRCODE_ECC_MED
  };
  esp_qrcode_generate(&cfg, text.c_str());
}

// Ve khung giao dien ban dau cua vung Camera ben trai
inline void drawSplitCameraLayout() {
  tft.fillRect(SPLIT_CAM_X, SPLIT_CAM_Y, SPLIT_CAM_W, SPLIT_CAM_H, TFT_BLACK);
  
  // Tieu de
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawCentreString("CAMERA AI", SPLIT_CAM_X + SPLIT_CAM_W / 2, 10, 2);
  
  // Khung ngam cho camera (120x80)
  tft.drawRect(CAM_BOX_X - 1, CAM_BOX_Y - 1, CAM_BOX_W + 2, CAM_BOX_H + 2, TFT_DARKGREY);
  
  // Huong dan ben duoi
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.drawCentreString("Nhin vao cam", SPLIT_CAM_X + SPLIT_CAM_W / 2, 190, 2);
  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawCentreString("Canh giua khuon mat", SPLIT_CAM_X + SPLIT_CAM_W / 2, 214, 1);
  
  // Duong ke doc phan cach
  tft.drawFastVLine(159, 0, 240, TFT_NAVY);
}

// Ve frame JPEG tu camera len vung ben trai (chi goi tu main loop!)
inline bool drawSplitCameraFrame(const uint8_t* jpgData, size_t jpgSize, bool isSuccess = false) {
  if (!jpgData || jpgSize == 0) return false;
  
  TJpgDec.setJpgScale(4);
  TJpgDec.setSwapBytes(true);
  TJpgDec.setCallback(tft_output);
  
  JRESULT res = TJpgDec.drawJpg(CAM_BOX_X, CAM_BOX_Y, jpgData, jpgSize);
  
  uint16_t cColor = isSuccess ? TFT_GREEN : ((res == JDR_OK) ? TFT_CYAN : TFT_RED);
  int bx = CAM_BOX_X, by = CAM_BOX_Y, bw = CAM_BOX_W, bh = CAM_BOX_H;
  int blen = 8;
  tft.drawFastHLine(bx, by, blen, cColor);
  tft.drawFastVLine(bx, by, blen, cColor);
  tft.drawFastHLine(bx + bw - blen, by, blen, cColor);
  tft.drawFastVLine(bx + bw - 1, by, blen, cColor);
  tft.drawFastHLine(bx, by + bh - 1, blen, cColor);
  tft.drawFastVLine(bx, by + bh - blen, blen, cColor);
  tft.drawFastHLine(bx + bw - blen, by + bh - 1, blen, cColor);
  tft.drawFastVLine(bx + bw - 1, by + bh - blen, blen, cColor);
  
  return (res == JDR_OK);
}

// Ve thong bao diem danh thanh cong o nua duoi ben trai (khong de len Live Camera!)
inline void drawSplitCheckinBanner(String name, String mssv) {
  name = nameForTft(name);
  mssv.trim();
  
  // Xoa phan duoi ben trai (Y: 136..239, cao 104px)
  tft.fillRect(SPLIT_CAM_X, 136, SPLIT_CAM_W - 1, 104, TFT_BLACK);
  
  // 1. Tag thong bao xanh la
  tft.fillRoundRect(SPLIT_CAM_X + 8, 138, SPLIT_CAM_W - 16, 22, 3, TFT_DARKGREEN);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREEN);
  tft.drawCentreString("DA DIEM DANH", SPLIT_CAM_X + SPLIT_CAM_W / 2, 142, 2);
  
  // 2. Ten sinh vien (mau vang, wrap toi da 2 dong)
  String lines[2];
  int lineCount = 0;
  wrapFullscreenName(name, 2, lines, 2, SPLIT_CAM_W - 16, lineCount);
  
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  int startY = 164;
  for (int i = 0; i < lineCount; i++) {
    tft.drawCentreString(lines[i], SPLIT_CAM_X + SPLIT_CAM_W / 2, startY + i * 18, 2);
  }
  
  // 3. MSSV (mau cyan)
  int mssvY = startY + lineCount * 18;
  if (mssvY > 200) mssvY = 200;
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawCentreString(mssv, SPLIT_CAM_X + SPLIT_CAM_W / 2, mssvY, 2);
  
  // 4. Trang thai hop le o day man hinh
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawCentreString("Xac nhan hop le", SPLIT_CAM_X + SPLIT_CAM_W / 2, 222, 1);
  
  // Duong phan cach doc giua 2 nua chuyen xanh bao hieu
  tft.drawFastVLine(159, 0, 240, TFT_GREEN);
}

// Khoi phuc banner huong dan nua duoi ben trai ve trang thai binh thuong
inline void drawSplitCameraIdleBanner() {
  tft.fillRect(SPLIT_CAM_X, 136, SPLIT_CAM_W - 1, 104, TFT_BLACK);
  
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.drawCentreString("Nhin vao cam", SPLIT_CAM_X + SPLIT_CAM_W / 2, 175, 2);
  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawCentreString("Canh giua khuon mat", SPLIT_CAM_X + SPLIT_CAM_W / 2, 202, 1);
  
  tft.drawFastVLine(159, 0, 240, TFT_NAVY);
}

// Ve thong bao diem danh thanh cong tren nua ben trai (chuyen tiep sang banner de khong chan camera)
inline void drawSplitCheckinNotice(String name, String mssv) {
  drawSplitCheckinBanner(name, mssv);
}