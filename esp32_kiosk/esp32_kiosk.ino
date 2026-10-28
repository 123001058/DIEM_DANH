#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include <TJpg_Decoder.h>
#include "qrcode.h"
#include "qr_display.h"
#include "kiosk_avatars.h"

// 1. Thong tin WiFi & Web
const char* ssid = "Robocon Sinh Vien";
const char* password = "tamsotam";
const char* web_domain = "https://123001058.github.io/DIEM_DANH";

// 2. Thong tin Supabase
const char* supabase_url = "https://nhjkpknhybenkxwadvzv.supabase.co/rest/v1/rpc/get_open_session";
const char* supabase_key = "sb_publishable_h1nRwciz_rOgnD88ZCnkIw_v0Czf1L8";

TFT_eSPI tft = TFT_eSPI(); 
WiFiClientSecure client;
HTTPClient http;

String currentQrToken = "";
String currentSessionId = "";
String currentQrText = "";
String lastCheckinId = "";

bool checkinFullscreenVisible = false;
bool noOpenSessionVisible = false;
uint32_t checkinFullscreenUntil = 0;
uint32_t lastPollMs = 0;

void drawNoOpenSession() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("CHUA MO PHIEN", tft.width() / 2, 90, 2);
  tft.drawCentreString("DIEM DANH", tft.width() / 2, 118, 2);
}

void fetchQRCode() {
  if (WiFi.status() != WL_CONNECTED) return;

  if (!http.connected()) {
    http.begin(client, supabase_url);
    http.setReuse(true);
    http.setTimeout(2000);
  }

  http.addHeader("apikey", supabase_key);
  http.addHeader("Authorization", String("Bearer ") + supabase_key);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST("{}"); 

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    
    JsonDocument doc;
    deserializeJson(doc, payload);
    
    if (doc["id"].is<String>() && doc["qr_token"].is<String>()) {
      String sessionId = doc["id"].as<String>();
      String qrToken = doc["qr_token"].as<String>();

      String latestCheckinId = "";
      String latestCheckinName = "";
      String latestCheckinMssv = "";
      if (doc["last_checkin"].is<JsonObjectConst>()) {
        JsonObjectConst latestCheckin = doc["last_checkin"];
        if (latestCheckin["id"].is<String>()) latestCheckinId = latestCheckin["id"].as<String>();
        if (latestCheckin["name"].is<String>()) latestCheckinName = latestCheckin["name"].as<String>();
        if (latestCheckin["mssv"].is<String>()) latestCheckinMssv = latestCheckin["mssv"].as<String>();
      }

      bool newSession = (sessionId != currentSessionId);
      if (newSession) {
        currentSessionId = sessionId;
        currentQrToken = "";
        lastCheckinId = latestCheckinId;
        checkinFullscreenVisible = false;
        noOpenSessionVisible = false;
        clearCheckinNotice();
      }

      // Phat hien luot diem danh moi
      if (!newSession && latestCheckinId.length() > 0 && latestCheckinId != lastCheckinId) {
        lastCheckinId = latestCheckinId;
        if (latestCheckinName.length() > 0) {
          Serial.println("Vua diem danh: " + latestCheckinName + " (" + latestCheckinMssv + ")");
          
          // Anh duoc tao tu images/faces va nap san vao flash theo dung MSSV.
          // Chi main loop giai ma/ve: khong cho HTTPS va khong chia se decoder giua hai core.
          latestCheckinMssv.trim();
          drawCheckinFullscreen(latestCheckinName, latestCheckinMssv);
          const KioskAvatar* avatar = findKioskAvatar(latestCheckinMssv.c_str());
          if (avatar != nullptr) {
            bool drawn = drawCheckinAvatar(avatar->data, avatar->size);
            Serial.printf("[AVT FLASH] MSSV=%s bytes=%u decoded=%s\n",
                          avatar->mssv, avatar->size, drawn ? "OK" : "FAILED");
            if (!drawn) drawCheckinFullscreen(latestCheckinName, latestCheckinMssv);
          } else {
            Serial.println("[AVT FLASH] Chua co anh cho MSSV: " + latestCheckinMssv);
          }
          checkinFullscreenVisible = true;
          // Bat dau dem sau khi anh va ten da ve xong, ke ca quet lai cung sinh vien.
          checkinFullscreenUntil = millis() + 3500;
        }
      }

      if (qrToken != currentQrToken) {
        currentQrToken = qrToken;
        currentQrText = String(web_domain) + "/checkin.html?t=" + qrToken;
        Serial.println("Co ma QR moi: " + currentQrText);
        if (!checkinFullscreenVisible) {
          drawQRCode(currentQrText);
          clearCheckinNotice();
        }
      }
    } else {
      if (currentSessionId != "" || currentQrToken != "" || !noOpenSessionVisible) {
        Serial.println("Chua mo phien diem danh");
        currentSessionId = "";
        currentQrToken = "";
        currentQrText = "";
        lastCheckinId = "";
        checkinFullscreenVisible = false;
        noOpenSessionVisible = true;
        drawNoOpenSession();
      }
    }
  } else if (httpCode < 0) {
    http.end();
  }
}

void setup() {
  Serial.begin(115200);
  
  tft.init();
  tft.setRotation(1);
  tft.invertDisplay(true); // Man hinh IPS duong ban
  initJpgDecoder();        // Khoi tao TJpg_Decoder voi RGB565 swapBytes va callback
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("Ket noi WiFi...", 10, 10, 2);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { 
    delay(500); 
    Serial.print("."); 
  }
  
  client.setInsecure();

  Serial.printf("[KIOSK] Avatar FLASH v1: %u portraits\n",
                unsigned(sizeof(kioskAvatars) / sizeof(kioskAvatars[0])));

  tft.fillScreen(TFT_BLACK);
  tft.drawString("WiFi OK! Dang lay QR...", 10, 10, 2);
}

void loop() {
  uint32_t now = millis();

  // 1. Polling Supabase moi 1000ms
  if (now - lastPollMs >= 1000) {
    lastPollMs = now;
    fetchQRCode();
  }

  // fetchQRCode co the mat thoi gian; cap nhat dong ho truoc khi xet het han.
  now = millis();

  // 3. Khi het thoi gian 3.5 giay: Tu dong ve lai QR moi nhat va khoi phuc man hinh
  if (checkinFullscreenVisible && static_cast<int32_t>(now - checkinFullscreenUntil) >= 0) {
    checkinFullscreenVisible = false;
    Serial.println("Het 3.5s: Khoi phuc ma QR");
    if (currentQrText.length() > 0) {
      drawQRCode(currentQrText);
      clearCheckinNotice();
    } else if (noOpenSessionVisible) {
      drawNoOpenSession();
    }
  }

  delay(20);
}
