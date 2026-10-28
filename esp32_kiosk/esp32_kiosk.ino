#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include <TJpg_Decoder.h>
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

bool checkinFullscreenVisible = false;
bool noOpenSessionVisible = false;
uint32_t checkinFullscreenUntil = 0;
uint32_t lastPollMs = 0;
bool avatarDrawn = false;

// Buffer 48 KB chua anh JPEG avatar (anh tren web thuong tu 20KB den 45KB)
uint8_t avatarBuffer[49152];
size_t avatarBufferSize = 0;

// Struct yeu cau tai anh va FreeRTOS Queue de dong bo luong tuyet doi giua Core 1 va Core 0
struct AvatarDownloadMsg {
  char checkinId[64];
  char url[256];
};

QueueHandle_t avatarQueue = NULL;
portMUX_TYPE avatarMux = portMUX_INITIALIZER_UNLOCKED;
char sharedLoadedCheckinId[64] = "";
volatile bool sharedAvatarReady = false;
TaskHandle_t avatarWorkerTaskHandle = NULL;

void drawNoOpenSession() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("CHUA MO PHIEN", tft.width() / 2, 90, 2);
  tft.drawCentreString("DIEM DANH", tft.width() / 2, 118, 2);
}

// Worker Task thuong truc tren Core 0: Dong bo bang FreeRTOS Queue va Critical Section
void avatarWorkerTask(void* param) {
  AvatarDownloadMsg currentMsg;

  for (;;) {
    // Cho yeu cau moi tu queue (cho vo han, zero CPU spinning)
    if (xQueueReceive(avatarQueue, &currentMsg, portMAX_DELAY) != pdTRUE) {
      continue;
    }

    if (strlen(currentMsg.url) == 0 ||
        (strncmp(currentMsg.url, "http://", 7) != 0 && strncmp(currentMsg.url, "https://", 8) != 0)) {
      continue;
    }

    WiFiClientSecure avtClient;
    avtClient.setInsecure();
    avtClient.setTimeout(1000); // 1.0s read/write timeout

    HTTPClient avtHttp;
    avtHttp.setConnectTimeout(1000); // 1.0s TCP/TLS connection timeout
    avtHttp.setTimeout(1000);        // 1.0s HTTP response timeout

    uint32_t reqStart = millis();
    if (avtHttp.begin(avtClient, currentMsg.url)) {
      int code = avtHttp.GET();

      if (code == HTTP_CODE_OK) {
        int len = avtHttp.getSize();
        if (len > 0 && len <= static_cast<int>(sizeof(avatarBuffer))) {
          WiFiClient* stream = avtHttp.getStreamPtr();
          size_t bytesRead = 0;

          // Doc du lieu va kiem tra ngat ngay neu co luot quet moi hon trong queue
          while (avtHttp.connected() && bytesRead < static_cast<size_t>(len) && (millis() - reqStart < 2000)) {
            // Neu co yeu cau moi hon vua den -> lap tuc bo anh cu de sang anh moi
            if (uxQueueMessagesWaiting(avatarQueue) > 0) {
              break;
            }

            size_t avail = stream->available();
            if (avail) {
              size_t toRead = ((static_cast<size_t>(len) - bytesRead) < avail) ? (static_cast<size_t>(len) - bytesRead) : avail;
              int r = stream->readBytes(avatarBuffer + bytesRead, toRead);
              if (r > 0) bytesRead += r;
            } else {
              vTaskDelay(5 / portTICK_PERIOD_MS);
            }
          }

          // Chi cap nhat ket qua neu doc tron ven va khong bi yeu cau moi chen ngang
          if (uxQueueMessagesWaiting(avatarQueue) == 0 && bytesRead == static_cast<size_t>(len)) {
            if (bytesRead >= 4 && avatarBuffer[0] == 0xFF && avatarBuffer[1] == 0xD8) {
              uint16_t w = 0, h = 0;
              if (TJpgDec.getJpgSize(&w, &h, avatarBuffer, bytesRead) == 0 &&
                  w >= 16 && h >= 16 && w <= 800 && h <= 800) {
                // Bao ve cap nhat du lieu bang Critical Section
                taskENTER_CRITICAL(&avatarMux);
                avatarBufferSize = bytesRead;
                strncpy(sharedLoadedCheckinId, currentMsg.checkinId, sizeof(sharedLoadedCheckinId) - 1);
                sharedLoadedCheckinId[sizeof(sharedLoadedCheckinId) - 1] = '\0';
                sharedAvatarReady = true;
                taskEXIT_CRITICAL(&avatarMux);
              }
            }
          }
        }
      }
      avtHttp.end();
    }

    // Do dac bo nho stack va heap that sau moi request
    UBaseType_t stackHighWaterMark = uxTaskGetStackHighWaterMark(NULL);
    Serial.printf("[AVT] Stack free: %u words (%u bytes) | Heap: %u bytes\n",
                  stackHighWaterMark, stackHighWaterMark * sizeof(StackType_t), ESP.getFreeHeap());
  }
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
      String latestCheckinAvatar = "";
      if (doc["last_checkin"].is<JsonObjectConst>()) {
        JsonObjectConst latestCheckin = doc["last_checkin"];
        if (latestCheckin["id"].is<String>()) latestCheckinId = latestCheckin["id"].as<String>();
        if (latestCheckin["name"].is<String>()) latestCheckinName = latestCheckin["name"].as<String>();
        if (latestCheckin["mssv"].is<String>()) latestCheckinMssv = latestCheckin["mssv"].as<String>();
        if (latestCheckin["avatar"].is<String>()) latestCheckinAvatar = latestCheckin["avatar"].as<String>();
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
          
          // 1. Ve ngay man hinh thong bao voi Initials Badge (zero latency fallback)
          drawCheckinFullscreen(latestCheckinName, latestCheckinMssv);
          checkinFullscreenVisible = true;
          checkinFullscreenUntil = millis() + 3500;
          avatarDrawn = false;
          
          // 2. Chuan hoa URL avatar: ho tro ca duong dan tuong doi lan tuyet doi
          String avtUrl = latestCheckinAvatar;
          avtUrl.trim();
          if (avtUrl.length() > 0) {
            if (!avtUrl.startsWith("http://") && !avtUrl.startsWith("https://")) {
              if (avtUrl.startsWith("/")) {
                avtUrl = String(web_domain) + avtUrl;
              } else {
                avtUrl = String(web_domain) + "/" + avtUrl;
              }
            }
          }

          // 3. Reset co avatar san sang va gui tin nhan vao FreeRTOS Queue
          taskENTER_CRITICAL(&avatarMux);
          sharedAvatarReady = false;
          sharedLoadedCheckinId[0] = '\0';
          taskEXIT_CRITICAL(&avatarMux);

          AvatarDownloadMsg msg;
          memset(&msg, 0, sizeof(msg));
          strncpy(msg.checkinId, latestCheckinId.c_str(), sizeof(msg.checkinId) - 1);
          strncpy(msg.url, avtUrl.c_str(), sizeof(msg.url) - 1);

          // xQueueOverwrite: Ghi de luon yeu cau moi nhat vao queue size 1
          if (avatarQueue != NULL) {
            xQueueOverwrite(avatarQueue, &msg);
          }
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

  // Khoi tao Queue kich thuoc 1 cho luot tai avatar moi nhat
  avatarQueue = xQueueCreate(1, sizeof(AvatarDownloadMsg));

  // Khoi tao Worker Task thuong truc tren Core 0 voi stack 8192 bytes
  xTaskCreatePinnedToCore(avatarWorkerTask, "avtWorker", 8192, NULL, 1, &avatarWorkerTaskHandle, 0);

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

  // 2. Kiem tra dong bo thread-safe: Neu anh avatar da duoc Worker Task tai ve hop le
  bool isReady = false;
  char readyId[64] = "";
  taskENTER_CRITICAL(&avatarMux);
  if (sharedAvatarReady) {
    isReady = true;
    strncpy(readyId, sharedLoadedCheckinId, sizeof(readyId) - 1);
    readyId[sizeof(readyId) - 1] = '\0';
  }
  taskEXIT_CRITICAL(&avatarMux);

  if (checkinFullscreenVisible && isReady && !avatarDrawn) {
    if (lastCheckinId.equals(readyId) && now < checkinFullscreenUntil) {
      drawCheckinAvatar(avatarBuffer, avatarBufferSize);
      avatarDrawn = true;
      Serial.println("Da ve anh avatar sinh vien thanh cong!");
    }
  }

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
