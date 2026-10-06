// js/checkin.js
let currentUser = null, currentProfile = null;
let currentSession = null;
let sessionToken = null;
let deviceId = '';
let scanner = null, isScanning = false;
let refreshTimer = null;

function getDeviceId(){
  let id = localStorage.getItem('device_id');
  if (!id){
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('device_id', id);
  }
  return id;
}

function fmtTime(sec){
  const m = Math.floor(sec/60), s = sec%60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function showResult(type, html){
  const box = document.getElementById('resultBox');
  box.className = 'result ' + type + ' show';
  box.innerHTML = html;
}

function hideResult(){
  document.getElementById('resultBox').className = 'result';
}

async function toggleCameraScanner(){
  if (isScanning) stopCameraScanner(); else await startCameraScanner();
}

async function startCameraScanner(){
  if (!window.Html5Qrcode) return showResult('error', 'Không tải được thư viện quét QR.');
  document.getElementById('scannerWrapper').style.display = 'block';
  document.getElementById('scanBtn').style.display = 'none';
  if (!scanner) scanner = new Html5Qrcode('qrReader');
  const cfg = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
  try {
    isScanning = true;
    await scanner.start({ facingMode: 'environment' }, cfg, onScanSuccess, () => {});
  } catch(e){
    try {
      await scanner.start({ facingMode: 'user' }, cfg, onScanSuccess, () => {});
    } catch(e2){
      isScanning = false; stopCameraScanner();
      showResult('error', 'Không mở được camera. Vui lòng cấp quyền.');
    }
  }
}

async function stopCameraScanner(){
  document.getElementById('scannerWrapper').style.display = 'none';
  document.getElementById('scanBtn').style.display = 'flex';
  if (scanner && isScanning){
    try { await scanner.stop(); } catch(e){}
    isScanning = false;
  }
  updateScanBtn();
}

function updateScanBtn(){
  const btn = document.getElementById('scanBtn');
  const status = document.getElementById('qrStatus');
  if (sessionToken){
    btn.classList.add('scanned');
    btn.innerHTML = '✓ Đã có mã QR (Bấm để quét lại)';
    status.className = 'qr-status has-token';
    status.innerHTML = '✓ Đã nhận mã QR — Sẵn sàng điểm danh';
  } else {
    btn.classList.remove('scanned');
    btn.innerHTML = '📷 Bật camera quét mã QR';
    status.className = 'qr-status no-token';
    status.innerHTML = '⚠️ Chưa có mã QR — Hãy quét mã từ màn hình';
  }
}

function parseQr(text){
  let s = null, t = null;
  try {
    if (text.startsWith('http')){
      const u = new URL(text);
      s = u.searchParams.get('s');
      t = u.searchParams.get('t');
    }
  } catch(e){}
  if (!t){
    const mt = text.match(/[?&]t=([^&]+)/);
    const ms = text.match(/[?&]s=([^&]+)/);
    if (mt) t = decodeURIComponent(mt[1]);
    if (ms) s = decodeURIComponent(ms[1]);
  }
  if (!t && /^[0-9a-f]{20,}$/i.test(text.trim())) t = text.trim();
  return { s, t };
}

async function onScanSuccess(decodedText){
  const { s, t } = parseQr(decodedText);
  if (!t) return showResult('warning', 'Mã QR không đúng định dạng điểm danh.');
  sessionToken = t;
  if (s) currentSession = { ...(currentSession || {}), id: s };
  await stopCameraScanner();
  playChime();
  showResult('success', '✓ Đã nhận mã QR — Bấm "Xác nhận điểm danh" để hoàn tất.');
}

function playChime(){
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(g).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  } catch(e){}
}

async function loadProfile(){
  const { data: auth } = await supabase.auth.getSession();
  if (!auth?.session){ location.href = 'index.html'; return false; }
  currentUser = auth.session.user;
  const { data: prof } = await supabase
    .from('profiles').select('full_name, mssv').eq('user_id', currentUser.id).maybeSingle();
  currentProfile = prof || {};
  const name = currentProfile.full_name || currentUser.email;
  const mssv = currentProfile.mssv || '';
  document.getElementById('userAvatar').textContent = (name || '?').trim().slice(-1).toUpperCase();
  document.getElementById('userName').textContent = name;
  document.getElementById('userId').textContent = 'MSSV: ' + (mssv || '—');
  document.getElementById('mssv').value = mssv;
  if (!mssv){
    showResult('error', 'Tài khoản chưa liên kết MSSV. Vui lòng liên hệ Admin.');
    return false;
  }
  return true;
}

async function loadSession(){
  const box = document.getElementById('sessionBox');
  const { data, error } = await supabase.rpc('get_open_session');
  if (error || !data){
    box.className = 'session state-closed';
    document.getElementById('sessionStatusText').textContent = 'Chưa mở';
    document.getElementById('sessionName').textContent = 'Chưa có phiên điểm danh nào đang mở';
    document.getElementById('sessionMeta').innerHTML = '';
    document.getElementById('sessionCountdown').textContent = '';
    currentSession = null;
    updateScanBtn();
    return;
  }
  currentSession = data;
  const { id, session_name, duration_min, started_at } = data;
  box.className = 'session state-open';
  document.getElementById('sessionStatusText').textContent = 'Phiên đang mở';
  document.getElementById('sessionName').textContent = session_name;
  document.getElementById('sessionTime').textContent = new Date(started_at).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
  document.getElementById('sessionMeta').innerHTML =
    `<span>🔑 ID: <code>${String(id).slice(0,8)}</code></span>` +
    (duration_min ? `<span>⏱ ${duration_min} phút</span>` : '<span>⏱ Không giới hạn</span>');

  if (sessionToken && sessionToken !== data.qr_token){
    sessionToken = null;
    updateScanBtn();
    showResult('warning', '⚠️ Mã QR đã được đổi. Vui lòng quét lại mã mới.');
  }

  clearInterval(refreshTimer);
  tickCountdown();
  refreshTimer = setInterval(tickCountdown, 1000);
}

function tickCountdown(){
  if (!currentSession) return;
  const { started_at, duration_min, warn_before_min } = currentSession;
  const el = document.getElementById('sessionCountdown');
  const box = document.getElementById('sessionBox');
  if (!duration_min){
    el.textContent = '⏱ Không giới hạn thời gian';
    return;
  }
  const end = new Date(started_at).getTime() + duration_min * 60000;
  const left = Math.max(0, Math.floor((end - Date.now())/1000));
  if (left === 0){
    box.className = 'session state-closed';
    document.getElementById('sessionStatusText').textContent = 'Đã đóng';
    el.textContent = '⏱ Phiên đã kết thúc';
    clearInterval(refreshTimer);
    currentSession = null; sessionToken = null; updateScanBtn();
    return;
  }
  const warn = (warn_before_min || 5) * 60;
  el.textContent = left <= warn
    ? `⚠️ Còn ${fmtTime(left)} — Khẩn trương!`
    : `⏱ Còn ${fmtTime(left)} để điểm danh`;
  box.className = left <= warn ? 'session state-warn' : 'session state-open';
}

async function doCheckin(){
  hideResult();
  if (!currentProfile?.mssv) return showResult('error', 'Tài khoản chưa có MSSV.');
  if (!currentSession) return showResult('error', 'Chưa có phiên điểm danh nào mở.');
  if (!sessionToken) return showResult('warning', 'Vui lòng quét mã QR trước khi điểm danh.');
  const category = document.getElementById('category').value;
  const note = document.getElementById('note').value.trim();
  if (!category) return showResult('warning', 'Vui lòng chọn Lĩnh vực.');

  const btn = document.getElementById('btnCheckin');
  btn.disabled = true;
  const oldHTML = btn.innerHTML;
  btn.innerHTML = '<span class="spin"></span> Đang xử lý...';

  try {
    const { data, error } = await supabase.rpc('submit_attendance', {
      p_session_id: String(currentSession.id),
      p_token: sessionToken,
      p_mssv: currentProfile.mssv,
      p_category: category, p_note: note, p_device_id: deviceId
    });

    if (error){
      showResult('error', 'Lỗi: ' + error.message);
    } else if (!data?.ok){
      const type = data?.code === 'ALREADY' ? 'warning' : 'error';
      showResult(type, (data?.code === 'ALREADY' ? '✓ ' : '✕ ') + (data.message || 'Điểm danh thất bại.'));
    } else {
      playChime();
      const { data: sum } = await supabase.rpc('get_session_summary', {
        p_session_id: String(currentSession.id)
      });
      const statsHTML = sum?.ok ? `
        <div class="stat-summary">
          <div class="stat-item c-present"><b>${sum.present}</b><span>Đã ĐD</span></div>
          <div class="stat-item c-absent"><b>${sum.absent}</b><span>Vắng</span></div>
          <div class="stat-item c-unmarked"><b>${sum.unmarked}</b><span>Chưa quét</span></div>
        </div>` : '';
      showResult('success', `
        <div class="result-title">✓ Điểm danh thành công</div>
        <div class="result-info">
          <b>${escapeHtml(data.name || '')}</b> · MSSV: <b>${escapeHtml(data.mssv || '')}</b><br>
          ${new Date().toLocaleString('vi-VN')}<br>
          Phiên: ${escapeHtml(currentSession.session_name)} · ${escapeHtml(category)}
        </div>
        ${statsHTML}
      `);
      document.getElementById('note').value = '';
      localStorage.setItem('saved_category', category);
    }
  } catch(e){
    showResult('error', 'Lỗi kết nối: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHTML;
  }
}

async function toggleHistory(btn){
  btn.classList.toggle('open');
  const list = document.getElementById('historyList');
  list.classList.toggle('open');
  if (list.classList.contains('open')) await loadHistory();
}

async function loadHistory(){
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="history-empty">Đang tải...</div>';
  const mssv = currentProfile?.mssv;
  if (!mssv){ list.innerHTML = '<div class="history-empty">Chưa có MSSV.</div>'; return; }
  const { data, error } = await supabase.rpc('get_my_attendance_history', { p_mssv: mssv });
  const records = data?.records || [];
  if (error || !records.length){
    list.innerHTML = '<div class="history-empty">Chưa có lịch sử điểm danh nào.</div>';
    return;
  }
  list.innerHTML = records.slice(0, 30).map(r => `
    <div class="history-item">
      <div>
        <div class="history-date">${new Date(r.checked_at).toLocaleString('vi-VN')}</div>
        <div class="history-name">${escapeHtml(r.session_name || '—')}</div>
      </div>
      <div class="history-status ${r.status === 'có mặt' ? 'ok' : 'absent'}">
        ${r.status === 'có mặt' ? '✓ Có mặt' : '✕ ' + r.status}
      </div>
    </div>
  `).join('');
}

let wakeLock = null, wakeActive = false;
async function toggleWakeLock(){
  if (!('wakeLock' in navigator)) return showResult('warning', 'Trình duyệt không hỗ trợ.');
  if (wakeActive){
    try { await wakeLock?.release(); } catch(e){}
    wakeLock = null; wakeActive = false;
  } else {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeActive = true;
      wakeLock.addEventListener('release', () => { wakeActive = false; updateWakeUI(); });
    } catch(e){ return showResult('warning', 'Không giữ được màn hình sáng.'); }
  }
  updateWakeUI();
}
function updateWakeUI(){ document.getElementById('wakeSwitch').classList.toggle('active', wakeActive); }

function logoutStudent(){
  if (!confirm('Đăng xuất khỏi tài khoản này?')) return;
  localStorage.removeItem('saved_creds');
  supabase.auth.signOut().then(() => location.href = 'index.html');
}

async function init(){
  deviceId = getDeviceId();
  const catSel = document.getElementById('category');
  (CONFIG.CATEGORIES || []).forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });
  const savedCat = localStorage.getItem('saved_category');
  if (savedCat) catSel.value = savedCat;

  if (!await loadProfile()) return;
  await loadSession();

  const url = new URL(location.href);
  const t = url.searchParams.get('t');
  if (t){ sessionToken = t; updateScanBtn(); }

  setInterval(loadSession, 15000);
  document.getElementById('note').addEventListener('keydown', e => {
    if (e.key === 'Enter') doCheckin();
  });

  // Realtime QR change
  supabase.channel('session_changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, payload => {
      if (currentSession && payload.new.id === currentSession.id){
        if (payload.new.qr_token !== currentSession.qr_token){
          currentSession.qr_token = payload.new.qr_token;
          if (sessionToken){
            sessionToken = null; updateScanBtn();
            showResult('warning', '⚠️ Mã QR đã được đổi. Vui lòng quét lại.');
          }
        }
        if (payload.new.is_open === false){ currentSession = null; loadSession(); }
      }
    }).subscribe();
}

init();