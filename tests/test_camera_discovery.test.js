'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/admin/admin.face.js', 'utf8');
function productionFunction(name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^}`, 'm'));
  assert(match, name);
  return match[0];
}
const declarations = source.slice(source.indexOf('const DEFAULT_ESP_CAM_IP'), source.indexOf('function isPrivateCameraIp'));

function environment() {
  const elements = {
    adminEspIpInput: { value: '192.168.2.168' },
    adminEspImg: { src: '', style: {}, removeAttribute() { this.src = ''; } },
    adminCamHudStatus: { style: {} }
  };
  const storage = new Map();
  const timers = new Map();
  const intervals = new Map();
  const requests = [];
  const snapshots = [];
  let nextTimer = 1;
  const context = vm.createContext({
    console, AbortController, Date,
    document: { getElementById: id => elements[id] || null },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) },
    setTimeout: (fn,ms) => { const id = nextTimer++; timers.set(id,{fn,ms}); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: (fn,ms) => { const id=nextTimer++; intervals.set(id,{fn,ms}); return id; },
    clearInterval: id => intervals.delete(id),
    Image: class { constructor() { snapshots.push(this); } },
    window: { location: { protocol: 'http:' }, supabase: { rpc(name,args) {
      assert.equal(name,'get_camera_endpoint'); assert.equal(args.p_device_id,'lh-navix-cam');
      let resolve, reject;
      const promise = new Promise((a,b) => {resolve=a;reject=b;});
      const request = { resolve, reject };
      requests.push(request);
      return { abortSignal: signal => { request.signal=signal; return promise; } };
    } } },
    updateAttendanceCamStatusPill() {}, sendEspCamPower() {}, updateAdminCameraModeUi() {},
    updateAdminCamToggleButton() {}, updateAdminCamSessionStatus() {},
    ensureOpenSession: () => Promise.resolve(null), renderAdminIdentityDiagnostics() {},
    cancelAnimationFrame() {}, startAiInferenceLoop() {}
  });
  vm.runInContext(`let adminCameraActive=false, adminStreamMode='mjpeg', adminFastStreamLoopActive=false,
    adminFastStreamTimer=null, adminStreamReconnectTimer=null, adminEspMirrored=false,
    adminMjpegErrorCount=0, adminCameraMode='monitor', adminFaceModelsLoaded=true,
    adminFaceModelsLoading=false, adminAnimFrameId=null, adminInferenceRunning=false,
    adminUserManuallyStopped=false;\n` + declarations + '\n' + [
      'isPrivateCameraIp', 'cleanEspCamIp', 'formatEspCaptureUrl', 'formatEspStreamUrl',
      'stopAdminEspDiscovery', 'startAdminEspDiscovery', 'refreshAdminEspAddress',
      'connectAdminEspStream', 'startFastFrameStream', 'startAdminCamera', 'stopAdminCamera'
    ].map(productionFunction).join('\n'), context);
  return { elements, storage, timers, intervals, requests, snapshots, run: code => vm.runInContext(code,context) };
}
const endpoint = ip => ({ data: {device_id:'lh-navix-cam',ip}, error:null });

(async () => {
  let e = environment();
  for (const ip of ['192.168.2.169','10.3.4.5','172.16.0.5','172.31.255.254']) {
    assert(e.run(`isPrivateCameraIp(${JSON.stringify(ip)})`));
  }
  for (const ip of ['8.8.8.8','192.168.999.2','172.32.0.1','192.168.2.1:81','::1','<img>',null]) {
    assert(!e.run(`isPrivateCameraIp(${JSON.stringify(ip)})`));
  }
  let pending=e.run('refreshAdminEspAddress()');
  e.requests[0].resolve(endpoint('192.168.2.169')); await pending;
  assert.equal(e.elements.adminEspIpInput.value,'192.168.2.169');
  assert.equal(e.storage.get('esp_cam_ip'),'192.168.2.169');
  assert.equal(e.elements.adminEspImg.src,''); // Discovery cannot start a stopped camera.
  console.log('PASS validated address discovery while stopped');

  e.run("adminCameraActive=true; connectAdminEspStream('192.168.2.169'); startAdminEspDiscovery(); startAdminEspDiscovery();");
  assert.equal(e.intervals.size,1);
  assert.equal(e.elements.adminEspImg.src,'http://192.168.2.169:81/stream');
  pending=e.run('refreshAdminEspAddress()');
  const duplicate=e.run('refreshAdminEspAddress()');
  assert.equal(e.requests.length,2);
  e.requests[1].resolve(endpoint('10.20.30.40')); await Promise.all([pending,duplicate]);
  assert.equal(e.elements.adminEspImg.src,'http://10.20.30.40:81/stream');
  console.log('PASS DHCP change reconnects active feed and coalesces discovery requests');

  pending=e.run('refreshAdminEspAddress()');
  e.requests[2].reject(new Error('offline')); await pending;
  assert.equal(e.elements.adminEspImg.src,'http://10.20.30.40:81/stream');
  pending=e.run('refreshAdminEspAddress()'); e.requests[3].resolve({data:null,error:null}); await pending;
  assert.equal(e.elements.adminEspIpInput.value,'10.20.30.40');
  pending=e.run('refreshAdminEspAddress()'); e.requests[4].resolve(endpoint('8.8.8.8')); await pending;
  assert.equal(e.elements.adminEspIpInput.value,'10.20.30.40');
  console.log('PASS offline, stale/missing endpoint and invalid address keep last host');

  pending=e.run('refreshAdminEspAddress()');
  e.run('stopAdminEspDiscovery(); adminCameraActive=false;');
  assert(e.requests[5].signal.aborted);
  e.requests[5].resolve(endpoint('192.168.2.42')); await pending;
  assert.equal(e.elements.adminEspIpInput.value,'10.20.30.40'); assert.equal(e.intervals.size,0);
  console.log('PASS stopping cancels discovery and ignores late responses');

  e=environment(); pending=e.run('refreshAdminEspAddress()');
  e.elements.adminEspIpInput.value='192.168.2.77';
  e.requests[0].resolve(endpoint('192.168.2.42')); await pending;
  assert.equal(e.elements.adminEspIpInput.value,'192.168.2.77');
  e.run('adminEspManualIp=true; startAdminEspDiscovery();');
  await e.run('refreshAdminEspAddress()'); assert.equal(e.requests.length,1); assert.equal(e.intervals.size,0);
  console.log('PASS manual input wins over late discovery and suspends automatic updates');

  e=environment(); e.run("adminCameraActive=true;connectAdminEspStream('192.168.2.168');adminStreamMode='fast_stream';startFastFrameStream('http://192.168.2.168/capture');");
  const old=e.snapshots[0]; old.src='http://192.168.2.168/capture?t=old';
  e.run("connectAdminEspStream('192.168.2.169');"); old.onload();
  assert.equal(e.elements.adminEspImg.src,'http://192.168.2.169:81/stream');
  assert.equal(e.timers.size,0);
  console.log('PASS old snapshot cannot overwrite a new host or schedule another old request');

  e=environment(); pending=e.run("startAdminCamera('monitor')");
  await e.run("startAdminCamera('monitor')");
  assert.equal(e.requests.length,1);
  e.requests[0].resolve(endpoint('192.168.2.42')); await pending;
  assert.equal(e.elements.adminEspImg.src,'http://192.168.2.42:81/stream');
  assert(e.run('adminCameraActive')); assert.equal(e.intervals.size,1);
  e.run('stopAdminCamera()');
  assert(!e.run('adminCameraActive')); assert.equal(e.intervals.size,0);
  assert.equal(e.elements.adminEspImg.src,'');
  console.log('PASS production start/stop uses discovered host and creates one feed/poller');

  e=environment(); pending=e.run("startAdminCamera('monitor')");
  e.run('stopAdminCamera()');
  e.requests[0].resolve(endpoint('192.168.2.42')); await pending;
  assert(!e.run('adminCameraActive')); assert.equal(e.elements.adminEspImg.src,'');
  assert.equal(e.intervals.size,0);
  console.log('PASS stop during initial discovery cancels pending camera start');

  e=environment();
  e.elements.adminCamHudStatus.innerHTML='Kết quả xác minh';
  e.run("adminCameraMode='ai';adminCameraActive=true;connectAdminEspStream('192.168.2.168');");
  e.elements.adminEspImg.onload();
  assert.equal(e.elements.adminCamHudStatus.innerHTML,'Kết quả xác minh');
  e.run("startFastFrameStream('http://192.168.2.168/capture');");
  e.snapshots[0].onload();
  assert.equal(e.elements.adminCamHudStatus.innerHTML,'Kết quả xác minh');
  e.run("adminCameraMode='monitor';");e.elements.adminEspImg.onload();
  assert(e.elements.adminCamHudStatus.innerHTML.includes('Chế độ Chỉ xem'));
  console.log('PASS MJPEG/snapshot delivery preserves AI result text while monitor status still works');
})().catch(error => { console.error(error); process.exitCode=1; });
