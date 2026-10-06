// js/admin.js
let currentSession = null;     // { id, session_name, duration_min, warn_before_min, started_at, qr_token, qr_born_at }
let students = [];             // [{mssv,name}]
let attendanceMap = {};        // { mssv: {status, time, category, note} }
let currentFilter = 'all';
let currentSearch = '';
let currentPage = 1;
let pageSize = 20;
let countdownTimer = null;
let autoClosed = false;

const STATUS_LABEL = {
  'có mặt': 'có mặt',
  'vắng có phép': 'vắng có phép',
  'vắng không phép': 'vắng không phép'
};

// ============ UTILS ============
function showResult(){}
function fmtTime(sec){
  const m = Math.floor(sec/60), s = sec%60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
function fmtClock(d){
  return d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function toast(type, title, text, duration = 4500){
  const wrap = document.getElementById('toastWrap');
  const icons = { ok:'✓', err:'✕', warn:'⚠', info:'ℹ' };
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.innerHTML = `
    <div class="toast-ic">${icons[type] || 'ℹ'}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${text ? `<div class="toast-text">${text}</div>` : ''}
    </div>
  `;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ============ AUTH ============
async function checkAuth(){
  const { data: auth } = await supabase.auth.getSession();
  if (!auth?.session){ location.href = 'index.html'; return null; }

  const { data: isAdm } = await supabase.rpc('is_admin');
  if (!isAdm){
    alert('Tài khoản này không có quyền truy cập trang quản lý.');
    await supabase.auth.signOut();
    location.href = 'index.html';
    return null;
  }

  const { data: prof } = await supabase
    .from('profiles').select('full_name, mssv').eq('user_id', auth.session.user.id).maybeSingle();

  document.getElementById('adminName').textContent = prof?.full_name || '—';
  document.getElementById('adminMssv').textContent = prof?.mssv || '—';

  supabase.auth.onAuthStateChange(e => {
    if (e === 'SIGNED_OUT') location.href = 'index.html';
  });
  return auth.session.user;
}

async function logout(){
  if (!confirm('Đăng xuất khỏi hệ thống?')) return;
  await supabase.auth.signOut();
  location.href = 'index.html';
}

// ============ LOAD DATA ============
async function loadStudents(){
  const { data, error } = await supabase.from('students').select('mssv, name').order('mssv');
  if (error){ console.error(error); return; }
  students = data || [];
}

async function loadSession(){
  const { data, error } = await supabase.rpc('get_open_session');
  if (error || !data){
    currentSession = null;
    showEmpty();
    return null;
  }
  currentSession = data;
  return data;
}

async function loadAttendance(){
  if (!currentSession) return;
  const { data, error } = await supabase.from('attendance')
    .select('mssv, full_name, status, category, note, created_at')
    .eq('session_id', currentSession.id);
  if (error){ console.error(error); return; }

  attendanceMap = {};
  (data || []).forEach(r => {
    attendanceMap[r.mssv] = {
      status: r.status,
      time: fmtClock(new Date(r.created_at)),
      category: r.category || '',
      note: r.note || ''
    };
  });
}

// ============ UI: EMPTY / DASHBOARD ============
function showEmpty(){
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-off';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đã đóng</span>';
  clearInterval(countdownTimer);
}

function showDashboard(){
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-on';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đang mở</span>';
}

// ============ QR ============
function renderQR(){
  const canvas = document.getElementById('qrCanvas');
  canvas.innerHTML = '';
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  const url = `${base}/checkin.html?s=${encodeURIComponent(currentSession.id)}&t=${encodeURIComponent(currentSession.qr_token)}`;
  new QRCode(canvas, { text: url, width: 360, height: 360, correctLevel: QRCode.CorrectLevel.M });
  document.getElementById('qrBorn').textContent = fmtClock(new Date(currentSession.qr_born_at));
}

async function regenerateQR(){
  const btn = document.getElementById('btnRefreshQr');
  btn.disabled = true;
  const old = btn.innerHTML;
  btn.innerHTML = '⏳ Đang tạo...';
  try {
    const { data, error } = await supabase.rpc('admin_regenerate_qr');
    if (error || !data?.ok) throw new Error(data?.message || error?.message);
    currentSession.qr_token = data.qr_token;
    currentSession.qr_born_at = data.qr_born_at;
    renderQR();
    toast('ok', 'Đã đổi mã QR', 'Mã cũ không còn hiệu lực.');
  } catch(e){
    toast('err', 'Đổi QR thất bại', e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

function toggleFullscreen(){
  const el = document.getElementById('qrPanel');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen().catch(() => toast('err', 'Không hỗ trợ', 'Trình duyệt chặn.'));
}

// ============ STATS + FILTERS ============
function updateStats(){
  const total = students.length;
  let present = 0, absent = 0, unmarked = 0;
  students.forEach(s => {
    const a = attendanceMap[s.mssv];
    if (!a) unmarked++;
    else if (a.status === 'có mặt') present++;
    else absent++;
  });
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent = absent;
  document.getElementById('statUnmarked').textContent = unmarked;
  const pct = total ? Math.round((present / total) * 100) : 0;
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressFill').style.width = pct + '%';

  const f = document.querySelectorAll('.filter');
  f[0].querySelector('.count').textContent = total;
  f[1].querySelector('.count').textContent = present;
  f[2].querySelector('.count').textContent = absent;
  f[3].querySelector('.count').textContent = unmarked;
}

function renderTable(){
  const list = students.filter(s => {
    const a = attendanceMap[s.mssv];
    const status = !a ? 'unmarked' : (a.status === 'có mặt' ? 'present' : 'absent');
    const ok1 = currentFilter === 'all' || currentFilter === status;
    const q = currentSearch.toLowerCase();
    const ok2 = !q || s.name.toLowerCase().includes(q) || s.mssv.includes(q);
    return ok1 && ok2;
  });

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  const page = list.slice(start, start + pageSize);

  const tbody = document.getElementById('studentTbody');
  if (!page.length){
    tbody.innerHTML = `
      <tr><td colspan="4">
        <div class="tbl-empty">
          <div class="tbl-empty-icon">🔍</div>
          <b>Không có sinh viên nào</b>
          <span>Thử đổi bộ lọc hoặc từ khoá.</span>
        </div>
      </td></tr>`;
  } else {
    tbody.innerHTML = page.map(s => {
      const a = attendanceMap[s.mssv];
      const status = a?.status || 'unmarked';
      const selClass = status === 'có mặt' ? 'st-ok' : status === 'unmarked' ? 'st-none' : 'st-no';
      return `
        <tr data-mssv="${s.mssv}">
          <td>
            <div class="student-cell">
              <div class="avt">${s.name.trim().slice(-1)}</div>
              <div class="td-name">${escapeHtml(s.name)}</div>
            </div>
          </td>
          <td class="td-mono">${s.mssv}</td>
          <td>
            <select class="status-select ${selClass}" onchange="changeStatus('${s.mssv}', this.value)">
              <option value="unmarked" ${status==='unmarked'?'selected':''} disabled>Chưa quét</option>
              <option value="có mặt" ${status==='có mặt'?'selected':''}>Có mặt</option>
              <option value="vắng có phép" ${status==='vắng có phép'?'selected':''}>Vắng có phép</option>
              <option value="vắng không phép" ${status==='vắng không phép'?'selected':''}>Vắng không phép</option>
            </select>
          </td>
          <td class="td-mono">${a?.time || '—'}</td>
        </tr>`;
    }).join('');
  }

  const end = Math.min(start + pageSize, total);
  document.getElementById('pagerInfo').innerHTML =
    total === 0 ? 'Không có sinh viên nào'
    : `Hiển thị <b>${start+1}–${end}</b> / <b>${total}</b>`;
  document.getElementById('pagerNum').innerHTML = `<b>${currentPage}</b>/${totalPages}`;
  document.getElementById('pagerPrev').disabled = currentPage <= 1;
  document.getElementById('pagerNext').disabled = currentPage >= totalPages;
}

function renderFeed(){
  const feed = document.getElementById('feedList');
  const recent = Object.entries(attendanceMap)
    .filter(([_, a]) => a.status === 'có mặt')
    .sort((a, b) => (b[1].time || '').localeCompare(a[1].time || ''))
    .slice(0, 5);
  if (!recent.length){
    feed.innerHTML = '<div class="feed-empty">Chưa có ai điểm danh</div>';
    return;
  }
  feed.innerHTML = recent.map(([mssv, a]) => {
    const s = students.find(x => x.mssv === mssv);
    const name = s?.name || mssv;
    return `<div class="feed-item">
      <div class="feed-avt">${name.trim().slice(-1)}</div>
      <div class="feed-name">${escapeHtml(name)}</div>
      <div class="feed-time">${a.time || '—'}</div>
    </div>`;
  }).join('');
}

// ============ ACTIONS ============
async function openSession(){
  const name = document.getElementById('quickName').value.trim();
  const dur = parseInt(document.getElementById('quickDuration').value, 10) || 90;
  if (!name) return toast('err', 'Thiếu tên phiên', 'Vui lòng nhập tên phiên.');
  const warn = Math.min(30, Math.max(1, Math.floor(dur / 10)));

  const { data, error } = await supabase.rpc('admin_open_session', {
    p_name: name, p_duration_min: dur, p_warn_before_min: warn
  });
  if (error || !data?.ok) return toast('err', 'Không mở được phiên', data?.message || error?.message);
  toast('ok', 'Đã mở phiên', `"${name}" — ${dur} phút`);
  await refreshAll();
}

async function changeStatus(mssv, newStatus){
  if (newStatus === 'unmarked'){
    toast('warn', 'Không thể đặt "Chưa quét"', 'Chọn "Vắng" hoặc "Có mặt".');
    renderTable();
    return;
  }
  const { data, error } = await supabase.rpc('admin_set_status', {
    p_session_id: String(currentSession.id),
    p_mssv: mssv, p_status: newStatus
  });
  if (error || !data?.ok){
    toast('err', 'Cập nhật thất bại', data?.message || error?.message);
    return;
  }
  const s = students.find(x => x.mssv === mssv);
  toast('ok', 'Đã cập nhật', `${s?.name} → ${newStatus}`);
  await loadAttendance();
  renderAll();
}

let _bulkCb = null;
function showBulkModal(title, text, cb){
  document.getElementById('bulkTitle').textContent = title;
  document.getElementById('bulkText').innerHTML = text;
  _bulkCb = cb;
  document.getElementById('bulkModal').classList.add('show');
}
function closeBulkModal(){ document.getElementById('bulkModal').classList.remove('show'); _bulkCb = null; }
document.getElementById('bulkConfirmBtn').addEventListener('click', () => {
  if (_bulkCb) _bulkCb();
  closeBulkModal();
});

function confirmMarkAllAbsent(){
  const list = students.filter(s => !attendanceMap[s.mssv]);
  if (!list.length) return toast('info', 'Không có SV nào chưa quét');
  showBulkModal('Đánh dấu vắng?',
    `Sẽ đánh dấu <b>${list.length} sinh viên</b> thành "Vắng không phép".`,
    async () => {
      const { data, error } = await supabase.rpc('admin_batch_set_status', {
        p_session_id: String(currentSession.id),
        p_mssv_list: list.map(s => s.mssv),
        p_status: 'vắng không phép'
      });
      if (error || !data?.ok) return toast('err', 'Lỗi', data?.message || error?.message);
      toast('ok', 'Đã cập nhật', `${data.count} sinh viên → Vắng`);
      await loadAttendance();
      renderAll();
    });
}

function confirmMarkAllPresent(){
  showBulkModal('Đánh dấu có mặt tất cả?',
    `Sẽ đánh dấu <b>TẤT CẢ ${students.length} sinh viên</b> thành "Có mặt". Thao tác này ghi đè trạng thái vắng.`,
    async () => {
      const { data, error } = await supabase.rpc('admin_batch_set_status', {
        p_session_id: String(currentSession.id),
        p_mssv_list: students.map(s => s.mssv),
        p_status: 'có mặt'
      });
      if (error || !data?.ok) return toast('err', 'Lỗi', data?.message || error?.message);
      toast('ok', 'Đã cập nhật', `${data.count} sinh viên → Có mặt`);
      await loadAttendance();
      renderAll();
    });
}

// ============ CLOSE SESSION ============
function openCloseModal(){
  let present = 0, absent = 0, unmarked = 0;
  students.forEach(s => {
    const a = attendanceMap[s.mssv];
    if (!a) unmarked++;
    else if (a.status === 'có mặt') present++;
    else absent++;
  });
  document.getElementById('modalPresent').textContent = present;
  document.getElementById('modalAbsent').textContent = absent;
  document.getElementById('modalUnmarked').textContent = unmarked;
  const warn = document.getElementById('modalWarnText');
  if (unmarked > 0){
    warn.style.display = 'block';
    warn.innerHTML = `💡 Có <b>${unmarked} sinh viên chưa quét</b>. Bạn có thể đánh dấu vắng trước khi đóng.`;
  } else {
    warn.style.display = 'none';
  }
  document.getElementById('closeModal').classList.add('show');
}
function closeModalFn(){ document.getElementById('closeModal').classList.remove('show'); }
async function confirmCloseSession(){
  closeModalFn();
  const { data, error } = await supabase.rpc('admin_close_session');
  if (error || !data?.ok) return toast('err', 'Đóng phiên thất bại', data?.message || error?.message);
  toast('ok', 'Đã đóng phiên', 'Lịch sử được lưu trong mục "Lịch sử hôm nay".');
  currentSession = null;
  showEmpty();
  await loadTodayHistory();
}

// ============ TODAY HISTORY ============
async function loadTodayHistory(){
  const { data, error } = await supabase.rpc('admin_today_sessions');
  const wrap = document.getElementById('todayHistoryWrap');
  const list = document.getElementById('todayHistoryList');
  if (error || !data?.ok || !data.sessions?.length){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  list.innerHTML = data.sessions.map(s => {
    const t = new Date(s.started_at).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
    const badge = s.is_open
      ? '<span class="rk-badge doing">Đang mở</span>'
      : '<span class="rk-badge todo">Đã đóng</span>';
    return `<div class="today-history-item">
      <div>
        <div class="today-history-name">${escapeHtml(s.session_name)} ${badge}</div>
        <div class="today-history-meta">Bắt đầu ${t} · ${s.total} SV · <span style="color:var(--ok)">${s.present} ĐD</span> · <span style="color:var(--err)">${s.absent} vắng</span></div>
      </div>
    </div>`;
  }).join('');
}

// ============ COUNTDOWN ============
function startCountdown(){
  clearInterval(countdownTimer);
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 1000);
}

function tickCountdown(){
  if (!currentSession) return;
  const chip = document.getElementById('countdownChip');
  const txt = document.getElementById('countdownText');
  const warnEl = document.getElementById('qrWarning');

  if (!currentSession.duration_min){
    txt.textContent = '∞';
    chip.className = 'countdown-chip';
    warnEl.classList.remove('show');
    return;
  }
  const start = new Date(currentSession.started_at).getTime();
  const end = start + currentSession.duration_min * 60000;
  const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const warn = (currentSession.warn_before_min || 5) * 60;

  if (left === 0){
    txt.textContent = '00:00';
    chip.className = 'countdown-chip danger';
    warnEl.classList.add('show');
    if (!autoClosed){
      autoClosed = true;
      toast('warn', 'Phiên đã tự đóng', 'Hết thời gian mở phiên.');
      confirmCloseSession();
    }
    return;
  }

  txt.textContent = fmtTime(left);
  if (left <= warn){
    chip.className = 'countdown-chip danger';
    warnEl.classList.add('show');
  } else if (left <= warn * 2){
    chip.className = 'countdown-chip warn';
    warnEl.classList.remove('show');
  } else {
    chip.className = 'countdown-chip';
    warnEl.classList.remove('show');
  }
}

// ============ REALTIME ============
let _lastMssvSet = new Set();
function setupRealtime(){
  supabase.channel('admin-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'attendance' },
      async payload => {
        if (!currentSession) return;
        if (payload.new && payload.new.session_id !== currentSession.id) return;
        await loadAttendance();
        renderAll();
        // Thông báo khi có SV mới ĐD
        if (payload.eventType === 'INSERT' && payload.new.mssv && !_lastMssvSet.has(payload.new.mssv)){
          _lastMssvSet.add(payload.new.mssv);
          const s = students.find(x => x.mssv === payload.new.mssv);
          toast('ok', 'SV vừa điểm danh', `${s?.name || payload.new.mssv} · ${fmtClock(new Date())}`);
        }
      })
    .subscribe();
}

// ============ RENDER ALL ============
function renderAll(){
  updateStats();
  renderTable();
  renderFeed();
}

async function refreshAll(){
  await loadSession();
  if (!currentSession){ showEmpty(); return; }
  showDashboard();
  document.getElementById('sessionBarName').textContent = currentSession.session_name;
  document.getElementById('sessionStartTime').textContent = new Date(currentSession.started_at).toLocaleString('vi-VN');
  document.getElementById('sessionIdDisplay').textContent = String(currentSession.id).slice(0, 8);
  document.getElementById('sessionDurationDisplay').textContent = currentSession.duration_min ? `${currentSession.duration_min} phút` : 'Không giới hạn';
  _lastMssvSet = new Set();
  await loadAttendance();
  Object.entries(attendanceMap).forEach(([m]) => _lastMssvSet.add(m));
  renderQR();
  renderAll();
  startCountdown();
  autoClosed = false;
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return;

  // Nếu URL có ?s=<session_id> thì admin vào xem lại phiên cũ — bỏ qua, hiển thị như bình thường
  await loadStudents();
  await refreshAll();
  await loadTodayHistory();
  setupRealtime();

  // Filter tabs
  document.getElementById('filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter');
    if (!btn) return;
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    currentPage = 1;
    renderTable();
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', e => {
    currentSearch = e.target.value.trim();
    currentPage = 1;
    renderTable();
  });

  // Pagination
  document.getElementById('pagerSize').addEventListener('change', e => {
    pageSize = parseInt(e.target.value, 10);
    currentPage = 1;
    renderTable();
  });
  document.getElementById('pagerPrev').addEventListener('click', () => {
    currentPage = Math.max(1, currentPage - 1);
    renderTable();
  });
  document.getElementById('pagerNext').addEventListener('click', () => {
    currentPage++;
    renderTable();
  });

  // Network
  window.addEventListener('online', () => {
    document.getElementById('netBadge').className = 'net-badge net-online';
    document.getElementById('netBadge').innerHTML = '<span class="net-dot"></span><span>Online</span>';
    document.getElementById('offlineBanner').classList.remove('show');
  });
  window.addEventListener('offline', () => {
    document.getElementById('netBadge').className = 'net-badge net-offline';
    document.getElementById('netBadge').innerHTML = '<span class="net-dot"></span><span>Offline</span>';
    document.getElementById('offlineBanner').classList.add('show');
  });

  // Polling backup mỗi 30s
  setInterval(() => {
    if (currentSession) loadAttendance().then(renderAll);
  }, 30000);
});
