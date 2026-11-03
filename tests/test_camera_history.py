"""Browser regression tests for the real admin camera history markup/module.

Run: python tests/test_camera_history.py (requires Selenium + Chrome).
Serves admin.html with auth/network scripts replaced by test adapters; never
connects to Supabase or the physical camera. Uses a fresh browser profile.
"""
import functools
import http.server
import json
from pathlib import Path
import re
import sys
import threading
import time

from selenium import webdriver
from selenium.webdriver.common.by import By

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8')
KEY = "admin_camera_scan_history_v2"
BOOT = """
<script>
function escapeHtml(v) { const e = document.createElement('span'); e.textContent = v ?? ''; return e.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
window.testToasts = [];
function toast(...args) { if (!['ok', 'err', 'warn', 'info'].includes(args[0])) throw new Error('Unknown toast type'); testToasts.push(args); }
</script>
<script src="/js/admin/admin.face.js"></script>
<script>
document.querySelectorAll('.app-view').forEach(e => { e.classList.remove('active'); e.style.display = 'none'; });
document.getElementById('view-face-cam').style.display = 'block';
document.getElementById('view-face-cam').classList.add('active');
renderAdminRecentScansGrouped();
</script>
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path.split('?')[0] == '/admin.html':
            html = (ROOT / 'admin.html').read_text(encoding='utf-8')
            html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
            html = html.replace('</body>', BOOT + '</body>')
            body = html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
options = webdriver.ChromeOptions()
options.add_argument('--headless=new')
options.add_argument('--window-size=1440,1100')
options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
driver = webdriver.Chrome(options=options)
passed = 0


def check(condition, label):
    global passed
    assert condition, label
    passed += 1
    print(f'PASS {passed:02d}: {label}', flush=True)


def js(source, *args):
    return driver.execute_script(source, *args)


def click(selector):
    element = driver.find_element(By.CSS_SELECTOR, selector)
    js('arguments[0].scrollIntoView({block: "center", inline: "nearest"})', element)
    element.click()


def records():
    return js('return JSON.parse(localStorage.getItem(arguments[0]) || "[]")', KEY)


def sample(i, date='2026-11-02'):
    return dict(id=f'scan_{i}', timestamp=1000+i, dateKey=date,
                dateFormatted='2/11/2026' if date.endswith('02') else '31/10/2026',
                dayOfWeekStr='Thứ Hai' if date.endswith('02') else 'Thứ Bảy',
                name=f'Sinh viên thử {i}', mssv=f'TEST{i}', timeFormatted='08:15:00',
                status='có mặt', avatar='images/logo.png', sessionName='Phiên thử')


def reset(items=None):
    js('''clearInterval(adminScanUndoTimer); adminScanUndoBatch = null;
      adminScanManaging = false; adminScanSelection.clear(); adminGroupOpenState = {};
      localStorage.setItem(arguments[0], JSON.stringify(arguments[1]));
      updateAdminScanUndo(); renderAdminRecentScansGrouped();''', KEY,
       items if items is not None else [sample(3), sample(2), sample(1, '2026-10-31')])


try:
    driver.get(f'http://127.0.0.1:{server.server_port}/admin.html')
    reset()
    check(js("return document.querySelector('#view-face-cam #adminScanManage') !== null"), 'Control is in Camera Điểm Danh ESP32')
    check(not driver.find_element(By.ID, 'adminScanManagement').is_displayed(), 'Management hidden initially')
    click('#adminScanManage')
    check(not js('return [...document.querySelectorAll("[data-scan-select]")].some(e => e.checked)'), 'No scans preselected')
    check(not driver.find_element(By.ID, 'adminScanDeleteSelected').is_enabled(), 'Empty selection cannot delete')
    click('[data-scan-date="2026-11-02"]')
    check(driver.find_element(By.ID, 'adminScanDeleteSelected').text == 'Xóa 2 lượt đã chọn', 'Date checkbox selects exactly two scans')
    check(js('return document.getElementById("scanGroupContent_2026-11-02").style.display') == 'none', 'Selecting date does not toggle folder')
    click('#scanGroupHeader_2026-11-02')
    click('[data-scan-select="scan_2"]')
    check(js('return document.querySelector("[data-scan-date]").indeterminate'), 'Partial selection has indeterminate date checkbox')
    check(not driver.find_element(By.ID, 'faceScanDetailModal').is_displayed(), 'Checkbox does not open scan detail')
    click('#adminScanDeleteSelected')
    alert = driver.switch_to.alert
    check('1 lượt' in alert.text and '2/11/2026: 1 lượt' in alert.text and 'Không xóa dữ liệu điểm danh' in alert.text, 'Confirmation names count, date and data scope')
    alert.dismiss()
    check(len(records()) == 3, 'Cancel keeps all records')
    click('#adminScanDeleteSelected')
    driver.switch_to.alert.accept()
    check({x['id'] for x in records()} == {'scan_2', 'scan_1'}, 'Delete removes only selected scan')
    check(driver.find_element(By.ID, 'adminScanUndo').is_displayed(), 'Undo appears after deletion')
    check(not driver.find_element(By.ID, 'adminScanDeleteAll').is_enabled(), 'Another deletion blocked during undo window')
    js("addRecentScanRecord({}, 'NEW', 'Lượt mới', 'images/logo.png', '08:16', 'có mặt', 95, 99, '')")
    click('#adminScanUndo button')
    check(len(records()) == 4 and any(x['mssv'] == 'NEW' for x in records()), 'Undo preserves incoming scan')
    check(len({x['id'] for x in records()}) == 4, 'Undo does not duplicate records')
    reset()
    click('#adminScanManage')
    click('#adminScanMore summary')
    click('#adminScanDeleteAll')
    driver.switch_to.alert.send_keys('xoa')
    driver.switch_to.alert.accept()
    check(len(records()) == 3, 'Wrong typed confirmation cannot clear history')
    click('#adminScanDeleteAll')
    driver.switch_to.alert.dismiss()
    check(len(records()) == 3, 'Cancel typed confirmation keeps history')
    click('#adminScanDeleteAll')
    driver.switch_to.alert.send_keys('XÓA')
    driver.switch_to.alert.accept()
    check(records() == [] and driver.find_element(By.ID, 'adminRecentEmpty').is_displayed(), 'Exact confirmation deletes all and shows empty state')
    click('#adminScanUndo button')
    check(len(records()) == 3, 'Undo restores full deletion')

    # Arrivals while the confirmation is open must not be included in its scope.
    js('''window.nativeConfirm = window.confirm;
      window.confirm = () => { addRecentScanRecord({}, 'DURING', 'During confirm', 'images/logo.png', '08:20', 'có mặt', 95, 99, ''); return true; };
      selectAdminScanDate('2026-11-02', true); deleteSelectedAdminScans();
      window.confirm = window.nativeConfirm;''')
    check(len(records()) == 2 and any(x['mssv'] == 'DURING' for x in records()), 'Confirmation snapshot excludes incoming scans')
    click('#adminScanUndo button')

    reset()
    click('#adminScanManage')
    click('[data-scan-date="2026-11-02"]')
    js('window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw new Error("Quota test"); };')
    click('#adminScanDeleteSelected')
    driver.switch_to.alert.accept()
    js('Storage.prototype.setItem = window.originalSetItem')
    check(len(records()) == 3 and js('return testToasts.at(-1)[1]') == 'Chưa xóa lịch sử', 'Failed storage write retains data and reports failure')
    click('#adminScanDeleteSelected')
    driver.switch_to.alert.accept()
    js('Storage.prototype.setItem = function() { throw new Error("Quota undo test"); };')
    click('#adminScanUndo button')
    js('Storage.prototype.setItem = window.originalSetItem')
    check(len(records()) == 1 and js('return !!adminScanUndoBatch'), 'Failed undo retains retry opportunity')
    click('#adminScanUndo button')
    check(len(records()) == 3, 'Undo retry succeeds')

    reset([sample(i) for i in range(50)])
    click('#adminScanManage')
    js("selectAdminScan('scan_1', true)")
    click('#adminScanDeleteSelected')
    driver.switch_to.alert.accept()
    js("addRecentScanRecord({}, 'LIMIT', 'New at limit', 'images/logo.png', '08:20', 'có mặt', 95, 99, '')")
    click('#adminScanUndo button')
    check(len(records()) == 51, 'Undo at retention limit does not trim restored or incoming records')

    reset()
    click('#adminScanManage')
    click('[data-scan-date="2026-11-02"]')
    click('#adminScanDeleteSelected')
    driver.switch_to.alert.accept()
    time.sleep(10.4)
    check(not driver.find_element(By.ID, 'adminScanUndo').is_displayed(), 'Undo expires after real ten-second wait')
    js('undoAdminScanDeletion()')
    check(len(records()) == 1, 'Expired undo cannot restore deleted scans')
    driver.refresh()
    check(len(records()) == 1 and driver.find_element(By.ID, 'adminScanCount').text == '1', 'Deletion persists after reload')

    out = ROOT / 'scratch' / 'camera-history-qa'
    out.mkdir(parents=True, exist_ok=True)
    for width in [1440, 390, 320]:
        driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', dict(width=width, height=1000, deviceScaleFactor=1, mobile=width < 500))
        reset()
        click('#adminScanManage')
        click('#scanGroupHeader_2026-11-02')
        click('[data-scan-select="scan_3"]')
        check(js('return document.documentElement.scrollWidth <= innerWidth'), f'No page overflow at {width}px')
        check(js('const e = document.getElementById("adminRecentScansList"); return e.scrollWidth <= e.clientWidth + 1'), f'No history overflow at {width}px')
        driver.find_element(By.CSS_SELECTOR, '.admin-face-history-card').screenshot(str(out / f'history-{width}.png'))
    errors = [entry for entry in driver.get_log('browser') if entry['level'] == 'SEVERE' and ('javascript' == entry.get('source'))]
    check(not errors, f'No uncaught JavaScript errors: {errors}')
    print(f'RESULT: {passed} checks PASS. Fixtures only; live auth/camera not exercised.', flush=True)
finally:
    failure_image = ROOT / 'scratch' / 'camera-history-qa' / 'last-state.png'
    failure_image.parent.mkdir(parents=True, exist_ok=True)
    driver.save_screenshot(str(failure_image))
    driver.quit()
    server.shutdown()
