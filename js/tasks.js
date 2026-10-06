/**
 * DIEM_DANH — js/tasks.js  (v2)
 * Trang nhiệm vụ cho THÀNH VIÊN.
 * - Hiển thị nhiệm vụ đang mở với nút ✓ Hoàn thành to, rõ ràng
 * - Tab lịch sử: xem toàn bộ nhiệm vụ đã giao (kể cả done)
 */

let myAuth = null;
let myTeam = null;
let myTasks = [];        // tất cả nhiệm vụ được giao cho mình
let _historyOpen = false;

// ============================================================
// KHỞI TẠO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  myAuth = await requireRoles([], 'trang nhiệm vụ');
  if (!myAuth) return;

  // Chip vai trò
  const chip = document.getElementById('roleChip');
  if (myAuth.isLeader) {
    chip.textContent = 'Đội trưởng';
    chip.className = 'rk-role-chip chip-leader';
  } else if (myAuth.isDeputy) {
    chip.textContent = 'Đội phó';
    chip.className = 'rk-role-chip chip-deputy';
  } else if (myAuth.isAdmin) {
    chip.textContent = 'Quản trị viên';
    chip.className = 'rk-role-chip chip-admin';
  }

  const sub = document.getElementById('mySubtitle');
  if (sub) sub.textContent = `Xin chào, ${myAuth.displayName}`;

  await loadMyTeam();
  await loadMyTasks();
  renderMyTasks();
  updateStats();
});

// ============================================================
// NHÓM & NHIỆM VỤ
// ============================================================
async function loadMyTeam() {
  const { teams } = await fetchMyTeams();
  if (!teams.length) {
    showAlert('Bạn chưa được phân vào nhóm nào. Nhiệm vụ sẽ xuất hiện khi Đội trưởng giao.', 'info');
    return;
  }
  myTeam = teams.find((t) => t.leader_id === myAuth.user.id) || teams[0];
}

async function loadMyTasks() {
  if (!myTeam) { myTasks = []; return; }
  try {
    const { data, error } = await supabase.rpc('get_team_board', { p_team_id: myTeam.id });
    if (error) throw error;
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    // Gắn phần công của chính mình vào từng task
    myTasks = tasks
      .map((t) => ({
        ...t,
        my_assignment: (t.assignees || []).find((a) => a.user_id === myAuth.user.id) || null,
      }))
      .filter((t) => !!t.my_assignment);
  } catch (e) {
    console.error('[loadMyTasks]', e);
    myTasks = [];
  }
}

// ============================================================
// RENDER NHIỆM VỤ ĐANG MỞ
// ============================================================
function renderMyTasks() {
  const box = document.getElementById('myTaskList');
  const btnHistory = document.getElementById('btnToggleHistory');
  if (!box) return;

  // Hiện nút lịch sử nếu có ít nhất 1 task done
  const hasDone = myTasks.some((t) => t.my_assignment?.status === 'done');
  if (btnHistory) btnHistory.style.display = hasDone ? 'inline-flex' : 'none';

  // Chỉ hiện nhiệm vụ chưa hoàn thành / chưa huỷ
  const active = myTasks.filter(
    (t) => t.my_assignment?.status !== 'done' && t.my_assignment?.status !== 'cancelled'
  );

  if (!active.length) {
    box.innerHTML = myTasks.length
      ? '<div class="rk-empty">🎉 Bạn đã hoàn thành tất cả nhiệm vụ!</div>'
      : '<div class="rk-empty">Bạn chưa được giao nhiệm vụ nào.</div>';
    return;
  }

  let html = '<div class="rk-task-list">';
  active.forEach((t) => {
    const a = t.my_assignment;
    const due = fmtDue(t.due_at);
    const isDoing = a.status === 'doing';

    html += `<div class="rk-task" style="border-left:3px solid ${isDoing ? 'var(--accent)' : 'var(--border)'}">`;

    // Tiêu đề + trạng thái
    html += '<div class="rk-task-head">' +
      `<div class="rk-task-title">${escapeHtml(t.title)}</div>` +
      `<span class="rk-badge ${escapeHtml(a.status)}">${TASK_STATUS_LABELS[a.status] || a.status}</span>` +
      '</div>';

    if (t.description) html += `<div class="rk-task-desc">${escapeHtml(t.description)}</div>`;

    // Meta
    html += '<div class="rk-task-meta">';
    if (due) html += `<span>⏳ Hạn: ${escapeHtml(due)}</span>`;
    if (a.note) html += `${due ? '<span class="rk-dot"></span>' : ''}<span>📝 ${escapeHtml(a.note)}</span>`;
    html += '</div>';

    // Nút hành động
    html += '<div class="rk-task-foot">';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">';

    // Nút chính: ✓ Hoàn thành — to, nổi bật
    html += `<button class="rk-btn rk-btn-ok" style="font-size:14px;padding:10px 18px;"
      onclick="setDone('${t.id}')">✓ Hoàn thành</button>`;

    // Nút phụ: đang thực hiện (nếu chưa)
    if (!isDoing) {
      html += `<button class="rk-btn rk-btn-sm" onclick="setStatus('${t.id}','doing')">▶ Bắt đầu</button>`;
    }

    html += '</div></div></div>';
  });

  html += '</div>';
  box.innerHTML = html;
}

// ============================================================
// CẬP NHẬT TRẠNG THÁI
// ============================================================
async function setDone(taskId) {
  await setStatus(taskId, 'done');
}

async function setStatus(taskId, status) {
  const { data, error } = await supabase.rpc('update_task_status', {
    p_task_id: taskId,
    p_status: status,
    p_note: null,
  });

  if (error || !data?.ok) {
    return showAlert(data?.message || error?.message || 'Không cập nhật được.', 'err');
  }

  showAlert(status === 'done' ? '🎉 Đã đánh dấu hoàn thành!' : '✓ Đã cập nhật tiến độ.', 'ok');
  await loadMyTasks();
  renderMyTasks();
  updateStats();
  // Nếu đang mở lịch sử thì cập nhật luôn
  if (_historyOpen) renderHistory();
}

// ============================================================
// LỊCH SỬ GIAO VIỆC & HOÀN THÀNH
// ============================================================
function toggleHistory() {
  _historyOpen = !_historyOpen;
  const section = document.getElementById('historySection');
  const btn = document.getElementById('btnToggleHistory');
  if (section) section.style.display = _historyOpen ? 'block' : 'none';
  if (btn) btn.textContent = _historyOpen ? '✕ Đóng lịch sử' : '📋 Lịch sử';
  if (_historyOpen) {
    renderHistory();
    section?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function renderHistory() {
  const box = document.getElementById('myHistoryList');
  if (!box) return;

  if (!myTasks.length) {
    box.innerHTML = '<div class="rk-empty">Chưa có nhiệm vụ nào.</div>';
    return;
  }

  // Sắp xếp: done trước, rồi mới nhất
  const sorted = [...myTasks].sort((a, b) => {
    const aDone = a.my_assignment?.status === 'done' ? 0 : 1;
    const bDone = b.my_assignment?.status === 'done' ? 0 : 1;
    if (aDone !== bDone) return aDone - bDone;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  let html = '<div class="rk-task-list">';
  sorted.forEach((t) => {
    const a = t.my_assignment;
    const due = fmtDue(t.due_at);
    const created = fmtDue(t.created_at);
    const isDone = a.status === 'done';

    html += `<div class="rk-task" style="opacity:${isDone ? '0.72' : '1'};` +
      `border-left:3px solid ${isDone ? 'var(--ok)' : 'var(--border)'}">`;

    html += '<div class="rk-task-head">' +
      `<div class="rk-task-title">${isDone ? '✅ ' : ''}${escapeHtml(t.title)}</div>` +
      `<span class="rk-badge ${escapeHtml(a.status)}">${TASK_STATUS_LABELS[a.status] || a.status}</span>` +
      '</div>';

    if (t.description) html += `<div class="rk-task-desc">${escapeHtml(t.description)}</div>`;

    html += '<div class="rk-task-meta">';
    if (created) html += `<span>📅 Được giao: ${escapeHtml(created)}</span>`;
    if (due) html += `<span class="rk-dot"></span><span>⏳ Hạn: ${escapeHtml(due)}</span>`;
    html += '</div>';

    // Nếu chưa done thì vẫn cho hoàn thành từ lịch sử
    if (!isDone) {
      html += `<div class="rk-task-foot"><button class="rk-btn rk-btn-ok rk-btn-sm"
        onclick="setDone('${t.id}')">✓ Hoàn thành</button></div>`;
    }

    html += '</div>';
  });

  html += '</div>';
  box.innerHTML = html;
}

// ============================================================
// THỐNG KÊ & TIỆN ÍCH
// ============================================================
function updateStats() {
  const counts = { todo: 0, doing: 0, done: 0 };
  myTasks.forEach((t) => {
    const s = t.my_assignment?.status;
    if (s && counts[s] !== undefined) counts[s]++;
  });
  ['todo', 'doing', 'done'].forEach((s) => {
    const el = document.getElementById('stat' + s.charAt(0).toUpperCase() + s.slice(1));
    if (el) el.textContent = counts[s];
  });
}

function fmtDue(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch (_) { return null; }
}

function showAlert(msg, type = 'info') {
  const el = document.getElementById('pageAlert');
  if (!el) return;
  el.className = 'rk-alert show rk-alert-' + type;
  el.innerText = msg;
  setTimeout(() => { el.className = 'rk-alert'; }, 5000);
}
