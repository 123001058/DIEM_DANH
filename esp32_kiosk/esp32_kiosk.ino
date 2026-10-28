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

// 2. Thong tin Camera ESP32-CAM noi bo (cong 80: /capture)
const char* esp_cam_ip = "192.168.2.169";

// 3. Thong tin Supabase Cloud
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

// Buffer chua anh chup tu Camera (Core 0 tai vao, Core 1 doc ve)
#define CAM_BUF_SIZE 40960
uint8_t camBuffer[CAM_BUF_SIZE];
size_t camBufferSize = 0;
volatile bool newCamFrameReady = false;
volatile bool isCamFetching = false;
TaskHandle_t camTaskHandle = NULL;

void drawNoOpenSession() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("CHUA MO PHIEN", tft.width() / 2, 90, 2);
  tft.drawCentreString("DIEM DANH", tft.width() / 2, 118, 2);
}

// Task mang FreeRTOS chay tren Core 0: Keo anh tu /capture cong 80
// TUYET DOI KHONG goi lenh ve tft.* hoac TJpgDec.* trong task nay!
void cameraCaptureWorker(void* pvParameters) {
  WiFiClient camClient;
  HTTPClient camHttp;
  camClient.setTimeout(600);

  while (true) {
    if (WiFi.status() == WL_CONNECTED && !newCamFrameReady && !checkinFullscreenVisible) {
      isCamFetching = true;
      String camUrl = String("http://") + esp_cam_ip + "/capture";
      camHttp.begin(camClient, camUrl);
      camHttp.setTimeout(800);
      
      int code = camHttp.GET();
      if (code == HTTP_CODE_OK) {
        int len = camHttp.getSize();
        if (len > 0 && len <= CAM_BUF_SIZE) {
          WiFiClient* stream = camHttp.getStreamPtr();
          size_t bytesRead = 0;
          uint32_t startRead = millis();
          while (camHttp.connected() && bytesRead < len && (millis() - startRead < 1000)) {
            size_t avail = stream->available();
            if (avail) {
              size_t toRead = (avail > (len - bytesRead)) ? (len - bytesRead) : avail;
              stream->readBytes(camBuffer + bytesRead, toRead);
              bytesRead += toRead;
            } else {
              vTaskDelay(pdMS_TO_TICKS(5));
            }
          }
          if (bytesRead == len) {
            camBufferSize = bytesRead;
            newCamFrameReady = true; // Bao cho main loop Core 1 ve
          }
        }
      }
      camHttp.end();
      isCamFetching = false;
    }
    // Gioi han toc do: Nghi 300ms giua cac lan chup (~3 FPS) de khong lam nghen ESP32-CAM
    vTaskDelay(pdMS_TO_TICKS(300));
  }
}

void fetchQRCode() {
  if (WiFi.status() != WL_CONNECTED) return;
  uint32_t pollStarted = millis();

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
    uint32_t pollElapsed = millis() - pollStarted;
    
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
        drawSplitCameraLayout();
      }

      // Phat hien luot diem danh moi
      if (!newSession && latestCheckinId.length() > 0 && latestCheckinId != lastCheckinId) {
        lastCheckinId = latestCheckinId;
        if (latestCheckinName.length() > 0) {
          Serial.println("[KIOSK] Vua diem danh: " + latestCheckinName + " (" + latestCheckinMssv + ")");
          latestCheckinMssv.trim();
          
          // Ve thong bao len nua ben trai (vung Camera) trong 2.5 giay
          drawSplitCheckinNotice(latestCheckinName, latestCheckinMssv);
          checkinFullscreenVisible = true;
          checkinFullscreenUntil = millis() + 2500;
          
          Serial.printf("[KIOSK TIMING] event=%s rpc_ms=%lu source=split\n",
                        latestCheckinId.c_str(), (unsigned long)pollElapsed);
        }
      }

      // Cap nhat QR o nua ben phai
      if (qrToken != currentQrToken) {
        currentQrToken = qrToken;
        currentQrText = String(web_domain) + "/checkin.html?t=" + qrToken;
        Serial.println("[KIOSK] Co ma QR moi: " + currentQrText);
        drawSplitQRCode(currentQrText);
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
  tft.invertDisplay(true); // Man hinh IPS
  initJpgDecoder();
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("Ket noi WiFi...", 10, 10, 2);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { 
    delay(500); 
    Serial.print("."); 
  }
  
  client.setInsecure();

  Serial.println("[KIOSK] WiFi OK! Khoi tao giao dien chia doi (Split-Screen)...");
  
  // Ve khung giao dien ban dau
  drawSplitCameraLayout();

  // Khoi tao task keo anh Camera chay tren Core 0
  xTaskCreatePinnedToCore(
    cameraCaptureWorker,
    "CamWorker",
    4096,
    NULL,
    1,
    &camTaskHandle,
    0 // Core 0
  );

  Serial.println("[KIOSK] Da kich hoat Camera Worker tren Core 0!");
}

void loop() {
  uint32_t now = millis();

  // 1. Ve frame Camera moi len nua ben trai (Chi main loop Core 1 moi duoc goi!)
  if (newCamFrameReady && !checkinFullscreenVisible) {
    drawSplitCameraFrame(camBuffer, camBufferSize);
    newCamFrameReady = false;
  }

  // 2. Polling Supabase moi 1000ms
  if (now - lastPollMs >= 1000) {
    lastPollMs = now;
    fetchQRCode();
  }

  now = millis();

  // 3. Khi het 2.5 giay thong bao diem danh: Khoi phuc lai khung Camera soi guong
  if (checkinFullscreenVisible && static_cast<int32_t>(now - checkinFullscreenUntil) >= 0) {
    checkinFullscreenVisible = false;
    Serial.println("[KIOSK] Het 2.5s: Khoi phuc Live Camera");
    drawSplitCameraLayout();
  }

  delay(15);
}
