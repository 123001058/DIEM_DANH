"""Compile and run the production Kiosk address handoff with host-side socket stubs."""
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'esp32_kiosk/esp32_kiosk.ino').read_text(encoding='utf-8')
update = re.search(r'^static void updateCameraAddress\([^\n]*\) \{.*?^}', source, re.M | re.S).group()
start = source.index('      char latestIp[sizeof(esp_cam_ip)];')
end = source.index('      if (!previewOpen &&', start)
handoff = source[start:end]
stub = r'''
#include <cassert>
#include <cstdio>
#include <cstring>
#include <cstdint>
#include <string>
struct String : std::string {
  using std::string::string;
  String(const std::string& s):std::string(s) {}
};
struct IPAddress {
  unsigned n[4]{};
  bool fromString(const char* s) {
    char extra;
    if (sscanf(s,"%u.%u.%u.%u%c",&n[0],&n[1],&n[2],&n[3],&extra)!=4) return false;
    for (auto x:n) if (x>255) return false;
    return true;
  }
  unsigned operator[](int i)const{return n[i];}
  String toString()const {char s[16];snprintf(s,sizeof(s),"%u.%u.%u.%u",n[0],n[1],n[2],n[3]);return s;}
};
int locks=0;
#define portENTER_CRITICAL(x) (++locks)
#define portEXIT_CRITICAL(x) (--locks)
int camAddressMux=0,camMux=0;
char esp_cam_ip[16]="192.168.2.168";
struct {template<class... T> void printf(const char*,T...) {}} Serial;
uint32_t millis(){return 42;}
struct Client {int closed=0;void stop(){++closed;}} camClient;
struct Http {int ended=0;void end(){++ended;}} camHttp;
String currentCameraIp,captureUrl,previewUrl;
bool previewOpen=true,previewSupported=true;
int previewFailures=2,latestReadyIdx=1;
uint32_t nextPreviewMs=9999;
'''
cases = r'''
int main(){
  handoff();
  assert(captureUrl=="http://192.168.2.168:80/capture");
  assert(previewUrl=="http://192.168.2.168:82/stream");
  assert(camClient.closed==1 && camHttp.ended==1 && locks==0);
  handoff(); assert(camClient.closed==1 && camHttp.ended==1);
  puts("PASS initial fallback address and no reconnect churn for unchanged IP");
  updateCameraAddress("10.20.30.40"); handoff();
  assert(captureUrl=="http://10.20.30.40:80/capture");
  assert(previewUrl=="http://10.20.30.40:82/stream");
  assert(camClient.closed==2 && camHttp.ended==2 && !previewOpen && !previewSupported);
  assert(previewFailures==0 && latestReadyIdx==-1 && nextPreviewMs==42 && locks==0);
  puts("PASS DHCP change closes old sockets, rebuilds both URLs and resets pending preview");
  for (auto bad:{"8.8.8.8","192.168.999.5","::1","192.168.2.2:81",""}) updateCameraAddress(bad);
  updateCameraAddress(nullptr); handoff();
  assert(currentCameraIp=="10.20.30.40" && camClient.closed==2 && locks==0);
  puts("PASS absent/invalid discovery retains last valid host");
}
'''
vswhere = Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'Microsoft Visual Studio/Installer/vswhere.exe'
vs = subprocess.check_output([str(vswhere), '-latest', '-products', '*', '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], text=True).strip()
assert vs, 'MSVC tools required'
with tempfile.TemporaryDirectory(prefix='kiosk-address-') as temp:
    work = Path(temp)
    (work / 'address.cpp').write_text(stub + update + '\nvoid handoff(){\n' + handoff + '\n}\n' + cases, encoding='utf-8')
    script = work / 'check.cmd'
    script.write_text(f'@echo off\ncall "{vs}\\Common7\\Tools\\VsDevCmd.bat" -arch=x64 >nul\n'
        'cl /nologo /std:c++17 /EHsc address.cpp /Fe:address.exe\n'
        'if errorlevel 1 exit /b 1\naddress.exe\n', encoding='utf-8')
    subprocess.run(['cmd.exe', '/d', '/c', str(script)], cwd=work, check=True)
