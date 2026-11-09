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

// 2. Thong tin Camera ESP32-CAM noi bo (82: preview, 80: capture du phong)
const char* esp_cam_ip = "192.168.2.168";

// 3. Thong tin Supabase Cloud
const char* supabase_url = "https://nhjkpknhybenkxwadvzv.supabase.co/rest/v1/rpc/get_open_session";
const char* supabase_key = "sb_publishable_h1nRwciz_rOgnD88ZCnkIw_v0Czf1L8";

TFT_eSPI tft = TFT_eSPI(); 

// Trang thai hien thi tren LCD (Chi Core 1 xu ly)
bool checkinNoticeActive = false;
bool noOpenSessionVisible = false;
uint32_t checkinNoticeUntil = 0;

// =============================================================================
// BO DEM KEP PING-PONG (A/B) & DO DAC HIEU NANG CAMERA (Step 1 + Step 2)
// Core 0 tai anh vao Buffer B trong luc Core 1 giai ma & ve anh tu Buffer A.
// Buffer A dat tinh trong .bss, Buffer B cap phat 1 lan duy nhat luc boot trong Heap
// de tranh tran vung nho tinh dram0_0_seg cua linker ma van giu nguyen 40KB/buffer.
// =============================================================================
#define CAM_BUF_SIZE 40960
uint8_t camBufA[CAM_BUF_SIZE];
uint8_t* camBuf[2] = { camBufA, NULL };
size_t camLen[2] = {0, 0};
volatile int latestReadyIdx = -1; // -1: chua co anh moi; 0 hoac 1: index buffer chua anh moi nhat
volatile int drawingIdx = -1;     // -1: Core 1 dang ranh; 0 hoac 1: index buffer Core 1 dang ve
portMUX_TYPE camMux = portMUX_INITIALIZER_UNLOCKED;

// Thong so do dac hieu nang (chi luu trong RAM & in ra Serial moi 5s, KHONG ve de len LCD)
volatile uint32_t perfFetchSumUs = 0;
volatile uint32_t perfFetchMaxUs = 0;
volatile uint32_t perfFetchCount = 0;
volatile uint32_t perfDroppedFrames = 0;

uint32_t perfDrawSumUs = 0;
uint32_t perfDrawMaxUs = 0;
uint32_t perfDrawCount = 0;
uint32_t lastPerfReportMs = 0;

// Bien dong bo giua Task Supabase (Core 0) va Task Ve LCD (Core 1)
// Dung mang char tinh de an toan 100%, khong dung cap phat dong (Heap Safe)
volatile bool pendingQrFlag = false;
char pendingQrText[128] = "";

volatile bool pendingCheckinFlag = false;
char pendingCheckinName[64] = "";
char pendingCheckinMssv[16] = "";

volatile bool pendingNoSessionFlag = false;
volatile bool isSessionOpen = false;
bool initialSessionChecked = false;

TaskHandle_t camTaskHandle = NULL;
TaskHandle_t supaTaskHandle = NULL;

void drawNoOpenSession() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("CHUA MO PHIEN", tft.width() / 2, 90, 2);
  tft.drawCentreString("DIEM DANH", tft.width() / 2, 118, 2);
}

// =============================================================================
// TASK 1 (Core 0): Keo anh Camera song song voi Bo dem kep Ping-Pong A/B
// =============================================================================
static constexpr uint32_t kPreviewFrameTimeoutMs = 1800;

// Cung mot han cho header va JPEG. Bo frame do dang ngay khi socket dong.
static size_t readPreviewBytes(WiFiClient& client, char* buffer, size_t len, uint32_t startedMs) {
  size_t received = 0;
  while (received < len && isSessionOpen && millis() - startedMs < kPreviewFrameTimeoutMs) {
    const int count = client.read(reinterpret_cast<uint8_t*>(buffer + received), len - received);
    if (count < 0) break;
    if (count > 0) {
      received += count;
      continue;
    }
    if (!client.connected() || WiFi.status() != WL_CONNECTED) break;
    vTaskDelay(1);
  }
  return received;
}

static size_t readPreviewPartSize(WiFiClient& client, uint32_t startedMs) {
  static const char prefix[] = "\r\n--lcdframe\r\nContent-Type: image/jpeg\r\nContent-Length: ";
  char received[sizeof(prefix) - 1];
  if (readPreviewBytes(client, received, sizeof(received), startedMs) != sizeof(received) ||
      memcmp(received, prefix, sizeof(received)) != 0) return 0;

  size_t len = 0;
  for (int digits = 0; digits <= 5; ++digits) {
    char ch;
    if (readPreviewBytes(client, &ch, 1, startedMs) != 1) return 0;
    if (ch == '\r') {
      char end[3];
      if (len && readPreviewBytes(client, end, sizeof(end), startedMs) == sizeof(end) &&
          memcmp(end, "\n\r\n", sizeof(end)) == 0) {
        return len;
      }
      return 0;
    }
    if (digits == 5 || ch < '0' || ch > '9') return 0;
    len = len * 10 + ch - '0';
    if (len > CAM_BUF_SIZE) return 0;
  }
  return 0;
}

void cameraCaptureWorker(void* pvParameters) {
  WiFiClient camClient;
  HTTPClient camHttp;
  // Gioi han thoi gian cho du lieu tiep theo, ke ca khi tong thoi gian tai anh dai hon.
  const uint32_t captureTimeoutMs = 3000;
  uint32_t lastErrorLogMs = 0;
  camHttp.setTimeout(captureTimeoutMs);
  const String camHost = String("http://") + esp_cam_ip;
  const String captureUrl = camHost + ":80/capture";
  const String previewUrl = camHost + ":82/stream";
  const String sleepUrl = camHost + ":80/power?mode=sleep";
  bool previewOpen = false;
  bool usedPreviewThisSession = false;
  bool previewSupported = false;
  int previewFailures = 0;
  constexpr int kPreviewFastRetries = 2;
  uint32_t nextPreviewMs = millis();

  while (true) {
    bool fetchedOk = false;

    // R4: Chi tai anh khi co phien diem danh mo.
    if (WiFi.status() == WL_CONNECTED && isSessionOpen) {
      if (!previewOpen && static_cast<int32_t>(millis() - nextPreviewMs) >= 0) {
        camClient.stop(); // Socket du phong co the van mo tren cong 80.
        camHttp.setReuse(false);
        camHttp.setConnectTimeout(1200);
        camHttp.setTimeout(kPreviewFrameTimeoutMs);
        previewOpen = camHttp.begin(camClient, previewUrl) && camHttp.GET() == HTTP_CODE_OK;
        if (previewOpen) {
          usedPreviewThisSession = true;
          previewSupported = true;
          camClient.setNoDelay(true);
          Serial.println("[CAM] LCD preview connected (:82/stream)");
        } else {
          camClient.stop();
          camHttp.end();
          // Uu tien noi lai luong da biet hoat dong, ke ca khi CAM vua khoi dong lai.
          if (previewSupported && previewFailures < kPreviewFastRetries) {
            ++previewFailures;
            vTaskDelay(pdMS_TO_TICKS(250));
            continue;
          }
          nextPreviewMs = millis() + 5000;
        }
      }
      if (!isSessionOpen || WiFi.status() != WL_CONNECTED) continue;

      // Chon buffer ghi (writeIdx) khong bao gio trung voi buffer Core 1 dang ve (drawingIdx)
      int writeIdx = -1;
      portENTER_CRITICAL(&camMux);
      if (!camBuf[1]) {
        if (drawingIdx == -1) writeIdx = 0;
      } else if (drawingIdx != -1) {
        writeIdx = 1 - drawingIdx;
      } else if (latestReadyIdx != -1) {
        writeIdx = 1 - latestReadyIdx;
      } else {
        writeIdx = 0;
      }
      // Neu buffer chuan bi ghi dang giu anh cu chua kip ve -> Bo anh cu truoc khi ghi de tranh race
      if (writeIdx >= 0 && latestReadyIdx == writeIdx) {
        latestReadyIdx = -1;
        perfDroppedFrames++;
      }
      portEXIT_CRITICAL(&camMux);
      if (writeIdx < 0) {
        vTaskDelay(pdMS_TO_TICKS(2));
        continue;
      }

      uint32_t tFetchStart = micros();
      const uint32_t frameStartedMs = millis();
      const bool readingPreview = previewOpen;
      int code = HTTP_CODE_OK;
      int len;
      if (readingPreview) {
        len = static_cast<int>(readPreviewPartSize(camClient, frameStartedMs));
      } else {
        camHttp.setReuse(true);
        camHttp.setConnectTimeout(5000);
        camHttp.setTimeout(captureTimeoutMs);
        code = camHttp.begin(camClient, captureUrl) ? camHttp.GET() : HTTPC_ERROR_NOT_CONNECTED;
        len = camHttp.getSize();
        if (code == HTTP_CODE_OK) camClient.setNoDelay(true);
      }
      size_t bytesRead = 0;
      if (code == HTTP_CODE_OK && len > 0 && len <= CAM_BUF_SIZE) {
        bytesRead = readingPreview
          ? readPreviewBytes(camClient, reinterpret_cast<char*>(camBuf[writeIdx]), len, frameStartedMs)
          : camClient.readBytes(camBuf[writeIdx], static_cast<size_t>(len));
        fetchedOk = bytesRead == static_cast<size_t>(len);
        if (fetchedOk && readingPreview) {
          const uint8_t* jpeg = camBuf[writeIdx];
          fetchedOk = len >= 4 && jpeg[0] == 0xff && jpeg[1] == 0xd8 &&
                      jpeg[len - 2] == 0xff && jpeg[len - 1] == 0xd9;
        }
      }
      if (fetchedOk && isSessionOpen && WiFi.status() == WL_CONNECTED) {
        if (readingPreview) previewFailures = 0;
        uint32_t fetchUs = micros() - tFetchStart;
        portENTER_CRITICAL(&camMux);
        if (latestReadyIdx != -1) {
          // Co anh cu o buffer kia chua kip ve -> Bo anh cu, uu tien anh moi nhat vua tai xong
          perfDroppedFrames++;
        }
        camLen[writeIdx] = bytesRead;
        latestReadyIdx = writeIdx; // Bao cho Core 1 ve ngay anh moi nhat nay
        perfFetchSumUs += fetchUs;
        if (fetchUs > perfFetchMaxUs) perfFetchMaxUs = fetchUs;
        perfFetchCount++;
        portEXIT_CRITICAL(&camMux);
      } else {
        // Body thieu/loi co the con byte tren socket, phai mo ket noi moi lan sau.
        camClient.stop();
        if (readingPreview) {
          previewOpen = false;
          nextPreviewMs = millis();
          if (previewFailures < kPreviewFastRetries) {
            ++previewFailures;
          } else {
            nextPreviewMs += 5000;
          }
        }
      }
      if (!fetchedOk && millis() - lastErrorLogMs >= 5000) {
        lastErrorLogMs = millis();
        Serial.printf("[CAM] %s HTTP=%d length=%d read=%u elapsed=%lums\n",
                      (readingPreview ? previewUrl : captureUrl).c_str(), code, len, (unsigned int)bytesRead,
                      (unsigned long)((micros() - tFetchStart) / 1000));
      }
      if (!previewOpen) camHttp.end();
      if (readingPreview && !previewOpen) {
        vTaskDelay(pdMS_TO_TICKS(250));
        continue;
      }
    } else {
      // Khi dong phien hoac mat WiFi, giai phong socket ke ca khi dang Keep-Alive.
      camClient.stop();
      if (previewOpen) camHttp.end();
      previewOpen = false;
      previewFailures = 0;
      nextPreviewMs = millis();
      if (usedPreviewThisSession && !isSessionOpen && WiFi.status() == WL_CONNECTED) {
        // The browser's sleep request can arrive while the LCD stream is still closing.
        usedPreviewThisSession = false;
        vTaskDelay(pdMS_TO_TICKS(300));
        if (!isSessionOpen && WiFi.status() == WL_CONNECTED) {
          camHttp.setReuse(false);
          camHttp.setConnectTimeout(1200);
          camHttp.setTimeout(captureTimeoutMs);
          if (camHttp.begin(camClient, sleepUrl)) camHttp.GET();
          camHttp.end();
          camClient.stop();
        }
      }
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    // Nhuong CPU cho SupaWorker giua cac frame, ke ca khi socket con du lieu.
    vTaskDelay(pdMS_TO_TICKS(fetchedOk ? 2 : 25));
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
          isSessionOpen = true;
          initialSessionChecked = true;
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
              asm volatile("" ::: "memory");
              pendingCheckinFlag = true;
            }
          }

          // Co ma QR moi -> Gui tin hieu cho Core 1 ve
          if (qrToken != currentQrToken) {
            currentQrToken = qrToken;
            String qrUrl = String(web_domain) + "/checkin.html?t=" + qrToken;
            Serial.println("[SUPABASE WORKER] Co ma QR moi: " + qrUrl);
            snprintf(pendingQrText, sizeof(pendingQrText), "%s", qrUrl.c_str());
            asm volatile("" ::: "memory");
            pendingQrFlag = true;
          }
        } else {
          isSessionOpen = false;
          if (currentSessionId != "" || currentQrToken != "" || !initialSessionChecked) {
            initialSessionChecked = true;
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

  // Cap phat Buffer B (40KB) 1 lan duy nhat luc khoi dong tren SRAM Heap (khong bao gio gay phan manh)
  camBuf[1] = (uint8_t*)heap_caps_malloc(CAM_BUF_SIZE, MALLOC_CAP_8BIT);
  
  tft.init();
  tft.setRotation(1);
  tft.invertDisplay(true); // Man hinh IPS
  initJpgDecoder();
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("Ket noi WiFi...", 10, 10, 2);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { 
    delay(400); 
    Serial.print("."); 
  }
  // Tat WiFi Modem-Sleep de triet tieu do tre thuc day 15-40ms giua cac frame HTTP
  WiFi.setSleep(false);
  lastPerfReportMs = millis();

  Serial.println("\n[KIOSK] WiFi OK (No-Sleep)! Khoi tao giao dien chia doi...");
  drawSplitCameraLayout();

  // 1. Task keo anh Camera toc do cao tren Core 0 (4KB stack, Priority 2 > SupaWorker de khong bi khung khi bat tay TLS)
  xTaskCreatePinnedToCore(
    cameraCaptureWorker,
    "CamWorker",
    4096,
    NULL,
    2,
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
    if (noOpenSessionVisible) {
      noOpenSessionVisible = false;
      drawSplitCameraLayout();
    }
    drawSplitQRCode(String(pendingQrText));
  }

  // 3. Neu co frame Camera moi nhat tu Core 0 (Ping-Pong Buffer A/B):
  // Lay anh moi nhat ra ve ngay, trong luc do Core 0 van tiep tuc tai anh ke tiep vao buffer kia
  bool drewFrame = false;
  int bufToDraw = -1;
  size_t lenToDraw = 0;

  portENTER_CRITICAL(&camMux);
  if (latestReadyIdx != -1) {
    bufToDraw = latestReadyIdx;
    lenToDraw = camLen[bufToDraw];
    drawingIdx = bufToDraw;
    latestReadyIdx = -1;
  }
  portEXIT_CRITICAL(&camMux);

  if (bufToDraw != -1) {
    if (!noOpenSessionVisible) {
      uint32_t tDrawStart = micros();
      bool ok = drawSplitCameraFrame(camBuf[bufToDraw], lenToDraw, checkinNoticeActive);
      uint32_t drawUs = micros() - tDrawStart;
      if (ok) {
        perfDrawSumUs += drawUs;
        if (drawUs > perfDrawMaxUs) perfDrawMaxUs = drawUs;
        perfDrawCount++;
      }
      drewFrame = true;
    }
    portENTER_CRITICAL(&camMux);
    drawingIdx = -1;
    portEXIT_CRITICAL(&camMux);
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

  // 6. Bao cao so do hieu nang thuc te qua Serial moi 5 giay (Step 1: Khong chiem dung man hinh LCD)
  if (now - lastPerfReportMs >= 5000) {
    uint32_t elapsedMs = now - lastPerfReportMs;
    lastPerfReportMs = now;

    uint32_t fSumUs = 0, fMaxUs = 0, fCount = 0, dropped = 0;
    portENTER_CRITICAL(&camMux);
    fSumUs = perfFetchSumUs;
    fMaxUs = perfFetchMaxUs;
    fCount = perfFetchCount;
    dropped = perfDroppedFrames;
    perfFetchSumUs = 0;
    perfFetchMaxUs = 0;
    perfFetchCount = 0;
    perfDroppedFrames = 0;
    portEXIT_CRITICAL(&camMux);

    float fps = (elapsedMs > 0) ? (perfDrawCount * 1000.0f / elapsedMs) : 0.0f;
    float avgFetchMs = (fCount > 0) ? (fSumUs / 1000.0f / fCount) : 0.0f;
    float maxFetchMs = fMaxUs / 1000.0f;
    float avgDrawMs = (perfDrawCount > 0) ? (perfDrawSumUs / 1000.0f / perfDrawCount) : 0.0f;
    float maxDrawMs = perfDrawMaxUs / 1000.0f;

    Serial.printf(
      "[CAM PERF] FPS: %.1f | Fetch: %.1fms (max %.0fms, n=%u) | Draw: %.1fms (max %.0fms, n=%u) | Dropped: %u\n",
      fps, avgFetchMs, maxFetchMs, fCount, avgDrawMs, maxDrawMs, perfDrawCount, dropped
    );

    perfDrawSumUs = 0;
    perfDrawMaxUs = 0;
    perfDrawCount = 0;
  }

  // Bo delay(8) co dinh: neu vua ve frame xong chi nhuong 1ms de bat ngay frame tiep theo
  delay(drewFrame ? 1 : 2);
}
