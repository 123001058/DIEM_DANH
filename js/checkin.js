// Chức năng trang điểm danh sinh viên (checkin.html)
// Mọi kiểm tra (token QR, phiên mở/hết giờ, MSSV, trùng MSSV/thiết bị) do SERVER xử lý
// qua RPC get_open_session() và submit_attendance() — xem supabase/schema.sql.
let currentSessionId = '';
let currentRefresh = 20;
let sessionToken = null;
let deviceId = '';
let sessionStatus = { is_open: false };

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
function hideBadge(){ document.getElementById('badge').className = 'badge'; }
function showLoader(v){ document.getElementById('loader').classList.toggle('show', !!v); }
function setBtnDisabled(v){ document.getElementById('btnCheckin').disabled = !!v; }
function setSessionBox(state, html){
  const box = document.getElementById('sessionInfo');
  box.className = 'info-box ' + state;
  box.innerHTML = html;
}

async function init(){
  deviceId = getDeviceId();

  const catSel = document.getElementById('category');
  (CONFIG.CATEGORIES || []).forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });

  const url = new URL(location.href);
  const qrSession = url.searchParams.get('s');
  const qrToken = url.searchParams.get('t');

  if (qrToken) sessionToken = qrToken; // chuỗi ký bởi server, không parse ở client
  if (qrSession) currentSessionId = qrSession;

  await refreshStatus();
  setInterval(refreshStatus, 10000);
}

async function refreshStatus(){
  // Server chỉ trả về phiên ĐANG MỞ và CHƯA HẾT GIỜ mới nhất
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
  // Nếu sinh viên mở bằng mã QR của phiên cũ (đã đóng) => từ chối
  if (currentSessionId && String(data.id) !== String(currentSessionId)) {
      sessionStatus = { is_open: false };
      setSessionBox('warn', '<b>Phiên trong mã QR đã kết thúc.</b><br>Vui lòng quét lại mã mới nhất.');
      return;
  }
  currentSessionId = String(data.id);
  sessionStatus = { ...data, is_open: true };
  currentRefresh = data.refresh_time || 20;
  setSessionBox('on', `<b>Phiên đang mở:</b> ${escapeHtml(data.session_name)}<br>QR đổi mỗi <b>${currentRefresh}s</b>`);
}

async function doCheckin(){
  hideBadge();

  if (!sessionStatus.is_open){
    showBadge('err', 'Phiên điểm danh hiện đang ĐÓNG. Vui lòng quét lại mã QR.');
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

  // Bắt buộc vào bằng mã QR (có đủ tham số s và t), không cho mở thẳng checkin.html
  const qs = new URLSearchParams(location.search);
  if (!qs.get('s') || !qs.get('t') || !sessionToken){
    showBadge('err', 'Vui lòng quét mã QR để điểm danh');
    return;
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
      p_device_id: deviceId,
    });

    if (error) {
      showBadge('err', 'Lỗi: ' + escapeHtml(error.message));
    } else if (!data || !data.ok) {
      const type = data && data.code === 'ALREADY' ? 'info' : 'err';
      showBadge(type, escapeHtml((data && data.message) || 'Điểm danh thất bại.'));
    } else {
      showBadge('ok', `✓ Điểm danh thành công!<br>${escapeHtml(data.name)} — ${escapeHtml(data.mssv)}`);
      document.getElementById('mssv').value = '';
      document.getElementById('note').value = '';
    }
  } catch (e){
    showBadge('err', 'Lỗi kết nối: ' + escapeHtml(e.message));
  } finally {
    showLoader(false);
    setBtnDisabled(false);
  }
}

init();
