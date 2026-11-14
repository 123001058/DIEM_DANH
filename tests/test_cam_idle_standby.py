"""Run production CAM power functions with a fake clock, sensor and mutex (MSVC)."""
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'esp32_cam_ai/app_httpd.cpp').read_text(encoding='utf-8')


def function(name):
    match = re.search(r'^(?:static )?(?:esp_err_t|void) ' + name + r'\([^\n]*\) \{.*?^}',
                      source, re.M | re.S)
    assert match, name
    return match.group()


production = '\n'.join(function(name) for name in [
    'wakeCameraActiveInternal', 'wakeCameraActive', 'enterCameraStandby',
    'prepareCameraActive', 'releaseCameraClient', 'checkCameraPowerTimeout'])
timeout = re.search(r'static constexpr unsigned long kCameraIdleStandbyMs = \d+;', source).group()
assert '#define ENABLE_CAM_IDLE_STANDBY 1' in (ROOT / 'esp32_cam_ai/board_config.h').read_text(encoding='utf-8')

stub = r'''
#include <cassert>
#include <cstdio>
#include <cstdint>
#define ENABLE_CPU_FREQ_SCALING 0
#define pdTRUE 1
#define pdMS_TO_TICKS(x) (x)
#define portMAX_DELAY 0xffffffffUL
#define portENTER_CRITICAL(x) ((void)0)
#define portEXIT_CRITICAL(x) ((void)0)
using esp_err_t = int;
constexpr int ESP_OK=0, ESP_FAIL=-1, ESP_ERR_INVALID_STATE=-2, ESP_ERR_TIMEOUT=-3;
enum { CAM_POWER_STANDBY, CAM_POWER_TRANSITIONING, CAM_POWER_ACTIVE, CAM_POWER_UNAVAILABLE };
int s_power_state=CAM_POWER_ACTIVE, s_active_stream_clients=0, s_in_flight_captures=0;
int s_power_mutex=1, s_frame_cache_mutex=2, s_client_mux=0;
unsigned long nowMs=1000, s_last_activity_ms=1000;
int s_frame_cache_len=100, sleepWrites=0, wakeWrites=0, lockDepth=0;
bool regOk=true, frameOk=true, recentRequestOnLock=false;
unsigned long millis() { return nowMs; }
int xSemaphoreTake(int mutex, unsigned long) {
  if (mutex==1) {
    assert(lockDepth++ == 0);
    if (recentRequestOnLock) { s_last_activity_ms=nowMs; recentRequestOnLock=false; }
  }
  return pdTRUE;
}
void xSemaphoreGive(int mutex) { if (mutex==1) assert(--lockDepth==0); }
void vTaskDelay(unsigned long ms) { nowMs+=ms; }
struct { void println(const char*) {} template<class... T> void printf(const char*, T...) {} } Serial;
struct { void setSleep(bool sleep) { assert(!sleep); } } WiFi;
struct sensor_t { int (*set_reg)(sensor_t*,int,int,int); };
int setReg(sensor_t*, int reg, int mask, int value) {
  assert(reg==0x109 && mask==0x10);
  if (!regOk) return -1;
  if (value==0x10) ++sleepWrites; else { assert(value==0); ++wakeWrites; }
  return 0;
}
sensor_t sensor{setReg};
sensor_t* esp_camera_sensor_get() { return &sensor; }
struct camera_fb_t {} frame;
camera_fb_t* esp_camera_fb_get() { return frameOk ? &frame : nullptr; }
void esp_camera_fb_return(camera_fb_t*) {}
void reset() {
  nowMs=s_last_activity_ms=1000; s_power_state=CAM_POWER_ACTIVE;
  s_active_stream_clients=s_in_flight_captures=sleepWrites=wakeWrites=lockDepth=0;
  regOk=frameOk=true; recentRequestOnLock=false;
}
'''

cases = r'''
int main() {
  reset(); nowMs=30999; checkCameraPowerTimeout(); assert(sleepWrites==0);
  nowMs=31000; checkCameraPowerTimeout();
#if ENABLE_CAM_IDLE_STANDBY
  assert(s_power_state==CAM_POWER_STANDBY && sleepWrites==1);
  assert(prepareCameraActive(true)==ESP_OK);
  assert(s_power_state==CAM_POWER_ACTIVE && wakeWrites==1 && s_active_stream_clients==1);
  assert(s_frame_cache_len==0); releaseCameraClient(true);
  puts("PASS 30s boundary, stream wake, cache invalidation");
  reset(); assert(prepareCameraActive(true)==ESP_OK); assert(prepareCameraActive(true)==ESP_OK);
  nowMs+=60000; checkCameraPowerTimeout(); assert(sleepWrites==0);
  releaseCameraClient(true); nowMs+=60000; checkCameraPowerTimeout(); assert(sleepWrites==0);
  releaseCameraClient(true); nowMs+=29999; checkCameraPowerTimeout(); assert(sleepWrites==0);
  ++nowMs; checkCameraPowerTimeout(); assert(sleepWrites==1);
  puts("PASS Web/LCD clients protect sleep until last disconnect plus 30s");
  reset(); assert(prepareCameraActive(false)==ESP_OK); nowMs+=60000;
  checkCameraPowerTimeout(); assert(sleepWrites==0); releaseCameraClient(false);
  nowMs+=30000; checkCameraPowerTimeout(); assert(sleepWrites==1);
  assert(prepareCameraActive(false)==ESP_OK && s_in_flight_captures==1);
  releaseCameraClient(false); puts("PASS capture protects sleep and wakes sensor");
  reset(); nowMs+=30000; recentRequestOnLock=true; checkCameraPowerTimeout();
  assert(sleepWrites==0 && s_power_state==CAM_POWER_ACTIVE);
  puts("PASS request finishing before timer acquires mutex resets idle");
  reset(); nowMs+=30000; checkCameraPowerTimeout(); frameOk=false;
  assert(prepareCameraActive(true)==ESP_FAIL && s_power_state==CAM_POWER_UNAVAILABLE);
  assert(s_active_stream_clients==0 && lockDepth==0);
  reset(); nowMs+=30000; regOk=false; checkCameraPowerTimeout();
  assert(s_power_state==CAM_POWER_UNAVAILABLE && lockDepth==0);
  puts("PASS failed sensor/wake does not claim ACTIVE or leak client/lock");
  reset(); nowMs=0xfffffff0UL; s_last_activity_ms=nowMs;
  nowMs=static_cast<uint32_t>(nowMs+30000UL); checkCameraPowerTimeout();
  assert(sleepWrites==1); puts("PASS 32-bit clock rollover");
#else
  assert(s_power_state==CAM_POWER_ACTIVE && sleepWrites==0);
  nowMs+=60000; checkCameraPowerTimeout(); assert(sleepWrites==0);
  puts("PASS rollback flag 0 keeps sensor continuously ACTIVE");
#endif
  assert(lockDepth==0);
}
'''

vswhere = Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'Microsoft Visual Studio/Installer/vswhere.exe'
vs = subprocess.check_output([str(vswhere), '-latest', '-products', '*', '-requires',
                              'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
                              '-property', 'installationPath'], text=True).strip()
assert vs, 'MSVC tools required'
with tempfile.TemporaryDirectory(prefix='cam-idle-') as work:
    work = Path(work)
    (work / 'power.cpp').write_text(stub + '\n' + timeout + '\n' + production + '\n' + cases, encoding='utf-8')
    for enabled in [1, 0]:
        script = work / 'check.cmd'
        script.write_text(f'@echo off\ncall "{vs}\\Common7\\Tools\\VsDevCmd.bat" -arch=x64 >nul\n'
                          f'cl /nologo /std:c++17 /EHsc /DENABLE_CAM_IDLE_STANDBY={enabled} power.cpp /Fe:power.exe\n'
                          'if errorlevel 1 exit /b 1\npower.exe\n', encoding='utf-8')
        subprocess.run(['cmd.exe', '/d', '/c', str(script)], cwd=work, check=True)
