// Chức năng trang điểm danh sinh viên (checkin.html)
let currentSessionId = '';
let qrSessionId = null;
let currentRefresh = 20;
let sessionToken = null;
let deviceId = '';
let sessionStatus = { is_open: false };
let loggedInUser = null;

function getDeviceId(){
  let id = localStorage.getItem('device_id');
  if (!id){
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('device_id', id);
  }
  return id;
}

function showBadge(type, text){
  const b = document.getElementById('badge');
  b.className = 'badge show ' + type;
  b.innerHTML = text;
}

function hideBadge(){
  document.getElementById('badge').className = 'badge';
}

function showLoader(v){
  document.getElementById('loader').classList.toggle('show', !!v);
}

function setBtnDisabled(v){
  document.getElementById('btnCheckin').disabled = !!v;
}

function setSessionBox(state, html){
  const box = document.getElementById('sessionInfo');
  box.className = 'info-box ' + state;
  box.innerHTML = html;
}

function playSuccessSound(){
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

// ==========================================
// CAMERA SCANNER QUÉT MÃ QR TRỰC TIẾP
// ==========================================
let html5QrScanner = null;
let isScanning = false;

function parseQrData(text){
  let s = null, t = null;
  if (!text) return { s, t };
  try {
    if (text.startsWith('http://') || text.startsWith('https://')) {
      const u = new URL(text);
      s = u.searchParams.get('s');
      t = u.searchParams.get('t');
    }
  } catch (e) {}

  if (!t) {
    const matchT = text.match(/[?&]t=([^&]+)/);
    const matchS = text.match(/[?&]s=([^&]+)/);
    if (matchT) t = decodeURIComponent(matchT[1]);
    if (matchS) s = decodeURIComponent(matchS[1]);
  }

  if (!t) {
    try {
      const obj = JSON.parse(text);
      if (obj.t) t = obj.t;
      if (obj.s) s = obj.s;
    } catch (e) {}
  }

  // Token thuần [win].[hash]
  if (!t && /^[0-9]{1,12}\.[0-9a-f]{24}$/.test(text.trim())) {
    t = text.trim();
  }

  return { s, t };
}

async function startCameraScanner(){
  const wrapper = document.getElementById('scannerWrapper');
  const btnText = document.getElementById('scannerBtnText');
  if (wrapper) wrapper.style.display = 'block';
  if (btnText) btnText.innerHTML = '⏹ Dừng Camera quét mã';

  if (!window.Html5Qrcode) {
    showBadge('err', 'Chưa tải được thư viện quét mã QR. Vui lòng tải lại trang.');
    return;
  }

  if (!html5QrScanner) {
    html5QrScanner = new Html5Qrcode("qrReader");
  }

  const config = {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0
  };

  try {
    isScanning = true;
    await html5QrScanner.start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      () => {}
    );
  } catch (err) {
    console.warn('[Camera environment failed, trying user camera]', err);
    try {
      await html5QrScanner.start(
        { facingMode: "user" },
        config,
        onScanSuccess,
        () => {}
      );
    } catch (fallbackErr) {
      console.error('[Camera fallback failed]', fallbackErr);
      isScanning = false;
      stopCameraScanner();
      showBadge('err', 'Không thể mở Camera: ' + (err.message || 'Hãy cấp quyền truy cập Camera cho trình duyệt'));
    }
  }
}

async function stopCameraScanner(){
  const wrapper = document.getElementById('scannerWrapper');
  const btnText = document.getElementById('scannerBtnText');
  if (wrapper) wrapper.style.display = 'none';
  if (btnText) {
    btnText.innerHTML = sessionToken
      ? '✓ Đã có mã QR (Bấm nếu muốn quét lại)'
      : '📷 Bật Camera quét mã QR trực tiếp';
  }

  if (html5QrScanner && isScanning) {
    try {
      await html5QrScanner.stop();
    } catch (e) {
      console.warn('[stopCameraScanner]', e);
    } finally {
      isScanning = false;
    }
  }
}

function toggleCameraScanner(){
  if (isScanning) {
    stopCameraScanner();
  } else {
    startCameraScanner();
  }
}

async function onScanSuccess(decodedText){
  const { s, t } = parseQrData(decodedText);
  if (!t) {
    showBadge('warn', 'Mã QR không đúng định dạng điểm danh. Hãy hướng camera vào mã QR trên màn hình Admin.');
    return;
  }

  sessionToken = t;
  if (s) {
    qrSessionId = s;
    currentSessionId = s;
  }

  await stopCameraScanner();
  playSuccessSound();

  const mssv = document.getElementById('mssv').value.trim();
  const category = document.getElementById('category').value;

  if (!loggedInUser) {
    showBadge('err', '✓ Đã nhận mã QR! Tuy nhiên bạn chưa đăng nhập tài khoản sinh viên. Vui lòng đăng nhập để điểm danh.');
    return;
  }

  if (!mssv) {
    showBadge('info', '✓ Đã quét mã QR thành công! Vui lòng nhập MSSV rồi bấm Xác nhận.');
    document.getElementById('mssv').focus();
    return;
  }

  if (!category) {
    showBadge('info', '✓ Đã quét mã QR thành công! Vui lòng chọn Lĩnh vực rồi bấm Xác nhận.');
    document.getElementById('category').focus();
    return;
  }

  showBadge('info', '✓ Đã nhận mã QR! Đang gửi điểm danh...');
  await doCheckin();
}

async function logoutStudent(){
  await supabase.auth.signOut();
  location.href = 'index.html';
}

async function init(){
  deviceId = getDeviceId();

  const catSel = document.getElementById('category');
  (CONFIG.CATEGORIES || []).forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    catSel.appendChild(o);
  });

  const savedCat = localStorage.getItem('saved_category');
  if (savedCat && catSel) {
    catSel.value = savedCat;
  }

  // 1. Kiểm tra tài khoản sinh viên đăng nhập và tự động nhận diện MSSV
  try {
    const { data: authData } = await supabase.auth.getSession();
    const user = authData?.session?.user;
    if (user) {
      loggedInUser = user;

      // Đọc profile của chính mình qua RLS (profiles_read_self)
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('mssv, full_name, username, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profErr) {
        console.warn('[init profiles query]', profErr);
      }

      // Ưu tiên MSSV từ profiles, nếu chưa có thì lấy từ metadata lúc đăng ký
      const meta = user.user_metadata || {};
      const stMssv = (profile?.mssv || meta.mssv || '').trim();
      const stName = profile?.full_name || meta.name || profile?.username || user.email;

      const banner = document.getElementById('studentAuthBanner');
      if (banner) {
        banner.style.display = 'block';
        banner.style.background = 'var(--info-bg, rgba(59, 130, 246, 0.1))';
        banner.style.color = 'var(--info, #2563eb)';
        banner.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <span>👋 Xin chào: <b>${escapeHtml(stName)}</b>${stMssv ? ' (MSSV: <b>' + escapeHtml(stMssv) + '</b>)' : ''}</span>
            <button type="button" onclick="logoutStudent()" style="background:none;border:none;color:var(--err, #ef4444);font-weight:700;cursor:pointer;font-size:12px;text-decoration:underline;">Đăng xuất</button>
          </div>
        `;
      }

      const m = document.getElementById('mssv');
      const hint = document.getElementById('mssvHint');
      if (stMssv) {
        if (m) {
          m.value = stMssv;
          m.readOnly = true;
          m.style.background = 'var(--surface-2)';
        }
        if (hint) {
          hint.style.color = 'var(--text-muted)';
          hint.innerText = '🔒 Đã tự động điền và khóa theo tài khoản sinh viên';
        }
      } else {
        if (m) {
          m.readOnly = false;
          m.placeholder = 'Nhập mã số sinh viên';
          m.style.background = '';
        }
        if (hint) {
          hint.style.color = '';
          hint.innerText = 'Nhập đúng MSSV của bạn trong danh sách lớp';
        }
      }
    } else {
      // Chưa đăng nhập
      const banner = document.getElementById('studentAuthBanner');
      if (banner) {
        banner.style.display = 'block';
        banner.style.background = 'var(--err-bg, #f8d7da)';
        banner.style.color = 'var(--err, #721c24)';
        banner.innerHTML = `
          <span>⚠️ Bạn chưa đăng nhập. Vui lòng <a href="index.html" style="color:var(--primary, #3b82f6);font-weight:700;text-decoration:underline;">Đăng nhập tài khoản sinh viên</a> trước khi điểm danh.</span>
        `;
      }
      const hint = document.getElementById('mssvHint');
      if (hint) {
        hint.style.color = 'var(--err, #ef4444)';
        hint.innerText = '⚠️ Bắt buộc đăng nhập tài khoản sinh viên để điểm danh';
      }
    }
  } catch (e) {
    console.warn('[init auth check]', e);
  }

  const url = new URL(location.href);
  qrSessionId = url.searchParams.get('s');
  const qrToken = url.searchParams.get('t');

  if (qrToken) {
    sessionToken = qrToken;
    const btnText = document.getElementById('scannerBtnText');
    if (btnText) btnText.innerHTML = '✓ Đã nhận mã QR (Bấm nếu muốn quét lại qua Camera)';
  }
  if (qrSessionId) currentSessionId = qrSessionId;

  await refreshStatus();
  setInterval(refreshStatus, 10000);
}

async function refreshStatus(){
  const { data, error } = await supabase.rpc('get_open_session');
  if (error) {
    console.error('[refreshStatus]', error);
    setSessionBox('warn', 'Lỗi kết nối server: ' + escapeHtml(error.message));
    return;
  }
  if (!data) {
    sessionStatus = { is_open: false };
    setSessionBox('off', '<b>Chưa có phiên điểm danh nào đang mở.</b>');
    return;
  }

  // Nếu mở bằng mã QR của phiên cũ đã đóng
  if (qrSessionId && String(data.id) !== String(qrSessionId)) {
    sessionStatus = { is_open: false };
    setSessionBox('warn', '<b>Phiên trong mã QR đã kết thúc.</b><br>Vui lòng quét lại mã mới nhất trên màn hình.');
    return;
  }

  currentSessionId = String(data.id);
  sessionStatus = { ...data, is_open: true };
  currentRefresh = data.refresh_time || 20;
  setSessionBox('on', `<b>Phiên đang mở:</b> ${escapeHtml(data.session_name)}<br>QR đổi mỗi <b>${currentRefresh}s</b>`);
}

function handleCheckinResponse(data, error, mssv, category){
  if (error) {
    showBadge('err', 'Lỗi: ' + escapeHtml(error.message));
  } else if (!data || !data.ok) {
    const type = data && data.code === 'ALREADY' ? 'info' : 'err';
    showBadge(type, escapeHtml((data && data.message) || 'Điểm danh thất bại.'));
  } else {
    localStorage.setItem('saved_mssv', mssv);
    localStorage.setItem('saved_category', category);
    playSuccessSound();
    showBadge('ok', `✓ Điểm danh thành công!<br><b>${escapeHtml(data.name || mssv)}</b> — MSSV: <b>${escapeHtml(data.mssv || mssv)}</b>`);
    document.getElementById('note').value = '';
  }
}

async function doCheckin(){
  hideBadge();

  if (!sessionStatus.is_open){
    showBadge('err', 'Phiên điểm danh hiện đang ĐÓNG. Vui lòng đợi quản lý mở phiên.');
    return;
  }

  // 1. Kiểm tra đăng nhập
  if (!loggedInUser) {
    showBadge('err', 'Bạn chưa đăng nhập! Vui lòng <a href="index.html" style="color:inherit;font-weight:700;text-decoration:underline;">Đăng nhập tài khoản sinh viên</a> để điểm danh.');
    return;
  }

  // 2. Kiểm tra mã QR
  if (!sessionToken) {
    showBadge('err', 'Thiếu mã QR điểm danh. Vui lòng quét mã QR đang hiển thị trên màn hình.');
    return;
  }

  const mssv = document.getElementById('mssv').value.trim();
  const category = document.getElementById('category').value;

  if (!mssv){
    showBadge('err', 'Vui lòng nhập MSSV!');
    document.getElementById('mssv').focus();
    return;
  }
  if (!category){
    showBadge('err', 'Vui lòng chọn Lĩnh vực!');
    document.getElementById('category').focus();
    return;
  }

  // 3. Kiểm tra và đảm bảo deviceId
  if (!deviceId) {
    deviceId = getDeviceId();
  }

  setBtnDisabled(true);
  showLoader(true);

  try {
    const { data, error } = await supabase.rpc('submit_attendance', {
      p_session_id: currentSessionId,
      p_token: sessionToken,
      p_mssv: mssv,
      p_category: category,
      p_note: document.getElementById('note').value.trim(),
      p_device_id: deviceId
    });

    handleCheckinResponse(data, error, mssv, category);
  } catch (e){
    showBadge('err', 'Lỗi kết nối: ' + escapeHtml(e.message));
  } finally {
    showLoader(false);
    setBtnDisabled(false);
  }
}

// Bắt sự kiện phím Enter
document.addEventListener('DOMContentLoaded', () => {
  const m = document.getElementById('mssv');
  const n = document.getElementById('note');
  if (m) m.addEventListener('keydown', e => { if (e.key === 'Enter') doCheckin(); });
  if (n) n.addEventListener('keydown', e => { if (e.key === 'Enter') doCheckin(); });
});

init();
