/**
 * DIEM_DANH — js/tasks.js
 * Trang nhiệm vụ cho THÀNH VIÊN (và Đội trưởng xem tiến độ của mình).
 * Thành viên CHỈ thấy & cập nhật được những nhiệm vụ được giao cho mình
 * (được bảo đảm bởi RLS + RPC update_task_status).
 */

let myAuth = null;
let myTeam = null;
let myTasks = [];
let myBlocks = [];       // các khoảng bận đã khai báo
let myMatrix = {};       // lịch rảnh của chính mình

// ============================================================
// KHỞI TẠO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  myAuth = await requireRoles([], 'trang nhiệm vụ');
  if (!myAuth) return;

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

  const filter = document.getElementById('filterStatus');
  if (filter) filter.addEventListener('change', renderMyTasks);

  await loadMyTeam();
  await loadMyTasks();
  await loadMyAvailability();

  renderMyTasks();
  renderMyAvailability();
  updateStats();
});

async function loadMyTeam() {
  const { teams } = await fetchMyTeams();
  if (!teams.length) {
    showAlert('Bạn chưa được phân vào nhóm nào. Nhiệm vụ sẽ xuất hiện khi Đội trưởng giao.', 'info');
    return;
  }
  // Ưu tiên nhóm mình làm đội trưởng (nếu có)
  myTeam = teams.find((t) => t.leader_id === myAuth.user.id) || teams[0];
}

// ============================================================
// NHIỆM VỤ
// ============================================================
async function loadMyTasks() {
  if (!myTeam) {
    myTasks = [];
    return;
  }
  try {
    const { data, error } = await supabase.rpc('get_team_board', { p_team_id: myTeam.id });
    if (error) throw error;

    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    // Thành viên chỉ thấy phần công của mình
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

function fmtDue(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch (e) {
    return null;
  }
}

function renderMyTasks() {
  const box = document.getElementById('myTaskList');
  if (!box) return;

  const filterVal = document.getElementById('filterStatus')?.value || 'all';
  const list = myTasks.filter((t) => filterVal === 'all' || t.my_assignment.status === filterVal);

  if (!list.length) {
    box.innerHTML = myTasks.length
      ? '<div class="rk-empty">Không có nhiệm vụ nào ở trạng thái này.</div>'
      : '<div class="rk-empty">Bạn chưa được giao nhiệm vụ nào. Hãy kiểm tra lại sau.</div>';
    return;
  }

  let html = '<div class="rk-task-list">';

  list.forEach((t) => {
    const a = t.my_assignment;
    const slot = (t.slot_thu && t.slot_buoi)
      ? `${THU_SHORT[t.slot_thu]} · ${BUOI_SHORT[t.slot_buoi]}` : null;
    const due = fmtDue(t.due_at);

    html += '<div class="rk-task">';
    html += '<div class="rk-task-head"><div class="rk-task-title">' + escapeHtml(t.title) + '</div>' +
      `<span class="rk-badge ${escapeHtml(a.status)}">${TASK_STATUS_LABELS[a.status] || a.status}</span></div>`;

    if (t.description) {
      html += `<div class="rk-task-desc">${escapeHtml(t.description)}</div>`;
    }

    if (t.priority === 'high') {
      html += '<div class="rk-task-meta"><span class="rk-badge high">Ưu tiên cao</span></div>';
    }

    html += '<div class="rk-task-meta" style="margin-top:8px;">';
    if (slot) html += `<span>🕐 Khung dự kiến: ${escapeHtml(slot)}</span><span class="rk-dot"></span>`;
    if (due) html += `<span>⏳ Hạn: ${escapeHtml(due)}</span>`;
    html += '</div>';

    // Nút cập nhật tiến độ
    html += '<div class="rk-task-foot"><div class="rk-assignee-list">' +
      '<span class="rk-muted">Cập nhật tiến độ:</span>';
    ['todo', 'doing', 'done'].forEach((s) => {
      const active = a.status === s;
      html += `<button class="rk-btn rk-btn-sm${active ? ' rk-btn-primary' : ''}" ` +
        `onclick="setStatus('${t.id}','${s}')">${TASK_STATUS_LABELS[s]}</button>`;
    });
    html += '</div>';

    if (a.note) {
      html += `<div class="rk-muted" style="margin-top:10px;">📝 Ghi chú Đội trưởng: ${escapeHtml(a.note)}</div>`;
    }
    html += '</div></div>';
  });

  html += '</div>';
  box.innerHTML = html;
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

  showAlert('✓ ' + (data.message || 'Đã cập nhật tiến độ.'), 'ok');
  await loadMyTasks();
  renderMyTasks();
  updateStats();
}

// ============================================================
// KHAI BÁO LỊCH RẢNH
// ============================================================
async function loadMyAvailability() {
  try {
    // Khoảng bận đã khai báo (chỉ đọc được chính mình qua RLS)
    const { data: blocks, error: bErr } = await supabase
      .from('availability_blocks')
      .select('slot_thu, slot_buoi, reason')
      .eq('user_id', myAuth.user.id);

    if (bErr) throw bErr;
    myBlocks = Array.isArray(blocks) ? blocks : [];

    // Tính lịch rảnh (kết hợp lịch học + khoảng bận)
    myMatrix = await buildAvailabilityMatrix([{
      user_id: myAuth.user.id,
      mssv: myAuth.profile?.mssv,
      blocks: myBlocks,
    }]);
  } catch (e) {
    console.error('[loadMyAvailability]', e);
    myBlocks = [];
  }
}

function renderMyAvailability() {
  const box = document.getElementById('myAvailabilityBox');
  if (!box) return;

  const thuList = [2, 3, 4, 5, 6, 7, 8];
  const buoiList = [1, 2, 3];
  const uid = myAuth.user.id;

  let html = '<div class="rk-grid-week"><table class="rk-week-table"><thead><tr>' +
    '<th class="rk-week-corner">Khung giờ</th>';
  for (const th of thuList) html += `<th>${THU_SHORT[th]}</th>`;
  html += '</tr></thead><tbody>';

  for (const bu of buoiList) {
    html += `<tr><td class="rk-week-rowhead">${BUOI_SHORT[bu]}</td>`;
    for (const th of thuList) {
      const info = myMatrix[`${uid}|${th}|${bu}`] || { free: true, reason: 'Rảnh' };
      // Ô có lớp thì không cho đánh dấu (đã biết là bận)
      const isClass = info.reason && info.reason.startsWith('Có lớp');
      const lb = freeLabel(info.free, info.reason);
      const cls = isClass ? 'is-busy-class' : lb.cls;
      const cursor = isClass ? '' : ' is-clickable';
      const title = isClass
        ? `${THU_LABELS[th]} · ${BUOI_SHORT[bu]} — ${info.reason} (không thể thay đổi)`
        : `${THU_LABELS[th]} · ${BUOI_SHORT[bu]} — bấm để đánh dấu ${info.free ? 'BẬN' : 'RẢNH'}`;

      html += `<td><div class="rk-slot ${cls}${cursor}" title="${escapeHtml(title)}" ` +
        `onclick="${isClass ? '' : `toggleBlock(${th},${bu},${info.free ? 'true' : 'false'})`}">` +
        `<span class="rk-slot-mark">${isClass ? '📚' : (info.free ? '✓' : '✕')}</span>` +
        `<span class="rk-slot-text">${isClass ? 'Có lớp' : (info.free ? 'Rảnh' : 'Bận')}</span></div></td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  html += '<p class="rk-muted" style="margin-top:10px;">🟨 Ô có lớp không thể thay đổi. ' +
    'Bấm vào ô xanh (Rảnh) để đánh dấu là Bận, bấm ô đỏ để gỡ.</p>';

  box.innerHTML = html;
}

/** Bật/tắt khoảng bận cho chính mình */
async function toggleBlock(thu, buoi, currentlyFree) {
  const willBeBusy = currentlyFree === true;
  const reasonBox = document.getElementById('blockReasonBox');
  const reasonInput = document.getElementById('blockReason');

  let reason = null;
  if (willBeBusy) {
    // Hỏi lý do (không bắt buộc)
    reason = prompt(
      `Khai báo BẬN vào ${THU_LABELS[thu]} · ${BUOI_SHORT[buoi]}.\n\n` +
      'Lý do (không bắt buộc):',
      ''
    );
    if (reason === null) return; // huỷ
  } else {
    if (!confirm(`Gỡ đánh dấu bận ${THU_LABELS[thu]} · ${BUOI_SHORT[buoi]}?`)) return;
  }

  const { data, error } = await supabase.rpc('set_availability_block', {
    p_slot_thu: thu,
    p_slot_buoi: buoi,
    p_busy: willBeBusy,
    p_reason: reason || null,
  });

  if (error || !data?.ok) {
    return showAlert(data?.message || error?.message || 'Không cập nhật được.', 'err');
  }

  if (reasonInput) reasonInput.value = '';
  if (reasonBox) reasonBox.style.display = 'none';

  showAlert('✓ ' + (data.message || 'Đã cập nhật lịch rảnh.'), 'ok');
  await loadMyAvailability();
  renderMyAvailability();
  updateStats();
}

// ============================================================
// THỐNG KÊ & TIỆN ÍCH
// ============================================================
function updateStats() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  const counts = { todo: 0, doing: 0, done: 0 };
  myTasks.forEach((t) => {
    const s = t.my_assignment?.status;
    if (counts[s] !== undefined) counts[s]++;
  });

  set('statTodo', counts.todo);
  set('statDoing', counts.doing);
  set('statDone', counts.done);
}

function showAlert(msg, type = 'info') {
  const el = document.getElementById('pageAlert');
  if (!el) return alert(msg);
  el.className = 'rk-alert show rk-alert-' + type;
  el.innerText = msg;
}
