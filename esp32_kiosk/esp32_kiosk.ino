#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include "qrcode.h"
#include "qr_display.h"

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
bool checkinNameVisible = false;
bool noOpenSessionVisible = false;
uint32_t checkinNameUntil = 0;

void drawNoOpenSession() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("CHUA MO PHIEN", tft.width() / 2, 90, 2);
  tft.drawCentreString("DIEM DANH", tft.width() / 2, 118, 2);
}

void fetchQRCode() {
  if (WiFi.status() != WL_CONNECTED) return;

  // Giu ket noi Keep-Alive: Khong phai bat tay SSL lai tu dau
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
      if (doc["last_checkin"].is<JsonObjectConst>()) {
        JsonObjectConst latestCheckin = doc["last_checkin"];
        if (latestCheckin["id"].is<String>()) latestCheckinId = latestCheckin["id"].as<String>();
        if (latestCheckin["name"].is<String>()) latestCheckinName = latestCheckin["name"].as<String>();
      }

      bool newSession = (sessionId != currentSessionId);
      if (newSession) {
        currentSessionId = sessionId;
        currentQrToken = "";
        lastCheckinId = latestCheckinId; // Bỏ qua lượt cũ lúc kiosk mới khởi động/mở phiên.
        checkinNameVisible = false;
        noOpenSessionVisible = false;
      }

      if (!newSession && latestCheckinId.length() > 0 && latestCheckinId != lastCheckinId) {
        lastCheckinId = latestCheckinId;
        if (latestCheckinName.length() > 0) {
          Serial.println("Vua diem danh: " + latestCheckinName);
          drawCheckinName(latestCheckinName);
          checkinNameVisible = true;
          checkinNameUntil = millis() + 3000;
        }
      }

      if (qrToken != currentQrToken) {
        currentQrToken = qrToken;
        // Rut ngan URL: bo tham so s= (UUID 36 ky tu) vi checkin.html tu dong load session_id dang mo.
        // Giu nguyen kich thuoc QR de camera dien thoai quet nhanh.
        currentQrText = String(web_domain) + "/checkin.html?t=" + qrToken;
        Serial.println("Co ma QR moi: " + currentQrText);
        if (!checkinNameVisible) drawQRCode(currentQrText);
      }
    } else {
      if (currentSessionId != "" || currentQrToken != "" || !noOpenSessionVisible) {
        Serial.println("Chua mo phien diem danh");
        currentSessionId = "";
        currentQrToken = "";
        currentQrText = "";
        lastCheckinId = "";
        checkinNameVisible = false;
        noOpenSessionVisible = true;
        drawNoOpenSession();
      }
    }
  } else if (httpCode < 0) {
    // Neu rot mang hoac loi ket noi, reset lai socket
    http.end();
  }
}

void setup() {
  Serial.begin(115200);
  
  tft.init();
  tft.setRotation(1);
  tft.invertDisplay(true); // Chuyen tu am ban (nen den) sang duong ban (NEN SANG TRANG, MA DEN)
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("Ket noi WiFi...", 10, 10, 2);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { 
    delay(500); 
    Serial.print("."); 
  }
  
  // Bo qua xac thuc chung chi de ESP32 xu ly HTTPS sieu nhanh
  client.setInsecure();

  tft.fillScreen(TFT_BLACK);
  tft.drawString("WiFi OK! Dang lay QR...", 10, 10, 2);
}

void loop() {
  fetchQRCode();
  if (checkinNameVisible && static_cast<int32_t>(millis() - checkinNameUntil) >= 0) {
    checkinNameVisible = false;
    if (currentQrText.length() > 0) drawQRCode(currentQrText);
  }
  delay(1000); // 1 giay kiem tra 1 lan (muc on dinh chuan da chay duoc chu)
}
