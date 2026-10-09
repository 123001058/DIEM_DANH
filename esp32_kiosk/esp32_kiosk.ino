#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include <qrcode.h>

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

// Buffer chua du lieu QR (Version 10 du cho URL dai len toi 170 ky tu)
QRCode qrcode;
uint8_t qrcodeData[qrcode_getBufferSize(10)];

// Ham ve QR Code phong to 100% kịch trần chieu cao man hinh (240px)
void drawQRCode(String text) {
  // Chon version nho nhat phu hop voi do dai URL de o vuong to nhat, de quet nhat
  int version = 4;
  if (text.length() > 50) version = 6;
  if (text.length() > 90) version = 8;
  if (text.length() > 130) version = 10;

  qrcode_initText(&qrcode, qrcodeData, version, ECC_LOW, text.c_str());

  int size = qrcode.size;
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
      if (qrcode_getModule(&qrcode, x, y)) {
        int x0 = offsetX + (x * targetDim) / size;
        int x1 = offsetX + ((x + 1) * targetDim) / size;
        int w = x1 - x0;
        tft.fillRect(x0, y0, w, h, TFT_BLACK);
      }
    }
  }
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
