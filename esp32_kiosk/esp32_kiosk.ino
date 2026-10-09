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
      
      if (qrToken != currentQrToken) {
        currentQrToken = qrToken;
        String qrString = String(web_domain) + "/checkin.html?s=" + sessionId + "&t=" + qrToken;
        
        Serial.println("Co ma QR moi: " + qrString);
        drawQRCode(qrString); 
      }
    } else {
      if (currentQrToken != "") {
        Serial.println("Chua mo phien diem danh");
        tft.fillScreen(TFT_BLACK);
        tft.setTextColor(TFT_WHITE);
        tft.drawString("CHUA MO PHIEN DIEM DANH", 10, 50, 2);
        currentQrToken = ""; 
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
  delay(1000); // 1 giay kiem tra 1 lan
}
