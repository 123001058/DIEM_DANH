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

  // Tự điền MSSV và Lĩnh vực đã lưu
  const savedMssv = localStorage.getItem('saved_mssv');
  const savedCat = localStorage.getItem('saved_category');
  if (savedMssv) {
    const m = document.getElementById('mssv');
    if (m && !m.value) m.value = savedMssv;
  }
  if (savedCat && catSel) {
    catSel.value = savedCat;
  }

  // Kiểm tra xem sinh viên có đang đăng nhập hay không
  try {
    const { data: authData } = await supabase.auth.getSession();
    const user = authData?.session?.user;
    if (user) {
      loggedInUser = user;
      const meta = user.user_metadata || {};
      const stName = meta.name || '';
      const stMssv = meta.mssv || '';
      const banner = document.getElementById('studentAuthBanner');
      if (banner) {
        banner.style.display = 'block';
        banner.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <span>👋 Xin chào: <b>${escapeHtml(stName || user.email)}</b>${stMssv ? ' (MSSV: <b>' + escapeHtml(stMssv) + '</b>)' : ''}</span>
            <button type="button" onclick="logoutStudent()" style="background:none;border:none;color:var(--err);font-weight:700;cursor:pointer;font-size:12px;text-decoration:underline;">Đăng xuất</button>
          </div>
        `;
      }
      if (stMssv) {
        const m = document.getElementById('mssv');
        if (m) {
          m.value = stMssv;
          m.readOnly = true;
          m.style.background = 'var(--surface-2)';
        }
        const hint = document.getElementById('mssvHint');
        if (hint) hint.innerText = '🔒 Đã tự động điền và khóa theo tài khoản đăng nhập';
      }
    }
  } catch (e) {
    console.warn('[init auth check]', e);
  }

  const url = new URL(location.href);
  qrSessionId = url.searchParams.get('s');
  const qrToken = url.searchParams.get('t');

  if (qrToken) sessionToken = qrToken;
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

  const qs = new URLSearchParams(location.search);
  const hasQrParams = qs.get('s') && qs.get('t') && sessionToken;

  // Nếu không đăng nhập và cũng không có mã QR
  if (!hasQrParams && !loggedInUser) {
    showBadge('err', 'Vui lòng quét mã QR trên màn hình hoặc Đăng nhập tài khoản để điểm danh.');
    return;
  }

  setBtnDisabled(true);
  showLoader(true);

  try {
    // 1. Nếu đã đăng nhập tài khoản sinh viên: gọi RPC có xác thực
    if (loggedInUser) {
      const { data, error } = await supabase.rpc('submit_attendance_authenticated', {
        p_session_id: currentSessionId,
        p_category: category,
        p_note: document.getElementById('note').value.trim(),
        p_device_id: deviceId
      });

      if (error && error.message.includes('submit_attendance_authenticated')) {
        // Fallback nếu chưa tạo RPC mới
        const res = await supabase.rpc('submit_attendance', {
          p_session_id: currentSessionId,
          p_token: sessionToken || '0.000000000000000000000000',
          p_mssv: mssv,
          p_category: category,
          p_note: document.getElementById('note').value.trim(),
          p_device_id: deviceId
        });
        handleCheckinResponse(res.data, res.error, mssv, category);
      } else {
        handleCheckinResponse(data, error, mssv, category);
      }
      return;
    }

    // 2. Nếu quét mã QR trực tiếp (chưa đăng nhập)
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
