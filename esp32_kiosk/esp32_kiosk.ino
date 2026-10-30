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

// Trang thai hien thi tren LCD (Chi Core 1 xu ly)
bool checkinNoticeActive = false;
bool noOpenSessionVisible = false;
uint32_t checkinNoticeUntil = 0;

// Buffer anh Camera (Core 0 ghi vao, Core 1 doc ve)
#define CAM_BUF_SIZE 40960
uint8_t camBuffer[CAM_BUF_SIZE];
size_t camBufferSize = 0;
volatile bool newCamFrameReady = false;

// Bien dong bo giua Task Supabase (Core 0) va Task Ve LCD (Core 1)
// Dung mang char tinh de an toan 100%, khong dung cap phat dong (Heap Safe)
volatile bool pendingQrFlag = false;
char pendingQrText[128] = "";

volatile bool pendingCheckinFlag = false;
char pendingCheckinName[64] = "";
char pendingCheckinMssv[16] = "";

volatile bool pendingNoSessionFlag = false;

TaskHandle_t camTaskHandle = NULL;
TaskHandle_t supaTaskHandle = NULL;

void drawNoOpenSession() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("CHUA MO PHIEN", tft.width() / 2, 90, 2);
  tft.drawCentreString("DIEM DANH", tft.width() / 2, 118, 2);
}

// =============================================================================
// TASK 1 (Core 0): Keo anh Camera toc do cao (~8-10 FPS mượt mà)
// =============================================================================
void cameraCaptureWorker(void* pvParameters) {
  WiFiClient camClient;
  HTTPClient camHttp;
  camClient.setTimeout(400);

  // Bat HTTP Keep-Alive de khong ton thoi gian bat tay TCP lai moi frame
  camHttp.setReuse(true);

  while (true) {
    if (WiFi.status() == WL_CONNECTED && !newCamFrameReady) {
      String camUrl = String("http://") + esp_cam_ip + "/capture";
      camHttp.begin(camClient, camUrl);
      camHttp.setTimeout(500);
      
      int code = camHttp.GET();
      if (code == HTTP_CODE_OK) {
        int len = camHttp.getSize();
        if (len > 0 && len <= CAM_BUF_SIZE) {
          WiFiClient* stream = camHttp.getStreamPtr();
          size_t bytesRead = 0;
          uint32_t startRead = millis();
          while (camHttp.connected() && bytesRead < len && (millis() - startRead < 600)) {
            size_t avail = stream->available();
            if (avail) {
              size_t toRead = (avail > (len - bytesRead)) ? (len - bytesRead) : avail;
              stream->readBytes(camBuffer + bytesRead, toRead);
              bytesRead += toRead;
            } else {
              vTaskDelay(pdMS_TO_TICKS(2));
            }
          }
          if (bytesRead == len) {
            camBufferSize = bytesRead;
            newCamFrameReady = true; // Bao cho Core 1 ve ngay
          }
        }
      }
      camHttp.end();
    }
    // Nghi ngan 35ms giua cac frame (~10 FPS soi guong sieu muot, khong nong chip)
    vTaskDelay(pdMS_TO_TICKS(35));
  }
}

// =============================================================================
// TASK 2 (Core 0): Polling Supabase Cloud ngầm (Không làm đứng hình LCD)
// =============================================================================
void supabasePollWorker(void* pvParameters) {
  WiFiClientSecure client;
  HTTPClient http;
  client.setInsecure();
  client.setTimeout(2500);

  String currentSessionId = "";
  String currentQrToken = "";
  String lastCheckinId = "";

  while (true) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!http.connected()) {
        http.begin(client, supabase_url);
        http.setReuse(true);
        http.setTimeout(2500);
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
          }

          // Phat hien luot diem danh moi -> Gui tin hieu cho Core 1 ve
          if (!newSession && latestCheckinId.length() > 0 && latestCheckinId != lastCheckinId) {
            lastCheckinId = latestCheckinId;
            if (latestCheckinName.length() > 0) {
              Serial.println("[SUPABASE WORKER] Vua diem danh: " + latestCheckinName + " (" + latestCheckinMssv + ")");
              snprintf(pendingCheckinName, sizeof(pendingCheckinName), "%s", latestCheckinName.c_str());
              snprintf(pendingCheckinMssv, sizeof(pendingCheckinMssv), "%s", latestCheckinMssv.c_str());
              pendingCheckinFlag = true;
            }
          }

          // Co ma QR moi -> Gui tin hieu cho Core 1 ve
          if (qrToken != currentQrToken) {
            currentQrToken = qrToken;
            String qrUrl = String(web_domain) + "/checkin.html?t=" + qrToken;
            Serial.println("[SUPABASE WORKER] Co ma QR moi: " + qrUrl);
            snprintf(pendingQrText, sizeof(pendingQrText), "%s", qrUrl.c_str());
            pendingQrFlag = true;
          }
        } else {
          if (currentSessionId != "" || currentQrToken != "") {
            Serial.println("[SUPABASE WORKER] Chua mo phien diem danh");
            currentSessionId = "";
            currentQrToken = "";
            lastCheckinId = "";
            pendingNoSessionFlag = true;
          }
        }
      } else if (httpCode < 0) {
        http.end();
      }
    }
    // Polling moi 1000ms chay ngam tren Core 0
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

// =============================================================================
// SETUP: Khoi tao he thong tren Core 1
// =============================================================================
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
    delay(400); 
    Serial.print("."); 
  }

  Serial.println("\n[KIOSK] WiFi OK! Khoi tao giao dien chia doi...");
  drawSplitCameraLayout();

  // 1. Task keo anh Camera toc do cao tren Core 0 (4KB stack)
  xTaskCreatePinnedToCore(
    cameraCaptureWorker,
    "CamWorker",
    4096,
    NULL,
    1,
    &camTaskHandle,
    0
  );

  // 2. Task Polling Supabase chay ngam tren Core 0 (6KB stack)
  xTaskCreatePinnedToCore(
    supabasePollWorker,
    "SupaWorker",
    6144,
    NULL,
    1,
    &supaTaskHandle,
    0
  );

  Serial.println("[KIOSK] Da kich hoat 2 Task ngam tren Core 0! Core 1 chuyen ve 100%!");
}

// =============================================================================
// MAIN LOOP: Chay tren Core 1 - LA NOI DUY NHAT DUOC PHEP GOI TFT VE MAN HINH
// =============================================================================
void loop() {
  uint32_t now = millis();

  // 1. Neu co su kien diem danh moi: Hien thi banner nua duoi ben trai trong 1.5s (khong che khuon mat)
  if (pendingCheckinFlag) {
    pendingCheckinFlag = false;
    drawSplitCheckinBanner(String(pendingCheckinName), String(pendingCheckinMssv));
    checkinNoticeActive = true;
    checkinNoticeUntil = now + 1500; // 1.5s gon gang, khong de len camera
  }

  // 2. Neu co ma QR moi: Cap nhat ngay tren nua phai (khong anh huong nua trai)
  if (pendingQrFlag) {
    pendingQrFlag = false;
    drawSplitQRCode(String(pendingQrText));
  }

  // 3. Neu co frame Camera moi tu Core 0: Luon ve ngay len nua trai (sieu muot, ~10 FPS khong bi chan)
  if (newCamFrameReady) {
    drawSplitCameraFrame(camBuffer, camBufferSize, checkinNoticeActive);
    newCamFrameReady = false;
  }

  // 4. Khi het 1.5 giay thong bao diem danh: Khoi phuc banner huong dan (camera van tiep tuc chay)
  if (checkinNoticeActive && static_cast<int32_t>(now - checkinNoticeUntil) >= 0) {
    checkinNoticeActive = false;
    drawSplitCameraIdleBanner();
  }

  // 5. Khi phien dong
  if (pendingNoSessionFlag) {
    pendingNoSessionFlag = false;
    if (!noOpenSessionVisible) {
      noOpenSessionVisible = true;
      drawNoOpenSession();
    }
  }

  delay(8); // Vong lap chay lien tuc o tan so >60Hz de ve khong tre
}
