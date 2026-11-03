"""Real FaceMatcher + production frame handler in Chrome, synthetic descriptors only.

Run: python tests/test_face_identity.py (Selenium, Chrome; downloads the public
face-api bundle if absent). No model inference, Supabase or physical camera.
"""
import functools
import hashlib
import http.server
from pathlib import Path
import re
import sys
import threading
import urllib.request
from selenium import webdriver
from selenium.webdriver.common.by import By

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8')
BUNDLE = ROOT / 'scratch/face-api-identity-test.js'
BUNDLE.parent.mkdir(exist_ok=True)
if not BUNDLE.exists():
    urllib.request.urlretrieve('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js', BUNDLE)
print('Face-api SHA256:', hashlib.sha256(BUNDLE.read_bytes()).hexdigest(), flush=True)
BOOT = '''<script src="/scratch/face-api-identity-test.js"></script>
<script src="/js/admin/admin.face.js"></script>
<script>
document.querySelectorAll('.app-view').forEach(e => e.style.display = 'none');
document.getElementById('view-face-cam').style.display = 'block';
</script>'''


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path == '/admin.html':
            html = (ROOT / 'admin.html').read_text(encoding='utf-8')
            html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
            body = html.replace('</body>', BOOT + '</body>').encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
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
driver.set_script_timeout(30)
try:
    driver.get(f'http://127.0.0.1:{server.server_port}/admin.html')
    result = driver.execute_async_script(r'''
const done = arguments[arguments.length - 1];
(async () => {
  const checks = [];
  const check = (condition, label) => { if (!condition) throw Error(label); checks.push(label); };
  const vector = x => { const v = new Float32Array(128); v[0] = x; return v; };
  const matcher = rows => new faceapi.FaceMatcher(rows.map(([label, ...values]) =>
    new faceapi.LabeledFaceDescriptors(label, values.map(vector))), 0.40);
  const query = vector(0);
  const clear = matcher([['A - Alpha', .20, .30], ['B - Beta', .60]]);
  let r = evaluateAdminFaceIdentity(clear, query);
  check(r.accepted && r.best.mssv === 'A', 'clear identity accepted');
  check(Math.abs(r.best.distance - clear.matchDescriptor(query).distance) < 1e-12, 'same mean distance as actual FaceMatcher');
  const ambiguous = matcher([['A - Alpha', .32], ['B - Beta', .33]]);
  r = evaluateAdminFaceIdentity(ambiguous, query);
  check(!r.accepted && r.reason === 'ambiguous', 'close runner-up blocked');
  check(evaluateAdminFaceIdentity(matcher([['A', .3], ['B', .3]]), query).reason === 'ambiguous', 'tie blocked');
  check(evaluateAdminFaceIdentity(matcher([['A', .41], ['B', .7]]), query).reason === 'too_far', 'outside threshold blocked');
  const boundary = matcher([['A', 0], ['B', 1]]);
  const boundaryQuery = vector(.25);
  boundary._distanceThreshold = .25;
  check(boundary.findBestMatch(boundaryQuery).label === 'unknown' && evaluateAdminFaceIdentity(boundary, boundaryQuery).reason === 'too_far', 'exact threshold retains FaceMatcher strict boundary');
  check(evaluateAdminFaceIdentity(matcher([['A', .32], ['B', .371]]), query).accepted, 'above margin accepted');
  check(evaluateAdminFaceIdentity(matcher([['A', .32], ['B', .369]]), query).reason === 'ambiguous', 'below margin rejected');
  check(evaluateAdminFaceIdentity(matcher([['A - old', .2], ['A - new', .3], ['B', .7]]), query).second.mssv === 'B', 'runner-up is different MSSV');
  check(evaluateAdminFaceIdentity(matcher([['A - old', .2], ['A - new', .3]]), query).reason === 'insufficient_identities', 'same MSSV twice is not two identities');
  check(evaluateAdminFaceIdentity(matcher([['A', .2]]), query).reason === 'insufficient_identities', 'single identity blocked with explicit reason');
  check(evaluateAdminFaceIdentity(null, query).reason === 'no_data', 'no matcher blocked');
  check(evaluateAdminFaceIdentity(clear, new Float32Array(127)).reason === 'invalid_data', 'wrong descriptor length blocked');
  const nan = vector(NaN);
  check(evaluateAdminFaceIdentity(clear, nan).reason === 'invalid_data', 'nonfinite query blocked');
  const damaged = matcher([['A', .2], ['B', NaN]]);
  check(evaluateAdminFaceIdentity(damaged, query).reason === 'invalid_data', 'invalid competitor cannot disappear silently');
  check(evaluateAdminFaceIdentity(matcher([['A', .2, .9], ['B', .8]]), query).reason === 'too_far', 'mean of all samples, not nearest sample');

  // Run the production frame handler. Only detector output and final persistence are adapters.
  const realApi = faceapi;
  let detection = null;
  window.faceapi = { ...realApi, detectSingleFace: () => ({
    withFaceLandmarks: () => ({ withFaceDescriptor: async () => detection })
  }) };
  const media = document.createElement('canvas'); media.width = 640; media.height = 480;
  let writes = [];
  executeFaceCheckin = (...args) => { writes.push(args[0]); };
  adminCameraActive = true; adminInferenceRunning = true; adminAntiSpoofEnabled = false;
  const reset = () => { adminTrackingMssv = null; adminTrackingFrames = 0; writes = []; };
  const frame = async (m, x = 0) => {
    adminFaceMatcher = m;
    detection = x === null ? null : { descriptor: vector(x), detection: { box: { x: 100, y: 100, width: 100, height: 100 } } };
    await processAdminCameraFrame(media);
  };
  reset();
  for (let i = 0; i < 3; i++) await frame(clear);
  check(writes.length === 0 && adminTrackingFrames === 3, 'three real handler calls do not check in');
  await frame(clear);
  check(writes.join() === 'A' && adminTrackingFrames === 0, 'four qualifying calls check in once');
  reset();
  for (let i = 0; i < 8; i++) await frame(ambiguous);
  check(writes.length === 0 && adminTrackingFrames === 0, 'eight ambiguous calls never check in');
  check(document.getElementById('adminCamHudStatus').textContent.includes('Chưa phân biệt'), 'ambiguous HUD explains rejection');
  check(document.getElementById('btnAdminQuickEnrollFromFeed').style.display === 'none' && adminLastUnknownFaceDataUrl === null, 'no quick enrollment for ambiguous identity');
  reset(); for (let i = 0; i < 3; i++) await frame(clear);
  await frame(ambiguous); await frame(clear);
  check(writes.length === 0 && adminTrackingFrames === 1, 'ambiguity resets pending confirmation');
  await frame(clear, null); await frame(clear);
  check(writes.length === 0 && adminTrackingFrames === 1, 'missing face resets pending confirmation');
  await frame(clear, .60);
  check(writes.length === 0 && adminTrackingFrames === 1 && adminTrackingMssv === 'B', 'identity change starts count at one');
  for (let i = 0; i < 3; i++) await frame(clear, .60);
  check(writes.join() === 'B', 'only new identity confirmed after four calls');
  reset(); for (let i = 0; i < 3; i++) await frame(clear);
  await frame(clear, 2); await frame(clear);
  check(writes.length === 0 && adminTrackingFrames === 1, 'outside threshold resets confirmation');
  await frame(clear, NaN); await frame(clear);
  check(writes.length === 0 && adminTrackingFrames === 1, 'invalid data resets confirmation');
  adminAntiSpoofEnabled = true; adminFasnetSession = {};
  runMiniFasnetInference = async () => ({ ok: true, isLive: false, pPrint: .8, pReplay: .1 });
  await frame(clear);
  check(writes.length === 0 && adminTrackingFrames === 0, 'existing spoof rejection still resets confirmation');
  adminAntiSpoofEnabled = false;
  adminCameraActive = false; await frame(clear);
  check(writes.length === 0, 'stopped camera cannot check in');
  adminCameraActive = true; await frame(ambiguous);
  check(document.getElementById('adminFaceIdentityDiagnostics').textContent.includes('Alpha') && document.getElementById('adminFaceIdentityDiagnostics').textContent.includes('Beta'), 'diagnostics contain both candidates');
  check(localStorage.getItem('admin_camera_scan_history_v2') === null, 'fixture never persisted attendance/history');
  return checks;
})().then(checks => done({ checks })).catch(error => done({ error: error.stack }));
''')
    assert 'error' not in result, result.get('error')
    for label in result['checks']:
        print('PASS:', label)
    details = driver.find_element(By.ID, 'adminFaceIdentityDebug')
    assert details.get_attribute('open') is None
    summary = details.find_element(By.TAG_NAME, 'summary')
    driver.execute_script('arguments[0].scrollIntoView({block:"center"})', summary)
    summary.click()
    assert details.get_attribute('open') is not None
    assert driver.find_element(By.ID, 'adminFaceIdentityDiagnostics').is_displayed()
    print('PASS: diagnostics collapsed by default, opens via real click')
    for width in (1440, 390):
        driver.set_window_size(width, 1100)
        driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {
            'width': width, 'height': 1100, 'deviceScaleFactor': 1, 'mobile': False
        })
        driver.execute_script('arguments[0].scrollIntoView({block:"center"})', details)
        assert driver.execute_script('return innerWidth') == width
        assert driver.execute_script('return document.documentElement.scrollWidth <= innerWidth')
        driver.save_screenshot(str(ROOT / f'scratch/face-identity-{width}.png'))
        print(f'PASS: no page overflow at {width}px')
    errors = [e for e in driver.get_log('browser') if e.get('source') == 'javascript' and e['level'] == 'SEVERE']
    assert not errors, errors
    print(f"RESULT: {len(result['checks']) + 4} checks PASS; actual FaceMatcher and production handler, synthetic descriptors. No camera/model accuracy claim.")
finally:
    driver.quit()
    server.shutdown()
