#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include "camera_registry.h"
#include "camera_registry_ca.h"

#if __has_include("camera_registry_secret.h")
#include "camera_registry_secret.h"
#else
#define CAM_DEVICE_TOKEN ""
#endif

static const char* kRegistryUrl = "https://nhjkpknhybenkxwadvzv.supabase.co/rest/v1/rpc/report_camera_endpoint";
static const char* kPublishableKey = "sb_publishable_h1nRwciz_rOgnD88ZCnkIw_v0Czf1L8";
static const char* kDeviceId = "lh-navix-cam";

// TLS and retries run outside the camera/HTTP loop so cloud outages cannot stall frames.
static void cameraRegistryWorker(void*) {
  WiFiClientSecure client;
  client.setCACert(kCameraRegistryRootCA);
  client.setHandshakeTimeout(5);
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  String reportedIp;
  uint32_t lastAttemptMs = 0;
  uint32_t lastSuccessMs = 0;
  bool attempted = false;
  bool connected = false;
  while (true) {
    if (WiFi.status() != WL_CONNECTED) {
      connected = false;
      attempted = false;
      reportedIp = "";
    } else if (time(nullptr) >= 1700000000) {
      const String ip = WiFi.localIP().toString();
      const uint32_t nowMs = millis();
      const bool changed = !connected || ip != reportedIp;
      if ((!attempted || nowMs - lastAttemptMs >= 10000) &&
          (changed || nowMs - lastSuccessMs >= 60000)) {
        attempted = true;
        lastAttemptMs = nowMs;
        const String payload = String("{\"p_device_id\":\"") + kDeviceId +
          "\",\"p_token\":\"" + CAM_DEVICE_TOKEN + "\",\"p_ip\":\"" + ip + "\"}";
        int code = -1;
        if (http.begin(client, kRegistryUrl)) {
          http.addHeader("apikey", kPublishableKey);
          http.addHeader("Content-Type", "application/json");
          code = http.POST(payload);
          if (code == HTTP_CODE_OK && http.getString() == "true") {
            reportedIp = ip;
            lastSuccessMs = millis();
            connected = true;
            Serial.printf("[CAM IP] Da cap nhat %s\n", ip.c_str());
          } else {
            Serial.printf("[CAM IP] Cap nhat that bai HTTP=%d; se thu lai\n", code);
          }
        } else {
          Serial.println("[CAM IP] Khong mo duoc HTTPS; se thu lai");
        }
        http.end();
        client.stop();
      }
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

void startCameraRegistry() {
  if (strlen(CAM_DEVICE_TOKEN) != 64) {
    Serial.println("[CAM IP] Chua provision token: chay scripts/provision_camera.py truoc khi nap");
    return;
  }
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  if (xTaskCreate(cameraRegistryWorker, "CameraRegistry", 6144, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("[CAM IP] Khong tao duoc task cap nhat dia chi");
  }
}
