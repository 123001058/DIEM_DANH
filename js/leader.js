/**
 * DIEM_DANH — js/leader.js
 * Bảng điều khiển ĐỘI TRƯỞNG:
 *   - Xem lịch rảnh của các thành viên trong nhóm
 *   - Tạo nhiệm vụ và giao cho thành viên phù hợp với lịch rảnh
 *   - Theo dõi tiến độ nhiệm vụ của nhóm
 */

let currentAuth = null;
let myTeams = [];
let currentTeam = null;
let teamMembers = [];
let teamTasks = [];
let selectedMemberId = null;

// Biến tạm cho form tạo nhiệm vụ
let pendingTaskId = null; // nhiệm vụ vừa tạo, chờ gán người
let availabilityMatrix = {};

// ============================================================
// KHỞI TẠO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Chỉ Admin và Đội trưởng được vào trang này
  currentAuth = await requireRoles([ROLES.ADMIN, ROLES.LEADER], 'bảng điều khiển Đội trưởng');
  if (!currentAuth) return;

  const chip = document.getElementById('roleChip');
  if (currentAuth.isAdmin) {
    chip.textContent = 'Quản trị viên';
    chip.className = 'rk-role-chip chip-admin';
  }

  bindFormEvents();
  await loadTeams();
});

function bindFormEvents() {
  // Chọn Thứ/Buổi -> cập nhật lại danh sách ai rảnh
  const thu = document.getElementById('taskThu');
  const buoi = document.getElementById('taskBuoi');
  if (thu) thu.addEventListener('change', refreshMemberPicker);
  if (buoi) buoi.addEventListener('change', refreshMemberPicker);

  const teamSelect = document.getElementById('teamSelect');
  if (teamSelect) {
    teamSelect.addEventListener('change', (e) => {
      const t = myTeams.find((x) => x.id === e.target.value);
      if (t) switchTeam(t);
    });
  }
}

// ============================================================
// NHÓM
// ============================================================
async function loadTeams() {
  const { teams, isAdmin } = await fetchMyTeams();
  myTeams = teams;

  if (!myTeams.length) {
    document.getElementById('teamSubtitle').textContent = 'Bạn chưa được phân vào nhóm nào';
    document.getElementById('memberPicker').innerHTML =
      '<div class="rk-empty">Chưa có nhóm. Vui lòng liên hệ Quản trị viên.</div>';
    document.getElementById('availabilityBox').innerHTML =
      '<div class="rk-empty">Chưa có nhóm để xem lịch rảnh.</div>';
    showAlert('Bạn chưa được phân vào nhóm nào. Vui lòng liên hệ Quản trị viên.', 'info');
    return;
  }

  // Nếu có nhiều nhóm, cho phép chuyển nhóm
  if (myTeams.length > 1) {
    const sel = document.getElementById('teamSelect');
    sel.style.display = 'block';
    sel.innerHTML = myTeams
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
      .join('');
  }

  // Ưu tiên nhóm mình làm đội trưởng
  const led = myTeams.find((t) => t.leader_id === currentAuth.user.id);
  await switchTeam(led || myTeams[0]);
}

async function switchTeam(team) {
  currentTeam = team;
  pendingTaskId = null;
  selectedMemberId = null;

  const sel = document.getElementById('teamSelect');
  if (sel) sel.value = team.id;

  const isLeaderOfThis = team.leader_id === currentAuth.user.id || currentAuth.isAdmin;
  document.getElementById('teamSubtitle').textContent =
    `Nhóm: ${team.name} · ${isLeaderOfThis ? 'Bạn là Đội trưởng' : 'Bạn là thành viên'}`;

  await refreshAll();
}

async function refreshAll() {
  await Promise.all([loadMembers(), loadTasks()]);
  await renderAvailability();
  await renderTaskBoard();
  updateStats();
}

// ============================================================
// THÀNH VIÊN & LỊCH RẢNH
// ============================================================
async function loadMembers() {
  const box = document.getElementById('availabilityBox');
  try {
    const { data, error } = await supabase.rpc('get_team_availability', {
      p_team_id: currentTeam.id,
    });
    if (error) throw error;

    teamMembers = Array.isArray(data?.members) ? data.members : [];

    // Tính ma trận rảnh/bận cho toàn bộ thành viên
    availabilityMatrix = await buildAvailabilityMatrix(teamMembers);
  } catch (e) {
    console.error('[loadMembers]', e);
    teamMembers = [];
    if (box) box.innerHTML = '<div class="rk-empty">Không tải được danh sách thành viên.</div>';
  }
}

/** Render bảng lịch rảnh: mỗi dòng là 1 thành viên, mỗi cột là Thứ × Buổi */
async function renderAvailability() {
  const box = document.getElementById('availabilityBox');
  if (!box) return;

  if (!teamMembers.length) {
    box.innerHTML = '<div class="rk-empty">Nhóm chưa có thành viên nào.</div>';
    return;
  }

  const thuList = [2, 3, 4, 5, 6, 7, 8];
  const buoiList = [1, 2, 3];

  let html = '<div class="rk-grid-week"><table class="rk-week-table"><thead><tr>' +
    '<th class="rk-week-corner">Thành viên</th>';

  for (const th of thuList) {
    html += `<th>${THU_SHORT[th]}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const m of teamMembers) {
    html += '<tr>';
    html += `<td class="rk-week-rowhead">${escapeHtml(m.full_name)}` +
      (m.is_leader ? ' <span class="rk-badge doing" style="font-size:10px;">ĐT</span>' : '') +
      '</td>';

    for (const th of thuList) {
      html += '<td>';
      for (const bu of buoiList) {
        const key = `${m.user_id}|${th}|${bu}`;
        const info = availabilityMatrix[key] || { free: true, reason: 'Rảnh' };
        const lb = freeLabel(info.free, info.reason);
        const title = `${THU_LABELS[th]} · ${BUOI_LABELS[bu]} — ${info.reason}`;
        html += `<div class="rk-slot ${lb.cls}" title="${escapeHtml(title)}">` +
          `<span class="rk-slot-mark">${lb.mark}</span>` +
          `<span class="rk-slot-text">${lb.text}</span></div>`;
      }
      html += '</td>';
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';

  // Chú thích: mỗi ô gồm 3 buổi xếp dọc
  html += '<p class="rk-muted" style="margin-top:10px;">Mỗi ô là 3 buổi theo thứ tự: ' +
    '<b>Sáng</b> · <b>Chiều</b> · <b>Tối</b>. Di chuột vào ô để xem chi tiết.</p>';

  box.innerHTML = html;
  await refreshMemberPicker();
}

/**
 * Render danh sách thành viên để chọn người nhận việc.
 * Nếu đã chọn Thứ + Buổi, thành viên RẢNH được xếp lên đầu và gắn nhãn rõ ràng.
 */
async function refreshMemberPicker() {
  const box = document.getElementById('memberPicker');
  const hint = document.getElementById('pickHint');
  if (!box) return;

  if (!teamMembers.length) {
    box.innerHTML = '<div class="rk-empty">Nhóm chưa có thành viên nào.</div>';
    return;
  }

  const thu = document.getElementById('taskThu')?.value;
  const buoi = document.getElementById('taskBuoi')?.value;
  const hasSlot = !!(thu && buoi);

  if (hint) {
    hint.textContent = hasSlot
      ? `— ${THU_LABELS[thu]} · ${BUOI_SHORT[buoi]}`
      : '— chọn khung giờ để xem ai rảnh';
  }

  // Đánh giá rảnh/bận cho từng thành viên tại khung đã chọn
  const evaluated = [];
  for (const m of teamMembers) {
    if (hasSlot) {
      const key = `${m.user_id}|${thu}|${buoi}`;
      const info = availabilityMatrix[key] || await checkMemberFree(m.mssv, thu, buoi, m.blocks);
      evaluated.push({ ...m, ...info });
    } else {
      evaluated.push({ ...m, free: null, reason: '' });
    }
  }

  // Rảnh trước, bận sau
  evaluated.sort((a, b) => {
    if (a.free === b.free) return a.full_name.localeCompare(b.full_name, 'vi');
    if (a.free === true) return -1;
    if (b.free === true) return 1;
    return 0;
  });

  const freeCount = evaluated.filter((m) => m.free === true).length;

  let html = '';
  evaluated.forEach((m) => {
    const selected = selectedMemberId === m.user_id;
    let statusHtml = '<span class="rk-muted">Chưa chọn khung giờ</span>';
    let cls = '';

    if (hasSlot) {
      if (m.free) {
        statusHtml = '<span class="rk-badge free">✓ Rảnh</span>';
      } else {
        statusHtml = `<span class="rk-badge busy">✕ ${escapeHtml(m.reason || 'Bận')}</span>`;
        cls = ' unavailable';
      }
    }

    html += `<div class="rk-member-card${selected ? ' selected' : ''}${cls}" ` +
      `onclick="selectMember('${m.user_id}', ${m.free === false})">` +
      `<div class="rk-member-name">${escapeHtml(m.full_name)}` +
      (m.is_leader ? ' <span class="rk-badge doing" style="font-size:10px;">ĐT</span>' : '') +
      `</div>` +
      `<div class="rk-member-sub">${m.mssv ? escapeHtml(m.mssv) : escapeHtml(m.username || '')}</div>` +
      `<div style="margin-top:7px;">${statusHtml}</div></div>`;
  });

  if (hasSlot && freeCount === 0) {
    html = '<div class="rk-alert rk-alert-info show" style="grid-column:1/-1;">' +
      '⚠️ Không có thành viên nào rảnh trong khung giờ này. Bạn vẫn có thể giao, ' +
      'nhưng nên cân nhắc chọn khung giờ khác.</div>' + html;
  }

  box.innerHTML = html;
}

function selectMember(userId, unavailable) {
  if (unavailable) {
    const thu = document.getElementById('taskThu')?.value;
    const buoi = document.getElementById('taskBuoi')?.value;
    const ok = confirm(
      'Thành viên này KHÔNG rảnh tại ' +
      `${thu ? THU_LABELS[thu] : ''} ${buoi ? BUOI_SHORT[buoi] : ''}.\n\n` +
      'Bạn vẫn muốn giao nhiệm vụ này?'
    );
    if (!ok) return;
  }
  selectedMemberId = userId;
  refreshMemberPicker();
}

// ============================================================
// TẠO & GIAO NHIỆM VỤ
// ============================================================
async function createAndAssign() {
  const btn = document.getElementById('btnCreateTask');
  const title = document.getElementById('taskTitle')?.value.trim();
  const desc = document.getElementById('taskDesc')?.value.trim();
  const priority = document.getElementById('taskPriority')?.value || 'normal';
  const thu = document.getElementById('taskThu')?.value;
  const buoi = document.getElementById('taskBuoi')?.value;
  const dueRaw = document.getElementById('taskDue')?.value;

  if (!title) return showAssignAlert('Vui lòng nhập tiêu đề nhiệm vụ.', true);
  if (!currentTeam) return showAssignAlert('Chưa chọn nhóm.', true);

  if (btn) btn.disabled = true;

  try {
    // 1) Tạo nhiệm vụ
    const { data, error } = await supabase.rpc('leader_create_task', {
      p_team_id: currentTeam.id,
      p_title: title,
      p_description: desc || null,
      p_slot_thu: thu ? Number(thu) : null,
      p_slot_buoi: buoi ? Number(buoi) : null,
      p_due_at: dueRaw ? new Date(dueRaw).toISOString() : null,
      p_priority: priority,
    });

    if (error) throw error;
    if (!data?.ok) return showAssignAlert(data?.message || 'Không tạo được nhiệm vụ.', true);

    const taskId = data.task.id;
    pendingTaskId = taskId;

    // 2) Giao cho thành viên đã chọn (nếu có)
    if (selectedMemberId) {
      const thuNum = thu ? Number(thu) : null;
      const buoiNum = buoi ? Number(buoi) : null;

      // Kiểm tra lịch rảnh phía client (lịch học trong JSON)
      const member = teamMembers.find((m) => m.user_id === selectedMemberId);
      let force = false;
      if (member && thuNum && buoiNum) {
        const info = availabilityMatrix[`${member.user_id}|${thuNum}|${buoiNum}`]
          || await checkMemberFree(member.mssv, thuNum, buoiNum, member.blocks);
        if (!info.free) {
          force = confirm(
            `${member.full_name} không rảnh tại ${THU_LABELS[thuNum]} ${BUOI_SHORT[buoiNum]}` +
            ` (${info.reason}).\n\nVẫn giao nhiệm vụ?`
          );
          if (!force) {
            showAssignAlert('Đã tạo nhiệm vụ nhưng chưa giao cho ai. Hãy chọn người khác.', true);
            await loadTasks();
            return;
          }
        }
      }

      const { data: aData, error: aErr } = await supabase.rpc('leader_assign_task', {
        p_task_id: taskId,
        p_assignee_id: selectedMemberId,
        p_note: null,
        p_force: force,
      });

      if (aErr) throw aErr;
      if (!aData?.ok) {
        showAssignAlert('Đã tạo nhiệm vụ. ' + (aData?.message || 'Không giao được.'), true);
        await loadTasks();
        return;
      }

      showAssignAlert('✓ Đã tạo và giao nhiệm vụ thành công.', false);
    } else {
      showAssignAlert('✓ Đã tạo nhiệm vụ (chưa giao cho ai). Chọn người ở danh sách nhiệm vụ.', false);
    }

    resetTaskForm();
    await loadTasks();
    renderTaskBoard();
    updateStats();
  } catch (e) {
    console.error('[createAndAssign]', e);
    showAssignAlert('Lỗi: ' + (e.message || 'không xác định'), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function resetTaskForm() {
  ['taskTitle', 'taskDesc', 'taskDue'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['taskThu', 'taskBuoi'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const p = document.getElementById('taskPriority');
  if (p) p.value = 'normal';

  selectedMemberId = null;
  pendingTaskId = null;
  refreshMemberPicker();
}

function showAssignAlert(msg, isError) {
  const el = document.getElementById('assignAlert');
  if (!el) return alert(msg);
  el.className = 'rk-alert show ' + (isError ? 'rk-alert-err' : 'rk-alert-ok');
  el.innerText = msg;
}

function showAlert(msg, type = 'info') {
  const el = document.getElementById('pageAlert');
  if (!el) return;
  el.className = 'rk-alert show rk-alert-' + type;
  el.innerText = msg;
}

// ============================================================
// BẢNG NHIỆM VỤ
// ============================================================
async function loadTasks() {
  try {
    const { data, error } = await supabase.rpc('get_team_board', {
      p_team_id: currentTeam.id,
    });
    if (error) throw error;
    teamTasks = Array.isArray(data?.tasks) ? data.tasks : [];
  } catch (e) {
    console.error('[loadTasks]', e);
    teamTasks = [];
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

function taskSlotLabel(t) {
  if (!t.slot_thu || !t.slot_buoi) return null;
  return `${THU_SHORT[t.slot_thu]} · ${BUOI_SHORT[t.slot_buoi]}`;
}

function renderTaskBoard() {
  const box = document.getElementById('taskBoard');
  if (!box) return;

  if (!teamTasks.length) {
    box.innerHTML = '<div class="rk-empty">Chưa có nhiệm vụ nào trong nhóm.</div>';
    return;
  }

  let html = '<div class="rk-task-list">';

  teamTasks.forEach((t) => {
    const slot = taskSlotLabel(t);
    const due = fmtDue(t.due_at);
    const assignees = Array.isArray(t.assignees) ? t.assignees : [];

    html += '<div class="rk-task">';
    html += '<div class="rk-task-head"><div class="rk-task-title">' +
      escapeHtml(t.title) + '</div>' +
      `<span class="rk-badge ${escapeHtml(t.priority)}">${PRIORITY_LABELS[t.priority] || ''}</span></div>`;

    if (t.description) {
      html += `<div class="rk-task-desc">${escapeHtml(t.description)}</div>`;
    }

    // Meta: khung giờ, hạn, số người nhận
    html += '<div class="rk-task-meta">';
    if (slot) html += `<span>🕐 ${escapeHtml(slot)}</span><span class="rk-dot"></span>`;
    if (due) html += `<span>⏳ Hạn: ${escapeHtml(due)}</span><span class="rk-dot"></span>`;
    html += `<span>👥 ${assignees.length} người nhận</span>`;
    html += '</div>';

    // Danh sách người nhận + trạng thái
    html += '<div class="rk-task-foot"><div class="rk-assignee-list">';
    if (!assignees.length) {
      html += '<span class="rk-muted">Chưa giao cho ai</span>';
    } else {
      assignees.forEach((a) => {
        html += `<span class="rk-assignee">${escapeHtml(a.full_name)}` +
          `<span class="rk-badge ${escapeHtml(a.status)}" style="font-size:10px;padding:2px 7px;">` +
          `${TASK_STATUS_LABELS[a.status] || a.status}</span>` +
          `<button title="Gỡ phân công" onclick="unassignTask('${t.id}','${a.user_id}')">✕</button>` +
          '</span>';
      });
    }
    html += '</div>';

    // Nút thao tác
    html += '<div class="rk-assignee-list">';
    html += `<button class="rk-btn rk-btn-sm" onclick="openAssignDialog('${t.id}')">＋ Giao thêm</button>`;
    html += `<button class="rk-btn rk-btn-sm rk-btn-err" onclick="deleteTask('${t.id}')">Xoá</button>`;
    html += '</div></div>';

    html += '</div>';
  });

  html += '</div>';
  box.innerHTML = html;
}

// Gỡ phân công
async function unassignTask(taskId, userId) {
  if (!confirm('Gỡ nhiệm vụ khỏi thành viên này?')) return;
  const { data, error } = await supabase.rpc('leader_unassign_task', {
    p_task_id: taskId,
    p_assignee_id: userId,
  });
  if (error || !data?.ok) {
    return showAlert(data?.message || error?.message || 'Không gỡ được.', 'err');
  }
  await loadTasks();
  renderTaskBoard();
  updateStats();
}

// Xoá nhiệm vụ
async function deleteTask(taskId) {
  if (!confirm('Xoá nhiệm vụ này? Toàn bộ phân công sẽ bị gỡ.')) return;
  const { data, error } = await supabase.rpc('leader_delete_task', { p_task_id: taskId });
  if (error || !data?.ok) {
    return showAlert(data?.message || error?.message || 'Không xoá được.', 'err');
  }
  await loadTasks();
  renderTaskBoard();
  updateStats();
}

/** Mở hộp thoại giao thêm người cho một nhiệm vụ đã có */
async function openAssignDialog(taskId) {
  const task = teamTasks.find((t) => t.id === taskId);
  if (!task) return;

  const assigned = new Set((task.assignees || []).map((a) => a.user_id));
  const candidates = teamMembers.filter((m) => !assigned.has(m.user_id));

  if (!candidates.length) {
    return showAlert('Tất cả thành viên trong nhóm đều đã nhận nhiệm vụ này.', 'info');
  }

  const lines = candidates.map((m, i) => {
    const slot = taskSlotLabel(task);
    return `${i + 1}. ${m.full_name}${m.mssv ? ' (' + m.mssv + ')' : ''}` +
      (slot ? ` — khung ${slot}` : '');
  });

  const choice = prompt(
    'Giao nhiệm vụ "' + task.title + '" cho thành viên nào?\n\n' +
    lines.join('\n') + '\n\nNhập số thứ tự:'
  );

  if (choice === null) return;
  const idx = Number(choice.trim()) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
    return showAlert('Lựa chọn không hợp lệ.', 'err');
  }

  const member = candidates[idx];

  // Cảnh báo nếu người được chọn không rảnh trong khung giờ của nhiệm vụ
  let force = false;
  if (task.slot_thu && task.slot_buoi) {
    const info = availabilityMatrix[`${member.user_id}|${task.slot_thu}|${task.slot_buoi}`]
      || await checkMemberFree(member.mssv, task.slot_thu, task.slot_buoi, member.blocks);
    if (!info.free) {
      force = confirm(
        `${member.full_name} không rảnh (${info.reason}).\nVẫn giao nhiệm vụ này?`
      );
      if (!force) return;
    }
  }

  const { data, error } = await supabase.rpc('leader_assign_task', {
    p_task_id: taskId,
    p_assignee_id: member.user_id,
    p_note: null,
    p_force: force,
  });

  if (error || !data?.ok) {
    return showAlert(data?.message || error?.message || 'Không giao được.', 'err');
  }

  showAlert('✓ Đã giao nhiệm vụ cho ' + member.full_name, 'ok');
  await loadTasks();
  renderTaskBoard();
  updateStats();
}

// ============================================================
// THỐNG KÊ
// ============================================================
function updateStats() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('statMembers', teamMembers.length);

  // Đếm nhiệm vụ: đang mở = chưa done/cancelled; hoàn thành = done
  let open = 0, done = 0;
  teamTasks.forEach((t) => {
    if (t.status === 'done') done++;
    else if (t.status !== 'cancelled') open++;
  });
  set('statOpenTasks', open);
  set('statDoneTasks', done);

  // Số người rảnh "hôm nay" (theo thứ hiện tại + buổi đang diễn ra)
  const now = new Date();
  const jsDay = now.getDay();            // 0=CN ... 6=T7
  const thuToday = jsDay === 0 ? 8 : jsDay + 1;
  const hour = now.getHours();
  const buoiNow = hour < 11 ? 1 : (hour < 16 ? 2 : 3);

  let freeCount = 0;
  for (const m of teamMembers) {
    const info = availabilityMatrix[`${m.user_id}|${thuToday}|${buoiNow}`];
    if (info && info.free) freeCount++;
  }
  set('statFreeNow', freeCount);
}
