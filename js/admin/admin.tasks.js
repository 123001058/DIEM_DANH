/* =====================================================================
   LH-NaviX Admin — admin.tasks.js
   Workspace công việc & nhật ký hoạt động
   (Tách từ admin.html; các file nạp theo thứ tự, không đổi thứ tự.)
   ===================================================================== */
/* ==========================================================
   TASK WORKSPACE CONTROLLERS & ACTIVITY DRAWER
   ========================================================== */
window.currentTaskScopeFilter = 'all'; // 'all' | 'group' | 'personal'
window.isTaskDrawerOpen = false;
window.taskActivityLogsCache = [];
window.currentDrawerFilterAction = 'all';
window.taskToDeleteId = null;

function setTaskScopeFilter(scope) {
  window.currentTaskScopeFilter = scope;
  document.getElementById('pillScopeAll')?.classList.toggle('active', scope === 'all');
  document.getElementById('pillScopeGroup')?.classList.toggle('active', scope === 'group');
  document.getElementById('pillScopePersonal')?.classList.toggle('active', scope === 'personal');
  applyTaskFilters();
}

// Giữ lại tương thích ngược nếu có hàm gọi switchTaskTab
function switchTaskTab(tabType) {
  setTaskScopeFilter(tabType);
}

function applyTaskFilters() {
  const grp = document.getElementById('taskFilterGroup')?.value || 'all';
  const st = document.getElementById('taskFilterStatus')?.value || 'all';
  const pri = document.getElementById('taskFilterPriority')?.value || 'all';
  const search = (document.getElementById('taskSearchInput')?.value || '').toLowerCase().trim();
  const scope = window.currentTaskScopeFilter || 'all';

  const cards = document.querySelectorAll('#tasksListGrid .task-card');
  let visibleCount = 0;
  cards.forEach(c => {
    const type = c.dataset.type; // 'group', 'personal', 'global'
    const matchScope = (scope === 'all')
      ? true
      : (scope === 'personal')
        ? (type === 'personal')
        : (type === 'group' || type === 'global');

    const matchGrp = (grp === 'all' || c.dataset.group === grp);
    const matchSt = (st === 'all' || c.dataset.status === st);
    const matchPri = (pri === 'all' || c.dataset.priority === pri);
    const matchSearch = (!search || c.innerText.toLowerCase().includes(search));

    const show = matchScope && matchGrp && matchSt && matchPri && matchSearch;
    c.style.display = show ? 'flex' : 'none';
    if (show) visibleCount++;
  });

  const emptyGuide = document.getElementById('tasksEmptyGuide');
  if (cards.length > 0) {
    if (visibleCount === 0) {
      if (!emptyGuide) {
        const emptyDiv = document.createElement('div');
        emptyDiv.id = 'tasksEmptyGuide';
        emptyDiv.className = 'empty-state';
        emptyDiv.style.gridColumn = '1 / -1';
        emptyDiv.textContent = 'Không có nhiệm vụ nào phù hợp với bộ lọc hiện tại.';
        document.getElementById('tasksListGrid')?.appendChild(emptyDiv);
      }
    } else if (emptyGuide) {
      emptyGuide.remove();
    }
  }
}

async function openCreateTaskModal() {
  const currentScope = window.currentTaskScopeFilter || 'all';
  const typeSelect = document.getElementById('taskNewType');
  if (typeSelect) {
    if (currentScope === 'personal') {
      typeSelect.value = 'personal';
    } else {
      typeSelect.value = 'group'; // 'all' hoặc 'group' đều mặc định giao cho cả nhóm
    }
    toggleTaskAssigneeSelect(typeSelect.value);
  }
  const groupSel = document.getElementById('taskNewGroup');
  if (groupSel && groupSel.value) {
    await loadTaskAssignees();
  }
  document.getElementById('taskCreateModal')?.classList.add('show');
}

function closeTaskCreateModal() {
  document.getElementById('taskCreateModal')?.classList.remove('show');
}

function toggleTaskAssigneeSelect(val) {
  const field = document.getElementById('taskAssigneeField');
  const groupField = document.getElementById('taskGroupField');
  const scopeGrid = document.getElementById('taskScopeGroupGrid');
  if (field) field.style.display = (val === 'personal') ? 'flex' : 'none';
  if (groupField) groupField.style.display = (val === 'global') ? 'none' : 'flex';
  if (scopeGrid) scopeGrid.style.gridTemplateColumns = val === 'global' ? '1fr' : '1fr 1fr';
}

async function loadAdminTasks() {
  const box = document.getElementById('tasksListGrid');
  if (!box) return;
  box.innerHTML = '<div class="empty-state">Đang tải nhiệm vụ...</div>';

  const [{ data, error }, { data: groups }] = await Promise.all([
    supabase.rpc('admin_get_team_tasks'),
    supabase.from('team_groups').select('id,name,field').order('name')
  ]);

  if (error || !data?.ok) {
    box.innerHTML = '<div class="empty-state">' + escapeHtml(error?.message || data?.message || 'Không tải được nhiệm vụ.') + '</div>';
    return;
  }

  const all = data.tasks || [];
  window.adminTaskRows = all;
  window.adminTaskGroups = groups || [];

  const groupCount = all.filter(t => t.scope === 'group' || t.scope === 'global').length;
  const personalCount = all.filter(t => t.scope === 'personal').length;

  const badgeNav = document.getElementById('navTasksBadge');
  if (badgeNav) badgeNav.textContent = all.length;
  const badgeAll = document.getElementById('countAllTasks');
  if (badgeAll) badgeAll.textContent = all.length;
  const badgeGroup = document.getElementById('countGroupTasks');
  if (badgeGroup) badgeGroup.textContent = groupCount;
  const badgePersonal = document.getElementById('countPersonalTasks');
  if (badgePersonal) badgePersonal.textContent = personalCount;

  const groupSel = document.getElementById('taskNewGroup');
  if (groupSel) groupSel.innerHTML = (groups || []).map(g => `<option value="${g.id}">${escapeHtml(g.name)} · ${escapeHtml(g.field)}</option>`).join('');

  const filters = document.getElementById('taskFilterGroup');
  if (filters) filters.innerHTML = '<option value="all">Tất cả nhóm</option>' + (groups || []).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');

  const memberSelect = document.getElementById('taskNewAssignee');
  if (memberSelect && groups?.length) await loadTaskAssignees();

  if (!all.length) {
    box.innerHTML = '<div class="empty-state">Chưa có nhiệm vụ nào. Nhấn <b>＋ Giao nhiệm vụ</b> để tạo mới.</div>';
    return;
  }

  box.innerHTML = all.map(t => {
    const done = (t.assignees || []).filter(a => a.status === 'done').length;
    const n = (t.assignees || []).length;
    const type = t.scope;
    const shared = type === 'group' || type === 'global';
    const status = shared
      ? (t.completed_at ? 'done' : (type === 'global' && t.claimed_by_mssv) || (t.assignees || []).some(a => a.status === 'doing') ? 'doing' : 'todo')
      : (done === n && n ? 'done' : (t.assignees || []).some(a => a.status === 'doing') ? 'doing' : 'todo');

    const taskProgress = shared
      ? (t.completed_at ? (t.completed_by_name ? `Hoàn thành bởi ${t.completed_by_name}` : 'Đã hoàn thành') : type === 'global' && t.claimed_by_mssv ? `Đang nhận làm: ${t.claimed_by_name || t.claimed_by_mssv}` : 'Chưa ai nhận làm')
      : `${done}/${n} hoàn thành · ${n} người`;

    const statusLabel = { todo: '⚪ Chưa bắt đầu', doing: '⏳ Đang làm', done: '✓ Hoàn thành' }[status];
    const people = (t.assignees || []).map(a => `${escapeHtml(a.name || a.mssv)} (${escapeHtml(a.status)})`).join(', ') || 'Không có thành viên';

    return `
      <article class="task-card" data-id="${t.id}" data-type="${type}" data-group="${t.team_id || ''}" data-status="${status}" data-priority="${t.priority}">
        <div class="task-card-top">
          <span class="task-title">${escapeHtml(t.title)}</span>
          <span class="task-badge-priority priority-${t.priority}">${{ high: 'Cao 🔥', med: 'Trung bình', low: 'Thấp' }[t.priority]}</span>
        </div>
        <p class="task-desc">${escapeHtml(t.description || 'Không có mô tả chi tiết.')}</p>
        <div class="task-meta-grid">
          <div class="task-meta-row">
            <span class="task-meta-lbl">Phạm vi</span>
            <span class="task-meta-val">${type === 'global' ? '🌐 Toàn xưởng' : type === 'group' ? '👥 Cả nhóm' : '👤 Cá nhân'}</span>
          </div>
          <div class="task-meta-row">
            <span class="task-meta-lbl">Người nhận</span>
            <span class="task-meta-val" title="${type === 'global' ? 'Tất cả sinh viên' : type === 'group' ? escapeHtml(t.team_name || 'Cả nhóm') : people}">${type === 'global' ? 'Tất cả sinh viên' : type === 'group' ? escapeHtml(t.team_name || 'Cả nhóm') : people}</span>
          </div>
          <div class="task-meta-row">
            <span class="task-meta-lbl">Tiến độ</span>
            <span class="task-meta-val">${escapeHtml(taskProgress)}</span>
          </div>
          <div class="task-meta-row">
            <span class="task-meta-lbl">Hạn chót</span>
            <span class="task-meta-val">${t.due_date || '—'}</span>
          </div>
        </div>
        <div class="task-card-footer">
          <span class="task-status-chip status-${status}">${statusLabel}</span>
          <span style="display:flex;gap:6px">
            <button class="btn btn-sm" onclick="showTaskDetailById('${t.id}')">Chi tiết</button>
            <button class="btn btn-sm btn-danger" title="Xóa nhiệm vụ" aria-label="Xóa nhiệm vụ" onclick="deleteAdminTask('${t.id}')">🗑️ Xóa</button>
          </span>
        </div>
      </article>
    `;
  }).join('');

  applyTaskFilters();
}

async function loadOverviewGroupTasks() {
  const summary = document.getElementById('overviewGroupTasksSummary'), list = document.getElementById('overviewGroupTasksList');
  if (!summary || !list) return;
  summary.textContent = 'Đang tải nhiệm vụ chung...'; list.innerHTML = '';
  const { data, error } = await supabase.rpc('admin_get_team_tasks');
  if (error || !data?.ok) {
    summary.textContent = 'Không tải được nhiệm vụ chung.';
    list.innerHTML = `<div style="font-size:12px;color:var(--err)">${escapeHtml(error?.message || data?.message || 'Lỗi không xác định.')}</div>`;
    return;
  }
  const tasks = (data.tasks || []).filter(t => (t.scope === 'group' || t.scope === 'global') && !t.completed_at);
  summary.textContent = tasks.length ? `${tasks.length} nhiệm vụ chung đang chờ hoàn thành` : 'Hiện không có nhiệm vụ chung nào đang chờ hoàn thành.';
  list.innerHTML = tasks.slice(0, 4).map(t => `<div style="display:flex;justify-content:space-between;gap:10px;padding:9px 11px;border-radius:8px;background:var(--surface-2)"><span style="font-size:12px;font-weight:700">${escapeHtml(t.title)}</span><span style="font-size:11px;color:var(--muted);white-space:nowrap">${t.scope === 'global' ? 'Toàn xưởng' : escapeHtml(t.team_name || 'Nhóm')}${t.scope === 'global' && t.claimed_by_mssv ? ` · Đang nhận: ${escapeHtml(t.claimed_by_name || t.claimed_by_mssv)}` : ''}${t.due_date ? ` · Hạn ${escapeHtml(t.due_date)}`:''}</span></div>`).join('');
  if (tasks.length > 4) list.insertAdjacentHTML('beforeend', `<div style="font-size:11px;color:var(--muted)">Và ${tasks.length - 4} nhiệm vụ khác.</div>`);
}

async function loadTaskAssignees() {
  const group = document.getElementById('taskNewGroup')?.value, select = document.getElementById('taskNewAssignee');
  if (!group || !select) return;
  const { data, error } = await supabase.from('team_group_members').select('mssv,students(name)').eq('team_id', group).order('added_at');
  if (error) {
    select.innerHTML = '';
    toast('error', 'Không tải được thành viên', error.message);
    return;
  }
  select.innerHTML = (data || []).map(m => `<option value="${m.mssv}">${escapeHtml(m.students?.name || m.mssv)} · ${escapeHtml(m.mssv)}</option>`).join('');
}

async function submitCreateTask() {
  const title = document.getElementById('taskNewTitle')?.value.trim();
  const scope = document.getElementById('taskNewType')?.value || 'group';
  const team = document.getElementById('taskNewGroup')?.value;

  if (!title || (scope !== 'global' && !team)) {
    toast('warn', 'Thiếu thông tin', scope === 'global' ? 'Nhập tiêu đề nhiệm vụ.' : 'Nhập tiêu đề và chọn nhóm.');
    return;
  }

  const { data, error } = await supabase.rpc('create_team_task', {
    p_title: title,
    p_description: document.getElementById('taskNewDesc')?.value || '',
    p_scope: scope,
    p_team_id: scope === 'global' ? null : team,
    p_assignee_mssv: scope === 'personal' ? (document.getElementById('taskNewAssignee')?.value || null) : null,
    p_priority: document.getElementById('taskNewPriority')?.value || 'med',
    p_due_date: document.getElementById('taskNewDueDate')?.value || null
  });

  if (error || !data?.ok) {
    toast('error', 'Chưa giao được', error?.message || data?.message || 'Lỗi không xác định');
    return;
  }

  closeTaskCreateModal();
  document.getElementById('taskNewTitle').value = '';
  document.getElementById('taskNewDesc').value = '';
  document.getElementById('taskNewType').value = 'group';
  toggleTaskAssigneeSelect('group');

  await loadAdminTasks();
  if (window.isTaskDrawerOpen) await loadTaskActivityLogs(true);
  if (currentView === 'overview') await loadOverviewGroupTasks();

  toast('ok', 'Đã giao nhiệm vụ', 'Nhiệm vụ đã được lưu và gửi tới người nhận.');
}

/* XÓA NHIỆM VỤ AN TOÀN VỚI MODAL XÁC NHẬN */
function deleteAdminTask(id) {
  const task = (window.adminTaskRows || []).find(t => t.id === id);
  if (!task) return;
  window.taskToDeleteId = id;
  const titleEl = document.getElementById('taskDeleteConfirmTitle');
  if (titleEl) titleEl.textContent = `“${task.title}”`;
  document.getElementById('taskDeleteConfirmModal')?.classList.add('show');
}

function closeTaskDeleteModal() {
  window.taskToDeleteId = null;
  document.getElementById('taskDeleteConfirmModal')?.classList.remove('show');
}

async function confirmExecuteDeleteTask() {
  const id = window.taskToDeleteId;
  if (!id) return;
  const btn = document.getElementById('btnConfirmDeleteTask');
  if (btn) { btn.disabled = true; btn.textContent = 'Đang xóa...'; }
  try {
    const { data, error } = await supabase.rpc('admin_delete_team_task', { p_task_id: id });
    if (error || !data?.ok) {
      toast('error', 'Chưa xóa được nhiệm vụ', error?.message || data?.message || 'Lỗi không xác định.');
      return;
    }
    closeTaskDeleteModal();
    toast('ok', 'Đã xóa nhiệm vụ', `Nhiệm vụ “${data?.deleted_title || ''}” đã được xóa khỏi danh sách.`);
    await loadAdminTasks();
    if (window.isTaskDrawerOpen) await loadTaskActivityLogs(true);
    if (currentView === 'overview') await loadOverviewGroupTasks();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✕ Xác nhận xóa'; }
  }
}

/* SLIDE-OUT DRAWER LỊCH SỬ HOẠT ĐỘNG */
function openTaskActivityDrawer() {
  window.isTaskDrawerOpen = true;
  document.getElementById('taskActivityDrawer')?.classList.add('show');
  document.getElementById('taskDrawerBackdrop')?.classList.add('show');
  loadTaskActivityLogs();
}

function closeTaskActivityDrawer() {
  window.isTaskDrawerOpen = false;
  document.getElementById('taskActivityDrawer')?.classList.remove('show');
  document.getElementById('taskDrawerBackdrop')?.classList.remove('show');
}

// Lắng nghe phím ESC đóng Drawer và Delete Modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (window.isTaskDrawerOpen) closeTaskActivityDrawer();
    if (window.taskToDeleteId) closeTaskDeleteModal();
  }
});

async function loadTaskActivityLogs(forceRefresh = false) {
  const box = document.getElementById('taskActivityDrawerList');
  if (!box) return;
  if (!forceRefresh && window.taskActivityLogsCache?.length) {
    renderDrawerLogs();
  } else {
    box.innerHTML = '<div class="schedule-loading">Đang tải lịch sử hoạt động...</div>';
  }

  const { data, error } = await supabase.rpc('admin_get_task_activity_logs', { p_limit: 100 });
  if (error || !data?.ok) {
    box.innerHTML = '<div class="empty-state" style="color:var(--err)">' + escapeHtml(error?.message || data?.message || 'Không tải được lịch sử.') + '</div>';
    return;
  }

  window.taskActivityLogsCache = data.logs || [];
  const badgeTotal = document.getElementById('taskActivityTotalBadge');
  if (badgeTotal) badgeTotal.textContent = window.taskActivityLogsCache.length;
  renderDrawerLogs();
}

function filterDrawerLogs(actionType) {
  window.currentDrawerFilterAction = actionType;
  document.querySelectorAll('.drawer-filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.action === actionType);
  });
  renderDrawerLogs();
}

function renderDrawerLogs() {
  const box = document.getElementById('taskActivityDrawerList');
  if (!box) return;
  const all = window.taskActivityLogsCache || [];
  const filter = window.currentDrawerFilterAction || 'all';
  const filtered = filter === 'all' ? all : all.filter(l => l.action_type === filter);

  if (!filtered.length) {
    box.innerHTML = '<div class="empty-state" style="padding:40px 10px;text-align:center">Chưa có hoạt động nào được ghi nhận.</div>';
    return;
  }

  const actionMeta = {
    created: { label: 'Đã tạo nhiệm vụ', icon: '➕', css: 'activity-icon-created' },
    status_changed: { label: 'Cập nhật trạng thái', icon: '🔄', css: 'activity-icon-status_changed' },
    completed: { label: 'Đã hoàn thành', icon: '✓', css: 'activity-icon-completed' },
    deleted: { label: 'Đã xóa nhiệm vụ', icon: '🗑️', css: 'activity-icon-deleted' },
    updated: { label: 'Đã cập nhật nhiệm vụ', icon: '✏️', css: 'activity-icon-updated' },
    reassigned: { label: 'Đã giao lại nhiệm vụ', icon: '👤', css: 'activity-icon-reassigned' },
    claimed: { label: 'Đã nhận nhiệm vụ', icon: '✋', css: 'activity-icon-claimed' },
    released: { label: 'Đã hủy nhận nhiệm vụ', icon: '↩️', css: 'activity-icon-released' }
  };

  const statusNameMap = {
    todo: 'Chưa bắt đầu',
    doing: 'Đang làm',
    done: 'Hoàn thành'
  };

  box.innerHTML = filtered.map(log => {
    const meta = actionMeta[log.action_type] || { label: 'Thao tác', icon: '📌', css: 'activity-icon-created' };
    const timeStr = formatActivityDate(log.created_at);
    const actorDisplay = log.actor_mssv ? `${escapeHtml(log.actor_name)} (${escapeHtml(log.actor_mssv)})` : escapeHtml(log.actor_name);

    let diffHtml = '';
    if (log.action_type === 'status_changed') {
      const fromSt = statusNameMap[log.old_value] || log.old_value || 'Chưa rõ';
      const toSt = statusNameMap[log.new_value] || log.new_value || 'Chưa rõ';
      diffHtml = `<div class="activity-diff-chip"><span class="activity-diff-from">${escapeHtml(fromSt)}</span> → <span class="activity-diff-to">${escapeHtml(toSt)}</span></div>`;
    } else if (log.action_type === 'reassigned') {
      diffHtml = `<div class="activity-diff-chip"><span class="activity-diff-from">${escapeHtml(log.old_value || '—')}</span> → <span class="activity-diff-to">${escapeHtml(log.new_value || '—')}</span></div>`;
    }

    let assigneeHtml = '';
    if (log.assignee_name) {
      assigneeHtml = `<span class="activity-tag">👤 Giao cho: ${escapeHtml(log.assignee_name)}</span>`;
    } else if (log.team_name) {
      assigneeHtml = `<span class="activity-tag">👥 ${escapeHtml(log.team_name)}</span>`;
    }

    return `
      <div class="activity-card">
        <div class="activity-icon-wrap ${meta.css}">${meta.icon}</div>
        <div class="activity-main">
          <div class="activity-actor-row">
            <span class="activity-actor-name">${actorDisplay}</span>
            <span class="activity-time-stamp">${timeStr}</span>
          </div>
          <div class="activity-action-desc">
            ${meta.label} “<span class="activity-target-task">${escapeHtml(log.task_title)}</span>”
          </div>
          ${diffHtml ? `<div style="margin-top:4px">${diffHtml}</div>` : ''}
          <div class="activity-meta-tags">
            ${log.team_name ? `<span class="activity-tag">🏷️ ${escapeHtml(log.team_name)}</span>` : ''}
            ${assigneeHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function formatActivityDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  const day = pad(d.getDate()), mo = pad(d.getMonth() + 1), yr = d.getFullYear();
  const h = pad(d.getHours()), m = pad(d.getMinutes());
  return `${day}/${mo}/${yr} · ${h}:${m}`;
}

function showTaskDetailById(id) {
  const t = (window.adminTaskRows || []).find(x => x.id === id);
  if (!t) return;
  const status = (t.scope === 'group' || t.scope === 'global') && t.completed_at
    ? `${t.completed_by_name ? `Hoàn thành bởi ${t.completed_by_name}` : 'Đã hoàn thành'} · ${new Date(t.completed_at).toLocaleString('vi-VN')}`
    : t.scope === 'global' && t.claimed_by_mssv
      ? `Đang nhận làm bởi ${t.claimed_by_name || t.claimed_by_mssv}${t.claimed_at ? ` · ${new Date(t.claimed_at).toLocaleString('vi-VN')}` : ''}`
      : (t.assignees || []).map(a => `${a.name || a.mssv}: ${a.status}`).join(' · ') || 'Chưa có người nhận';
  showTaskDetail(t.title, t.description, t.scope === 'global' ? 'Toàn xưởng' : t.team_name, (t.assignees || []).map(a => a.name || a.mssv).join(', '), t.priority, t.due_date || '—', status);
}

function showTaskDetail(title, desc, group, assignee, pri, due, status) {
  [['taskDetailTitle', title], ['taskDetailDesc', desc], ['taskDetailGroup', group], ['taskDetailAssignee', assignee], ['taskDetailDue', due], ['taskDetailStatus', status]].forEach(([id, v]) => {
    const e = document.getElementById(id);
    if (e) e.textContent = v || '—';
  });
  document.getElementById('taskDetailModal')?.classList.add('show');
}
function closeTaskDetailModal() {
  document.getElementById('taskDetailModal')?.classList.remove('show');
}

let adminFeedbackCache = [];

function openStudentFeedbackModal(){document.getElementById('studentFeedbackModal')?.classList.add('show');}
function closeStudentFeedbackModal(){document.getElementById('studentFeedbackModal')?.classList.remove('show');}
async function submitStudentFeedback(){toast('warn','Gửi từ tài khoản sinh viên','Mở checkin.html để gửi phản hồi ẩn danh.');}

function setFeedbackFilter(kind, val) {
  if (kind === 'type') {
    const tSel = document.getElementById('fbFilterType');
    if (tSel) tSel.value = val;
  } else if (kind === 'status') {
    const sSel = document.getElementById('fbFilterStatus');
    if (sSel) sSel.value = val;
  } else if (kind === 'all') {
    const tSel = document.getElementById('fbFilterType');
    const sSel = document.getElementById('fbFilterStatus');
    if (tSel) tSel.value = 'all';
    if (sSel) sSel.value = 'all';
  }
  applyFeedbackFilters();
}

function updateFeedbackKpiStats() {
  const suco = adminFeedbackCache.filter(x => x.type === 'suco').length;
  const gopy = adminFeedbackCache.filter(x => x.type === 'gopy').length;
  const muasam = adminFeedbackCache.filter(x => x.type === 'muasam').length;
  const processing = adminFeedbackCache.filter(x => x.status === 'processing').length;
  const resolved = adminFeedbackCache.filter(x => x.status === 'resolved').length;
  const total = adminFeedbackCache.length;

  const elSuco = document.getElementById('fbStatSuco');
  const elGopy = document.getElementById('fbStatGopy');
  const elMuasam = document.getElementById('fbStatMuasam');
  const elProcessing = document.getElementById('fbStatProcessing');
  const elResolved = document.getElementById('fbStatResolved');
  const elAll = document.getElementById('fbStatAll');

  if (elSuco) elSuco.textContent = suco;
  if (elGopy) elGopy.textContent = gopy;
  if (elMuasam) elMuasam.textContent = muasam;
  if (elProcessing) elProcessing.textContent = processing;
  if (elResolved) elResolved.textContent = resolved;
  if (elAll) elAll.textContent = total;
}

async function loadAdminFeedback(){
  const box = document.getElementById('feedbackList');
  if(!box) return;
  box.innerHTML = '<div class="schedule-loading">Đang tải phản hồi...</div>';
  const {data, error} = await supabase.rpc('admin_get_anonymous_feedback');
  if(error || !data?.ok){
    box.innerHTML = '<div class="empty-state">' + escapeHtml(error?.message || data?.message || 'Không tải được phản hồi.') + '</div>';
    return;
  }
  const labels = { gopy: '💡 Góp ý xưởng', suco: '⚠️ Báo hỏng / Sự cố', muasam: '🛠 Đề xuất thiết bị', khac: '💬 Khác' };
  const statusMeta = {
    new: { label: 'Mới nhận', icon: '📩', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
    seen: { label: 'Đã xem', icon: '👁️', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
    processing: { label: 'Đang xử lý', icon: '⏳', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
    resolved: { label: 'Đã giải quyết', icon: '✓', bg: 'var(--ok-bg)', color: 'var(--ok)', border: 'rgba(15,122,74,0.2)' },
    rejected: { label: 'Từ chối', icon: '✕', bg: 'var(--err-bg)', color: 'var(--err)', border: 'rgba(194,56,46,0.2)' }
  };
  const rows = data.items || [];
  adminFeedbackCache = rows;
  updateFeedbackKpiStats();

  box.innerHTML = rows.length ? rows.map(x => {
    const st = statusMeta[x.status] || statusMeta.new;
    const isSuco = x.type === 'suco';
    const borderAccent = isSuco ? 'border-left: 4px solid #ef4444' : x.type === 'muasam' ? 'border-left: 4px solid #7c3aed' : x.type === 'gopy' ? 'border-left: 4px solid #0284c7' : 'border-left: 4px solid #64748b';

    const actionBtns = (x.status === 'resolved')
      ? `<button class="btn btn-secondary btn-sm" style="font-size:11.5px;padding:4px 10px;font-weight:600" onclick="updateFeedbackStatus('${x.id}','processing')" title="Mở lại ý kiến này để xử lý tiếp">↺ Mở lại xử lý</button>`
      : (x.status === 'processing')
      ? `<button class="btn btn-sm" style="background:#15803d;color:#fff;border:none;font-weight:700;padding:4px 12px;font-size:11.5px" onclick="updateFeedbackStatus('${x.id}','resolved')" title="Đánh dấu đã giải quyết xong">✓ Đã giải quyết</button>`
      : `<button class="btn btn-sm" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-weight:700;padding:4px 10px;font-size:11.5px" onclick="updateFeedbackStatus('${x.id}','processing')" title="Tiếp nhận xử lý ý kiến này">⏳ Tiếp nhận</button>
         <button class="btn btn-sm" style="background:#15803d;color:#fff;border:none;font-weight:700;padding:4px 10px;font-size:11.5px" onclick="updateFeedbackStatus('${x.id}','resolved')" title="Đánh dấu đã giải quyết xong">✓ Xong</button>`;

    return `
      <article class="fb-item" data-id="${x.id}" data-type="${x.type}" data-status="${x.status}" data-code="${(x.code||'').toLowerCase()}" data-content="${(x.content||'').toLowerCase()}" style="${borderAccent};background:var(--surface)">
        <div class="fb-item-top">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="fb-anon-tag">🔒 Mã: ${escapeHtml(x.code)}</span>
            <span class="fb-type-badge type-${x.type}">${labels[x.type] || x.type}</span>
          </div>
          <span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:${st.bg};color:${st.color};border:1px solid ${st.border};display:inline-flex;align-items:center;gap:4px">
            ${st.icon} ${st.label}
          </span>
        </div>
        <div class="fb-text" style="font-size:13px;line-height:1.55;background:var(--surface-2);border-radius:8px;padding:12px;border:1px solid var(--border)">${escapeHtml(x.content)}</div>
        <div class="fb-item-bottom" style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <span style="font-size:11.5px;color:var(--muted)">📅 ${new Date(x.created_at).toLocaleString('vi-VN')}</span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${actionBtns}
            <select class="btn btn-sm" style="font-size:11px;padding:3px 6px;border-radius:6px;background:var(--surface);border:1px solid var(--border);color:var(--text);cursor:pointer" onchange="updateFeedbackStatus('${x.id}', this.value)" title="Đổi trạng thái khác">
              <option value="new" ${x.status==='new'?'selected':''}>Mới nhận</option>
              <option value="processing" ${x.status==='processing'?'selected':''}>⏳ Đang xử lý</option>
              <option value="resolved" ${x.status==='resolved'?'selected':''}>✓ Đã giải quyết</option>
              <option value="rejected" ${x.status==='rejected'?'selected':''}>✕ Từ chối</option>
            </select>
            <button class="btn btn-sm btn-danger" style="font-size:11px;padding:3px 8px;border-radius:6px" onclick="deleteFeedbackItem('${x.id}')" title="Xóa phản hồi này">
              🗑 Xóa
            </button>
          </div>
        </div>
      </article>`;
  }).join('') : '<div class="empty-state">Chưa có phản hồi nào.</div>';
  applyFeedbackFilters();
}

async function updateFeedbackStatus(id, newStatus){
  if (!id || !newStatus) return;
  const {data, error} = await supabase.rpc('admin_update_anonymous_feedback', { p_id: id, p_status: newStatus });
  if (error || !data?.ok){
    toast('err', 'Chưa cập nhật được', error?.message || data?.message || '');
    return;
  }
  const label = { new: 'Mới nhận', processing: 'Đang xử lý', resolved: 'Đã giải quyết', rejected: 'Từ chối' }[newStatus] || newStatus;
  toast('ok', 'Đã cập nhật', `Trạng thái phản hồi đã chuyển sang "${label}".`);
  await loadAdminFeedback();
}

async function deleteFeedbackItem(id){
  if (!id) return;
  if (!confirm('Bạn có chắc chắn muốn xóa phản hồi ẩn danh này? Hành động này không thể hoàn tác.')) return;
  const {data, error} = await supabase.rpc('admin_delete_anonymous_feedback', { p_id: id });
  if (error || !data?.ok){
    toast('err', 'Chưa xóa được', error?.message || data?.message || '');
    return;
  }
  toast('ok', 'Đã xóa phản hồi', 'Phản hồi ẩn danh đã được xóa thành công.');
  await loadAdminFeedback();
}

async function markFeedbackResolved(id){
  return updateFeedbackStatus(id, 'resolved');
}

function applyFeedbackFilters(){
  const type = document.getElementById('fbFilterType')?.value || 'all';
  const st = document.getElementById('fbFilterStatus')?.value || 'all';
  const search = (document.getElementById('fbSearchInput')?.value || '').trim().toLowerCase();

  // Highlight KPI card
  ['fbKpiSuco', 'fbKpiGopy', 'fbKpiMuasam', 'fbKpiProcessing', 'fbKpiResolved', 'fbKpiAll'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  if (type === 'suco') document.getElementById('fbKpiSuco')?.classList.add('active');
  else if (type === 'gopy') document.getElementById('fbKpiGopy')?.classList.add('active');
  else if (type === 'muasam') document.getElementById('fbKpiMuasam')?.classList.add('active');
  else if (st === 'processing') document.getElementById('fbKpiProcessing')?.classList.add('active');
  else if (st === 'resolved') document.getElementById('fbKpiResolved')?.classList.add('active');
  else if (type === 'all' && st === 'all') document.getElementById('fbKpiAll')?.classList.add('active');

  let visibleCount = 0;
  document.querySelectorAll('#feedbackList .fb-item').forEach(x => {
    const matchType = (type === 'all' || x.dataset.type === type);
    const matchStatus = (st === 'all' || x.dataset.status === st);
    const code = x.dataset.code || '';
    const content = x.dataset.content || '';
    const matchSearch = !search || code.includes(search) || content.includes(search);

    const isVisible = matchType && matchStatus && matchSearch;
    x.style.display = isVisible ? 'flex' : 'none';
    if (isVisible) visibleCount++;
  });
}
function getVietnamDateKey(offsetDays=0){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const val=k=>Number(parts.find(p=>p.type===k).value);
  return new Date(Date.UTC(val('year'),val('month')-1,val('day')+offsetDays)).toISOString().slice(0,10);
}
function vietnamDateKeyFromTimestamp(value){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const val=k=>parts.find(p=>p.type===k)?.value||'';
  return `${val('year')}-${val('month')}-${val('day')}`;
}
async function initZaloScheduleView(){
  if (!window.zaloSelectedDate) {
    window.zaloSelectedDate = getVietnamDateKey(1);
  }
  const dateInput = document.getElementById('zaloDatePicker');
  if (dateInput) dateInput.value = window.zaloSelectedDate;
  updateZaloQuickButtons(window.zaloSelectedDate);
  await loadZaloScheduleMatrix(window.zaloSelectedDate);
}

function updateZaloQuickButtons(dateKey){
  const today = getVietnamDateKey(0);
  const tomorrow = getVietnamDateKey(1);
  const dayAfter = getVietnamDateKey(2);
  document.getElementById('btnQuickToday')?.classList.toggle('active', dateKey === today);
  document.getElementById('btnQuickTomorrow')?.classList.toggle('active', dateKey === tomorrow);
  document.getElementById('btnQuickDayAfter')?.classList.toggle('active', dateKey === dayAfter);
}

function setZaloQuickDate(offsetDays){
  const newDate = getVietnamDateKey(offsetDays);
  const dateInput = document.getElementById('zaloDatePicker');
  if (dateInput) dateInput.value = newDate;
  onZaloDateChanged(newDate);
}

async function onZaloDateChanged(newDate){
  if (!newDate) return;
  window.zaloSelectedDate = newDate;
  updateZaloQuickButtons(newDate);
  await loadZaloScheduleMatrix(newDate);
}

async function loadZaloScheduleMatrix(dateKey){
  const status = document.getElementById('zaloImageStatus');
  const label = document.getElementById('zaloTargetDateLabel');
  if (!dateKey) dateKey = getVietnamDateKey(1);
  
  const dayObj = new Date(`${dateKey}T12:00:00+07:00`);
  const dayDisplay = dayObj.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  if (label) label.textContent = '📅 ' + dayDisplay;
  if (status) status.innerHTML = '<span class="spin"></span> Đang tải ma trận thời khóa biểu từ hệ thống…';

  try {
    const from = new Date(`${dateKey}T00:00:00+07:00`).toISOString();
    const to = new Date(new Date(from).getTime() + 86400000).toISOString();

    const [{ data: rawMembers, error: e1 }, { data: schedules, error: e2 }] = await Promise.all([
      supabase.from('students').select('mssv, name, is_active').order('mssv').limit(1000),
      supabase.from('student_schedules').select('mssv, subject_name, room_name, start_time, end_time, buoi').lt('start_time', to).gte('end_time', from).order('start_time')
    ]);

    if (e1 || e2) throw new Error(e1?.message || e2?.message || 'Lỗi truy vấn dữ liệu');

    // Chỉ lấy sinh viên đang hoạt động (active)
    const members = (rawMembers || []).filter(s => s.is_active !== false);
    if (!members.length) {
      if (status) status.textContent = 'Danh sách sinh viên đang trống.';
      return;
    }

    const byId = new Map();
    (schedules || []).forEach(x => {
      const a = byId.get(x.mssv) || [];
      a.push(x);
      byId.set(x.mssv, a);
    });

    const periodsConfig = [
      { key: 'morning', label: 'SÁNG', session: 1, from: '07:30', to: '11:25' },
      { key: 'afternoon', label: 'CHIỀU', session: 2, from: '12:50', to: '16:45' },
      { key: 'evening', label: 'TỐI', session: 3, from: '17:30', to: '20:50' }
    ];

    const matrixRows = [];
    const periodStats = {
      morning: { free: 0, busy: 0, busyMssvs: new Set(), classesByMssv: new Map() },
      afternoon: { free: 0, busy: 0, busyMssvs: new Set(), classesByMssv: new Map() },
      evening: { free: 0, busy: 0, busyMssvs: new Set(), classesByMssv: new Map() }
    };

    members.forEach((m, idx) => {
      const studentScheds = byId.get(m.mssv) || [];
      const rowItem = {
        index: idx + 1,
        mssv: m.mssv,
        name: m.name || m.mssv,
        periods: {}
      };

      periodsConfig.forEach(p => {
        const rangeStart = new Date(`${dateKey}T${p.from}:00+07:00`).getTime();
        const rangeEnd = new Date(`${dateKey}T${p.to}:00+07:00`).getTime();
        const classes = studentScheds.filter(x => {
          if (x.buoi != null) return Number(x.buoi) === p.session;
          const sT = new Date(x.start_time).getTime();
          const eT = new Date(x.end_time).getTime();
          return sT < rangeEnd && eT > rangeStart;
        }).map(x => ({
          subject_name: x.subject_name || 'Môn học',
          room_name: x.room_name || '',
          time_range: `${new Date(x.start_time).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'})}–${new Date(x.end_time).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'})}`
        }));

        const isBusy = classes.length > 0;
        rowItem.periods[p.key] = { isFree: !isBusy, classes };
        if (isBusy) {
          periodStats[p.key].busy++;
          periodStats[p.key].busyMssvs.add(m.mssv);
          periodStats[p.key].classesByMssv.set(m.mssv, classes);
        } else {
          periodStats[p.key].free++;
        }
      });

      matrixRows.push(rowItem);
    });

    const totalStudents = members.length;

    // 1. Cập nhật 3 KPI Cards
    const updateKpi = (key, freeEl, busyEl, barEl) => {
      const f = periodStats[key].free;
      const b = periodStats[key].busy;
      if (freeEl) freeEl.textContent = f;
      if (busyEl) busyEl.textContent = b;
      if (barEl) {
        const pct = totalStudents ? Math.round((f / totalStudents) * 100) : 0;
        barEl.style.width = pct + '%';
      }
    };
    updateKpi('morning', document.getElementById('kpiMorningFree'), document.getElementById('kpiMorningBusy'), document.getElementById('kpiMorningBar'));
    updateKpi('afternoon', document.getElementById('kpiAfternoonFree'), document.getElementById('kpiAfternoonBusy'), document.getElementById('kpiAfternoonBar'));
    updateKpi('evening', document.getElementById('kpiEveningFree'), document.getElementById('kpiEveningBusy'), document.getElementById('kpiEveningBar'));

    // 2. Cập nhật Lời nhắn Zalo
    const mFree = periodStats.morning.free, mBusy = periodStats.morning.busy;
    const aFree = periodStats.afternoon.free, aBusy = periodStats.afternoon.busy;
    const eFree = periodStats.evening.free, eBusy = periodStats.evening.busy;

    const caption = `📅 LỊCH TOÀN BỘ SINH VIÊN NGÀY ${dayDisplay}\n` +
      `• SÁNG (07:30–11:25): ${mFree} rảnh, ${mBusy} bận\n` +
      `• CHIỀU (12:50–16:45): ${aFree} rảnh, ${aBusy} bận\n` +
      `• TỐI (17:30–20:50): ${eFree} rảnh, ${eBusy} bận\n\n` +
      `👉 Chi tiết danh sách rảnh/bận theo từng ca xem trong file Excel đính kèm.`;

    const captionBox = document.getElementById('zaloCaptionPreview');
    if (captionBox) captionBox.textContent = caption;

    // 3. Render Table Rows
    const tbody = document.getElementById('zaloMatrixTbody');
    if (tbody) {
      tbody.innerHTML = matrixRows.map(r => {
        const renderCell = (periodData) => {
          if (periodData.isFree) {
            return '<span class="badge-cell-free">🟢 Rảnh</span>';
          }
          const items = periodData.classes.map(c => {
            const room = c.room_name ? ` · P.${c.room_name}` : '';
            return `<div class="cell-class-info">⏱ ${c.time_range} · <b>${c.subject_name}</b>${room}</div>`;
          }).join('');
          return `<span class="badge-cell-busy">🔴 Bận</span>${items}`;
        };

        const hasBusy = !r.periods.morning.isFree || !r.periods.afternoon.isFree || !r.periods.evening.isFree;
        const isAllDayFree = r.periods.morning.isFree && r.periods.afternoon.isFree && r.periods.evening.isFree;

        return `<tr class="matrix-row" 
          data-name="${(r.name || '').toLowerCase()}" 
          data-mssv="${r.mssv}"
          data-free-all-day="${isAllDayFree}"
          data-free-morning="${r.periods.morning.isFree}"
          data-free-afternoon="${r.periods.afternoon.isFree}"
          data-free-evening="${r.periods.evening.isFree}"
          data-has-busy="${hasBusy}">
          <td class="matrix-stt" style="text-align:center;color:var(--muted);font-weight:700">${r.index}</td>
          <td style="font-family:monospace;font-weight:700">${r.mssv}</td>
          <td style="font-weight:700">${r.name}</td>
          <td class="col-shift col-shift-morning">${renderCell(r.periods.morning)}</td>
          <td class="col-shift col-shift-afternoon">${renderCell(r.periods.afternoon)}</td>
          <td class="col-shift col-shift-evening">${renderCell(r.periods.evening)}</td>
        </tr>`;
      }).join('');

      // Render danh sách dạng Thẻ trên Mobile
      const mobileCardsContainer = document.getElementById('zaloMatrixCardsMobile');
      if (mobileCardsContainer) {
        mobileCardsContainer.innerHTML = matrixRows.map(r => {
          const hasBusy = !r.periods.morning.isFree || !r.periods.afternoon.isFree || !r.periods.evening.isFree;
          const isAllDayFree = r.periods.morning.isFree && r.periods.afternoon.isFree && r.periods.evening.isFree;
          const badgeClass = isAllDayFree ? 'free-all' : hasBusy ? 'has-busy' : 'part-free';
          const badgeText = isAllDayFree ? '🌟 Rảnh cả ngày' : hasBusy ? '🔴 Có lịch học' : '🟢 Rảnh';
          const initial = (r.name || r.mssv).trim().split(' ').pop().slice(0, 2).toUpperCase() || 'SV';

          return `
            <div class="zalo-student-card" 
              data-name="${(r.name || '').toLowerCase()}" 
              data-mssv="${r.mssv}"
              data-free-all-day="${isAllDayFree}"
              data-free-morning="${r.periods.morning.isFree}"
              data-free-afternoon="${r.periods.afternoon.isFree}"
              data-free-evening="${r.periods.evening.isFree}"
              data-has-busy="${hasBusy}">
              <div class="zalo-card-header">
                <div class="zalo-card-user">
                  <div class="zalo-card-avatar">${escapeHtml(initial)}</div>
                  <div style="min-width:0">
                    <div class="zalo-card-name">${escapeHtml(r.name)}</div>
                    <div class="zalo-card-mssv">${escapeHtml(r.mssv)}</div>
                  </div>
                </div>
                <span class="zalo-card-badge ${badgeClass}">${badgeText}</span>
              </div>
              <div class="zalo-card-shifts">
                <div class="zalo-card-shift ${r.periods.morning.isFree ? 'is-free' : 'is-busy'}">
                  <span class="shift-name">Sáng</span>
                  <span class="shift-status">${r.periods.morning.isFree ? '🟢 Rảnh' : '🔴 ' + escapeHtml(r.periods.morning.classes[0]?.subject_name || 'Bận')}</span>
                </div>
                <div class="zalo-card-shift ${r.periods.afternoon.isFree ? 'is-free' : 'is-busy'}">
                  <span class="shift-name">Chiều</span>
                  <span class="shift-status">${r.periods.afternoon.isFree ? '🟢 Rảnh' : '🔴 ' + escapeHtml(r.periods.afternoon.classes[0]?.subject_name || 'Bận')}</span>
                </div>
                <div class="zalo-card-shift ${r.periods.evening.isFree ? 'is-free' : 'is-busy'}">
                  <span class="shift-name">Tối</span>
                  <span class="shift-status">${r.periods.evening.isFree ? '🟢 Rảnh' : '🔴 ' + escapeHtml(r.periods.evening.classes[0]?.subject_name || 'Bận')}</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
      renderZaloWeekPills(dateKey);
    }

    // 4. Update Footer
    const tfoot = document.getElementById('zaloMatrixTfoot');
    if (tfoot) {
      tfoot.style.display = '';
      const fMorning = document.getElementById('tfootMorningSummary');
      const fAfternoon = document.getElementById('tfootAfternoonSummary');
      const fEvening = document.getElementById('tfootEveningSummary');
      if (fMorning) fMorning.innerHTML = `<span style="color:var(--ok)">${mFree} Rảnh</span> / <span style="color:var(--err)">${mBusy} Bận</span>`;
      if (fAfternoon) fAfternoon.innerHTML = `<span style="color:var(--ok)">${aFree} Rảnh</span> / <span style="color:var(--err)">${aBusy} Bận</span>`;
      if (fEvening) fEvening.innerHTML = `<span style="color:var(--ok)">${eFree} Rảnh</span> / <span style="color:var(--err)">${eBusy} Bận</span>`;
    }

    window.zaloScheduleMatrixData = {
      dateKey,
      day: dayDisplay,
      list: members,
      matrixRows,
      periods: {
        morning: { free_count: mFree, busy_count: mBusy, ...periodStats.morning },
        afternoon: { free_count: aFree, busy_count: aBusy, ...periodStats.afternoon },
        evening: { free_count: eFree, busy_count: eBusy, ...periodStats.evening }
      }
    };

    updateMatrixFilterCounts();
    filterZaloMatrix();
    if (status) status.textContent = `Đã tải ma trận cho ${totalStudents} sinh viên · ${dayDisplay}.`;
  } catch (err) {
    console.error('loadZaloScheduleMatrix error:', err);
    if (status) status.textContent = 'Chưa tải được lịch: ' + (err.message || err);
    toast('err', 'Lỗi tải lịch', err.message || 'Không thể đọc dữ liệu.');
  }
}

// ==========================================================
// BỘ LỌC LỊCH RẢNH / BẬN THÔNG MINH (THEO CA & TRẠNG THÁI)
// ==========================================================
let _matrixCurrentShift = 'all';   // 'all' | 'morning' | 'afternoon' | 'evening'
let _matrixCurrentStatus = 'all';  // 'all' | 'free' | 'busy' | 'free_all_day'
let _matrixCurrentFilter = 'all';  // tương thích ngược

function updateMatrixFilterCounts() {
  const data = window.zaloScheduleMatrixData;
  if (!data || !data.matrixRows) return;
  const rows = data.matrixRows;
  const total = rows.length;

  const cAll = document.getElementById('filterCountAll');
  const cFree = document.getElementById('filterCountFree');
  const cBusy = document.getElementById('filterCountBusy');
  const cAllDay = document.getElementById('filterCountAllDay');
  const btnAllDay = document.getElementById('btnFilterAllDay');

  if (cAll) cAll.textContent = total;

  let freeCount = 0;
  let busyCount = 0;

  if (_matrixCurrentShift === 'morning') {
    freeCount = rows.filter(r => r.periods.morning.isFree).length;
    busyCount = total - freeCount;
    if (btnAllDay) btnAllDay.style.display = 'none';
  } else if (_matrixCurrentShift === 'afternoon') {
    freeCount = rows.filter(r => r.periods.afternoon.isFree).length;
    busyCount = total - freeCount;
    if (btnAllDay) btnAllDay.style.display = 'none';
  } else if (_matrixCurrentShift === 'evening') {
    freeCount = rows.filter(r => r.periods.evening.isFree).length;
    busyCount = total - freeCount;
    if (btnAllDay) btnAllDay.style.display = 'none';
  } else {
    // Toàn bộ ngày
    freeCount = rows.filter(r => r.periods.morning.isFree || r.periods.afternoon.isFree || r.periods.evening.isFree).length;
    busyCount = rows.filter(r => !r.periods.morning.isFree || !r.periods.afternoon.isFree || !r.periods.evening.isFree).length;
    const allDayFree = rows.filter(r => r.periods.morning.isFree && r.periods.afternoon.isFree && r.periods.evening.isFree).length;
    if (cAllDay) cAllDay.textContent = allDayFree;
    if (btnAllDay) btnAllDay.style.display = '';
  }

  if (cFree) cFree.textContent = freeCount;
  if (cBusy) cBusy.textContent = busyCount;
}

function setMatrixShiftFilter(shift, status, ev) {
  if (ev) ev.stopPropagation();
  _matrixCurrentShift = shift || 'all';
  if (status) {
    _matrixCurrentStatus = status;
  } else if (_matrixCurrentShift !== 'all' && _matrixCurrentStatus === 'free_all_day') {
    _matrixCurrentStatus = 'free';
  }

  // Cập nhật active class cho nhóm nút Ca
  document.querySelectorAll('#matrixFilterButtons [data-shift]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.shift === _matrixCurrentShift);
  });

  // Cập nhật active class cho nhóm nút Status
  document.querySelectorAll('#matrixFilterButtons [data-status]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === _matrixCurrentStatus);
  });

  // Highlight cột trên table
  const table = document.getElementById('zaloMatrixTable');
  if (table) {
    table.classList.remove('focus-morning', 'focus-afternoon', 'focus-evening');
    if (_matrixCurrentShift === 'morning') table.classList.add('focus-morning');
    else if (_matrixCurrentShift === 'afternoon') table.classList.add('focus-afternoon');
    else if (_matrixCurrentShift === 'evening') table.classList.add('focus-evening');
  }

  // Highlight KPI card & KPI pills
  document.querySelectorAll('.zalo-kpi-card').forEach(c => c.classList.remove('active-focus'));
  document.querySelectorAll('.kpi-pill').forEach(p => p.classList.remove('active-pill'));

  if (_matrixCurrentShift === 'morning') {
    document.getElementById('kpiCardMorning')?.classList.add('active-focus');
    if (_matrixCurrentStatus === 'free') document.getElementById('kpiPillMorningFree')?.classList.add('active-pill');
    else if (_matrixCurrentStatus === 'busy') document.getElementById('kpiPillMorningBusy')?.classList.add('active-pill');
  } else if (_matrixCurrentShift === 'afternoon') {
    document.getElementById('kpiCardAfternoon')?.classList.add('active-focus');
    if (_matrixCurrentStatus === 'free') document.getElementById('kpiPillAfternoonFree')?.classList.add('active-pill');
    else if (_matrixCurrentStatus === 'busy') document.getElementById('kpiPillAfternoonBusy')?.classList.add('active-pill');
  } else if (_matrixCurrentShift === 'evening') {
    document.getElementById('kpiCardEvening')?.classList.add('active-focus');
    if (_matrixCurrentStatus === 'free') document.getElementById('kpiPillEveningFree')?.classList.add('active-pill');
    else if (_matrixCurrentStatus === 'busy') document.getElementById('kpiPillEveningBusy')?.classList.add('active-pill');
  }

  updateMatrixFilterCounts();
  filterZaloMatrix();
}

function setMatrixStatusFilter(status) {
  _matrixCurrentStatus = status || 'all';
  document.querySelectorAll('#matrixFilterButtons [data-status]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === _matrixCurrentStatus);
  });

  // Đồng bộ highlight pill trên KPI card
  document.querySelectorAll('.kpi-pill').forEach(p => p.classList.remove('active-pill'));
  if (_matrixCurrentShift === 'morning') {
    if (_matrixCurrentStatus === 'free') document.getElementById('kpiPillMorningFree')?.classList.add('active-pill');
    else if (_matrixCurrentStatus === 'busy') document.getElementById('kpiPillMorningBusy')?.classList.add('active-pill');
  } else if (_matrixCurrentShift === 'afternoon') {
    if (_matrixCurrentStatus === 'free') document.getElementById('kpiPillAfternoonFree')?.classList.add('active-pill');
    else if (_matrixCurrentStatus === 'busy') document.getElementById('kpiPillAfternoonBusy')?.classList.add('active-pill');
  } else if (_matrixCurrentShift === 'evening') {
    if (_matrixCurrentStatus === 'free') document.getElementById('kpiPillEveningFree')?.classList.add('active-pill');
    else if (_matrixCurrentStatus === 'busy') document.getElementById('kpiPillEveningBusy')?.classList.add('active-pill');
  }

  filterZaloMatrix();
}

// Proxy tương thích ngược với các lệnh gọi cũ
function setMatrixFilter(filterType) {
  _matrixCurrentFilter = filterType;
  if (filterType === 'free_morning') setMatrixShiftFilter('morning', 'free');
  else if (filterType === 'busy_morning') setMatrixShiftFilter('morning', 'busy');
  else if (filterType === 'free_afternoon') setMatrixShiftFilter('afternoon', 'free');
  else if (filterType === 'busy_afternoon') setMatrixShiftFilter('afternoon', 'busy');
  else if (filterType === 'free_evening') setMatrixShiftFilter('evening', 'free');
  else if (filterType === 'busy_evening') setMatrixShiftFilter('evening', 'busy');
  else if (filterType === 'free_all_day') setMatrixShiftFilter('all', 'free_all_day');
  else if (filterType === 'busy_any') setMatrixShiftFilter('all', 'busy');
  else setMatrixShiftFilter('all', 'all');
}

function filterZaloMatrix(){
  const search = (document.getElementById('zaloMatrixSearch')?.value || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#zaloMatrixTbody .matrix-row');
  let visibleIndex = 0;

  rows.forEach(r => {
    const name = r.dataset.name || '';
    const mssv = r.dataset.mssv || '';
    const matchSearch = !search || name.includes(search) || mssv.includes(search);

    const isFreeAllDay = r.dataset.freeAllDay === 'true';
    const isFreeMorning = r.dataset.freeMorning === 'true';
    const isFreeAfternoon = r.dataset.freeAfternoon === 'true';
    const isFreeEvening = r.dataset.freeEvening === 'true';
    const hasBusy = r.dataset.hasBusy === 'true';

    let matchFilter = true;
    if (_matrixCurrentShift === 'morning') {
      if (_matrixCurrentStatus === 'free') matchFilter = isFreeMorning;
      else if (_matrixCurrentStatus === 'busy') matchFilter = !isFreeMorning;
    } else if (_matrixCurrentShift === 'afternoon') {
      if (_matrixCurrentStatus === 'free') matchFilter = isFreeAfternoon;
      else if (_matrixCurrentStatus === 'busy') matchFilter = !isFreeAfternoon;
    } else if (_matrixCurrentShift === 'evening') {
      if (_matrixCurrentStatus === 'free') matchFilter = isFreeEvening;
      else if (_matrixCurrentStatus === 'busy') matchFilter = !isFreeEvening;
    } else {
      if (_matrixCurrentStatus === 'free_all_day') matchFilter = isFreeAllDay;
      else if (_matrixCurrentStatus === 'free') matchFilter = (isFreeMorning || isFreeAfternoon || isFreeEvening);
      else if (_matrixCurrentStatus === 'busy') matchFilter = hasBusy;
    }

    const isVisible = (matchSearch && matchFilter);
    r.style.display = isVisible ? '' : 'none';

    if (isVisible) {
      visibleIndex++;
      const sttCell = r.querySelector('.matrix-stt');
      if (sttCell) sttCell.textContent = visibleIndex;
    }
  });

  // Lọc song song cả danh sách thẻ mobile
  const cards = document.querySelectorAll('#zaloMatrixCardsMobile .zalo-student-card');
  cards.forEach(c => {
    const name = c.dataset.name || '';
    const mssv = c.dataset.mssv || '';
    const matchSearch = !search || name.includes(search) || mssv.includes(search);

    const isFreeAllDay = c.dataset.freeAllDay === 'true';
    const isFreeMorning = c.dataset.freeMorning === 'true';
    const isFreeAfternoon = c.dataset.freeAfternoon === 'true';
    const isFreeEvening = c.dataset.freeEvening === 'true';
    const hasBusy = c.dataset.hasBusy === 'true';

    let matchFilter = true;
    if (_matrixCurrentShift === 'morning') {
      if (_matrixCurrentStatus === 'free') matchFilter = isFreeMorning;
      else if (_matrixCurrentStatus === 'busy') matchFilter = !isFreeMorning;
    } else if (_matrixCurrentShift === 'afternoon') {
      if (_matrixCurrentStatus === 'free') matchFilter = isFreeAfternoon;
      else if (_matrixCurrentStatus === 'busy') matchFilter = !isFreeAfternoon;
    } else if (_matrixCurrentShift === 'evening') {
      if (_matrixCurrentStatus === 'free') matchFilter = isFreeEvening;
      else if (_matrixCurrentStatus === 'busy') matchFilter = !isFreeEvening;
    } else {
      if (_matrixCurrentStatus === 'free_all_day') matchFilter = isFreeAllDay;
      else if (_matrixCurrentStatus === 'free') matchFilter = (isFreeMorning || isFreeAfternoon || isFreeEvening);
      else if (_matrixCurrentStatus === 'busy') matchFilter = hasBusy;
    }

    c.style.display = (matchSearch && matchFilter) ? '' : 'none';
  });

  // Hiển thị dòng thông báo nếu không có ai
  let noRowEl = document.getElementById('matrixEmptyRow');
  if (visibleIndex === 0) {
    if (!noRowEl) {
      noRowEl = document.createElement('tr');
      noRowEl.id = 'matrixEmptyRow';
      noRowEl.innerHTML = '<td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Không tìm thấy sinh viên nào phù hợp với bộ lọc này.</td>';
      document.getElementById('zaloMatrixTbody')?.appendChild(noRowEl);
    }
    noRowEl.style.display = '';
  } else if (noRowEl) {
    noRowEl.style.display = 'none';
  }
}

function changeZaloDateOffset(delta) {
  const currentKey = window.zaloSelectedDate || document.getElementById('zaloDatePicker')?.value || getVietnamDateKey(0);
  const curDate = new Date(`${currentKey}T12:00:00+07:00`);
  curDate.setDate(curDate.getDate() + delta);
  const y = curDate.getFullYear();
  const m = String(curDate.getMonth() + 1).padStart(2, '0');
  const d = String(curDate.getDate()).padStart(2, '0');
  const newDateKey = `${y}-${m}-${d}`;
  const dateInput = document.getElementById('zaloDatePicker');
  if (dateInput) dateInput.value = newDateKey;
  onZaloDateChanged(newDateKey);
}

function copyFilteredStudentList() {
  const visibleRows = Array.from(document.querySelectorAll('#zaloMatrixTbody .matrix-row')).filter(r => r.style.display !== 'none');
  if (!visibleRows.length) {
    toast('warn', 'Không có dữ liệu', 'Không có sinh viên nào trong bộ lọc hiện tại để sao chép.');
    return;
  }
  
  let shiftLabel = 'TOÀN BỘ NGÀY';
  if (_matrixCurrentShift === 'morning') shiftLabel = 'CA SÁNG (07:30–11:25)';
  else if (_matrixCurrentShift === 'afternoon') shiftLabel = 'CA CHIỀU (12:50–16:45)';
  else if (_matrixCurrentShift === 'evening') shiftLabel = 'CA TỐI (17:30–20:50)';

  let statusLabel = 'Tất cả sinh viên';
  if (_matrixCurrentStatus === 'free') statusLabel = 'Chỉ người RẢNH';
  else if (_matrixCurrentStatus === 'busy') statusLabel = 'Chỉ người BẬN';
  else if (_matrixCurrentStatus === 'free_all_day') statusLabel = 'Rảnh cả ngày';

  const dateStr = window.zaloScheduleMatrixData?.day || 'Hôm nay';
  const lines = [
    `📋 DANH SÁCH [${shiftLabel} — ${statusLabel.toUpperCase()}] (${visibleRows.length} SV) — ${dateStr}:`
  ];

  visibleRows.forEach((r, idx) => {
    const mssv = r.dataset.mssv || '';
    const name = r.querySelector('td:nth-child(3)')?.textContent?.trim() || '';

    let extra = '';
    if (_matrixCurrentShift === 'morning') {
      const col = r.querySelector('.col-shift-morning');
      const info = col?.querySelector('.cell-class-info')?.textContent?.trim();
      extra = r.dataset.freeMorning === 'true' ? ' — 🟢 Rảnh' : ` — 🔴 Bận (${info || 'Có lịch học'})`;
    } else if (_matrixCurrentShift === 'afternoon') {
      const col = r.querySelector('.col-shift-afternoon');
      const info = col?.querySelector('.cell-class-info')?.textContent?.trim();
      extra = r.dataset.freeAfternoon === 'true' ? ' — 🟢 Rảnh' : ` — 🔴 Bận (${info || 'Có lịch học'})`;
    } else if (_matrixCurrentShift === 'evening') {
      const col = r.querySelector('.col-shift-evening');
      const info = col?.querySelector('.cell-class-info')?.textContent?.trim();
      extra = r.dataset.freeEvening === 'true' ? ' — 🟢 Rảnh' : ` — 🔴 Bận (${info || 'Có lịch học'})`;
    } else {
      const isAllDay = r.dataset.freeAllDay === 'true';
      extra = isAllDay ? ' — 🌟 Rảnh cả ngày' : (r.dataset.hasBusy === 'true' ? ' — 🔴 Có lịch học' : ' — 🟢 Rảnh');
    }

    lines.push(`${idx + 1}. ${name} (${mssv})${extra}`);
  });

  const textToCopy = lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy).then(() => {
      toast('ok', 'Đã sao chép', `Đã chép danh sách ${visibleRows.length} sinh viên vào bộ nhớ tạm.`);
    }).catch(err => {
      console.warn('Clipboard write error:', err);
      fallbackCopyMatrixList(textToCopy, visibleRows.length);
    });
  } else {
    fallbackCopyMatrixList(textToCopy, visibleRows.length);
  }
}

function fallbackCopyMatrixList(text, count) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('ok', 'Đã sao chép', `Đã chép danh sách ${count} sinh viên vào bộ nhớ tạm.`);
  } catch (e) {
    toast('err', 'Không sao chép được', 'Trình duyệt chặn truy cập Clipboard.');
  }
  document.body.removeChild(ta);
}

function exportZaloScheduleExcel(){
  if (!window.zaloScheduleMatrixData) {
    toast('warn', 'Chưa có dữ liệu', 'Vui lòng chờ tải dữ liệu xong rồi xuất file.');
    return;
  }
  const { dateKey, day, list, matrixRows, periods } = window.zaloScheduleMatrixData;
  const morning = periods.morning;
  const afternoon = periods.afternoon;
  const evening = periods.evening;

  const aoa = [
    ['LH-NaviX — BẢNG TỔNG HỢP LỊCH RẢNH / BẬN SINH VIÊN'],
    [`Ngày: ${day} (${dateKey}) — Dữ liệu thời khóa biểu ME`],
    [],
    ['STT', 'MSSV', 'Họ và tên', 'SÁNG (07:30–11:25)', 'CHIỀU (12:50–16:45)', 'TỐI (17:30–20:50)']
  ];

  matrixRows.forEach((r, idx) => {
    const fmtPeriod = (pData) => {
      if (pData.isFree) return 'Rảnh';
      return 'Bận: ' + pData.classes.map(c => {
        const room = c.room_name ? ` (P.${c.room_name})` : '';
        return `${c.subject_name}${room} [${c.time_range}]`;
      }).join('; ');
    };

    aoa.push([
      idx + 1,
      r.mssv,
      r.name,
      fmtPeriod(r.periods.morning),
      fmtPeriod(r.periods.afternoon),
      fmtPeriod(r.periods.evening)
    ]);
  });

  aoa.push([]);
  aoa.push([
    'TỔNG KẾT',
    '',
    `${list.length} Sinh viên`,
    `${morning.free_count} Rảnh / ${morning.busy_count} Bận`,
    `${afternoon.free_count} Rảnh / ${afternoon.busy_count} Bận`,
    `${evening.free_count} Rảnh / ${evening.busy_count} Bận`
  ]);

  const filename = `Lich_Ranh_Ban_${dateKey}.xlsx`;

  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 28 },
      { wch: 42 },
      { wch: 42 },
      { wch: 42 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lịch Rảnh Bận');
    XLSX.writeFile(wb, filename);
    toast('ok', 'Đã xuất file Excel', `Tải thành công file ${filename}`);
  } else {
    // Fallback: UTF-8 BOM CSV
    const csvContent = '\uFEFF' + aoa.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Lich_Ranh_Ban_${dateKey}.csv`;
    link.click();
    toast('ok', 'Đã xuất file CSV', `Tải thành công file Lich_Ranh_Ban_${dateKey}.csv`);
  }
}

async function syncAndRefreshZaloSchedule(){
  const dateKey = window.zaloSelectedDate || getVietnamDateKey(1);
  const btn = document.getElementById('zaloSyncCopyButton');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Đang đồng bộ ME…';
  }
  try {
    const synced = await syncSchedulesFromME(false, dateKey, true, btn, false);
    if (synced) {
      toast('ok', 'Đồng bộ thành công', `Đã cập nhật lịch ME ngày ${dateKey}.`);
      await loadZaloScheduleMatrix(dateKey);
    }
  } catch (e) {
    toast('err', 'Đồng bộ thất bại', e.message || 'Lỗi khi kết nối ME.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  }
}

async function copyZaloCaption(btn){
  const text = document.getElementById('zaloCaptionPreview')?.textContent || '';
  if (!text) {
    toast('warn', 'Chưa có nội dung', 'Vui lòng chờ tải lịch xong rồi sao chép.');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('ok', 'Đã sao chép tin nhắn', 'Lời nhắn Zalo đã sẵn sàng để dán vào nhóm.');

    // Lucian UX/UI #008 Morphing Copy Interaction
    const triggers = document.querySelectorAll('.u-copy-trigger');
    triggers.forEach(tr => {
      tr.classList.add('is-copied');
      const label = tr.querySelector('.u-copy-label');
      if (label) label.textContent = '✓ Đã sao chép!';
    });
    setTimeout(() => {
      triggers.forEach(tr => {
        tr.classList.remove('is-copied');
        const label = tr.querySelector('.u-copy-label');
        if (label) {
          label.textContent = tr.classList.contains('zalo-mobile-fab') ? 'Sao chép Zalo' : 'Sao chép lời nhắn';
        }
      });
    }, 1800);
  } catch (e) {
    toast('warn', 'Không sao chép được', 'Hãy bôi đen lời nhắn bên dưới để sao chép thủ công.');
  }
}

let currentSession = null;
let students = [];
let attendanceMap = {};
let currentFilter = 'all';
let currentSearch = '';
let currentPage = 1;
let pageSize = 20;
let countdownTimer = null;
let pollTimer = null;
let realtimeChannel = null;
let _closingSession = false;   // chặn gọi đóng phiên 2 lần
let _lastMssvSet = new Set();

function fmtTime(sec){ return String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0'); }
function fmtClock(d){ return d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }

/* Lucian UX/UI #070 Stacking Toasts state */
let _lucianToastList = [];
let _lucianToastOpen = false;

function toast(type, title, text, duration = 4200){
  let wrap = document.getElementById('toastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  let stack = wrap.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    wrap.appendChild(stack);

    stack.addEventListener('pointerenter', () => { _lucianToastOpen = true; _layoutToasts(); });
    stack.addEventListener('pointerleave', () => { _lucianToastOpen = false; _layoutToasts(); });
  }

  const icons = { ok:'✓', err:'✕', warn:'⚠', info:'ℹ' };
  const el = document.createElement('div');
  el.className = 'toast t-' + type;
  el.innerHTML = `
    <div class="toast-ic">${icons[type] || 'ℹ'}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${text ? `<div class="toast-text">${text}</div>` : ''}
    </div>
    <button class="toast-close" type="button" aria-label="Đóng">✕</button>
    <div class="toast-progress-bar"></div>
  `;

  const item = { el, left: duration, maxDur: duration };
  stack.appendChild(el);
  _lucianToastList.unshift(item);

  // Swipe to dismiss gesture
  let sx = 0, dx = 0, down = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.toast-close')) return;
    down = true; sx = e.clientX; dx = 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-drag');
  });
  el.addEventListener('pointermove', (e) => {
    if (!down) return;
    dx = e.clientX - sx;
    el.style.setProperty('--dx', dx + 'px');
    el.style.setProperty('--o', Math.max(0.2, 1 - Math.abs(dx) / 220));
  });
  const onPointerUp = () => {
    if (!down) return;
    down = false;
    el.classList.remove('is-drag');
    if (Math.abs(dx) > 75) {
      _removeToast(item, dx > 0 ? 1 : -1);
    } else {
      el.style.setProperty('--dx', '0px');
      el.style.setProperty('--o', '1');
      _layoutToasts();
    }
  };
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);

  el.querySelector('.toast-close').addEventListener('click', () => _removeToast(item));
  _layoutToasts();
}

function _layoutToasts(){
  let acc = 0;
  _lucianToastList.forEach((t, i) => {
    const el = t.el;
    if (_lucianToastOpen) {
      el.style.setProperty('--y', acc + 'px');
      el.style.setProperty('--s', '1');
      el.style.setProperty('--o', '1');
      acc += el.offsetHeight + 8;
    } else {
      el.style.setProperty('--y', (i * 12) + 'px');
      el.style.setProperty('--s', (1 - i * 0.05).toFixed(2));
      el.style.setProperty('--o', i > 2 ? '0' : '1');
    }
    el.style.zIndex = 50 - i;
  });
}

function _removeToast(item, dir = 1){
  const idx = _lucianToastList.indexOf(item);
  if (idx < 0) return;
  _lucianToastList.splice(idx, 1);
  item.el.style.setProperty('--dx', (dir * 280) + 'px');
  item.el.classList.add('leave');
  setTimeout(() => item.el.remove(), 350);
  _layoutToasts();
}

let _lastToastTime = performance.now();
requestAnimationFrame(function _toastLoop(now){
  const dt = now - _lastToastTime;
  _lastToastTime = now;
  if (!_lucianToastOpen) {
    _lucianToastList.slice().forEach((t) => {
      t.left -= dt;
      t.el.style.setProperty('--progress', Math.max(0, t.left / t.maxDur).toFixed(3));
      if (t.left <= 0) _removeToast(t);
    });
  }
  requestAnimationFrame(_toastLoop);
});

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
  const { data: prof } = await supabase.from('profiles').select('full_name, mssv').eq('user_id', auth.session.user.id).maybeSingle();
  const admName = prof?.full_name || 'Admin';
  const admMssv = prof?.mssv || '—';
  const elName = document.getElementById('adminName');
  if (elName) elName.textContent = admName;
  const elMssv = document.getElementById('adminMssv');
  if (elMssv) elMssv.textContent = admMssv;

  const sideName = document.getElementById('sidebarAdminName');
  if (sideName) sideName.textContent = admName;
  const sideMssv = document.getElementById('sidebarAdminMssv');
  if (sideMssv) sideMssv.textContent = admMssv;

  if (typeof loadAdminAvatar === 'function') {
    await loadAdminAvatar(auth.session.user.id, prof?.mssv, admName);
  }

  supabase.auth.onAuthStateChange(e => { if (e === 'SIGNED_OUT') location.href = 'index.html'; });
  return auth.session.user;
}
async function logout(){
  if (!confirm('Đăng xuất khỏi hệ thống?')) return;
  // Dừng hết tác vụ nền trước khi thoát
  clearInterval(countdownTimer);
  clearInterval(pollTimer);
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  localStorage.removeItem('saved_creds');
  await supabase.auth.signOut();
  location.replace('index.html');
}
async function loadStudents(){
  const { data, error } = await supabase.from('students').select('mssv, name, class, phone, avatar, is_active').order('mssv');
  const errorBox = document.getElementById('studentsLoadError');
  if (error){
    console.error('loadStudents error:', error);
    students = [];
    if (errorBox) {
      errorBox.style.display = 'block';
      errorBox.textContent = `Không đọc được danh sách sinh viên từ Supabase (${error.code || 'lỗi truy vấn'}): ${error.message}.`;
    }
    return false;
  }
  if (errorBox) errorBox.style.display = 'none';
  students = (data || []).map(s => {
    let mssv = s.mssv;
    let avatar = s.avatar;
    if (mssv === '12300555') {
      mssv = '123000555';
      avatar = 'images/faces/123000555.png';
      // Tự động chuyển đổi bản ghi sinh viên trên Supabase
      if (typeof supabase !== 'undefined') {
        supabase.from('students').upsert({
          mssv: '123000555',
          name: s.name || 'Nguyễn Lê Vũ Duy',
          class: s.class || '23TD111',
          phone: s.phone || '0888189218',
          avatar: 'images/faces/123000555.png',
          is_active: true
        }, { onConflict: 'mssv' }).then(() => {
          supabase.from('students').delete().eq('mssv', '12300555');
        }).catch(e => console.warn('Lỗi migrate student:', e));
      }
    }
    return {
      mssv: mssv,
      name: s.name,
      class: s.class || '',
      phone: s.phone || '',
      avatar: avatar || `images/faces/${mssv}.png`,
      is_active: s.is_active !== false
    };
  });
  const navBadge = document.getElementById('navStudentsBadge');
  if (navBadge) navBadge.textContent = students.length;
  return true;
}
async function loadSession(){
  const { data, error } = await supabase.rpc('get_open_session');
  if (error || !data){ currentSession = null; window.currentSession = null; showEmpty(); return null; }
  currentSession = data;
  window.currentSession = data;
  return data;
}
async function loadAttendance(){
  if (!currentSession) return;
  const { data, error } = await supabase.from('attendance')
    .select('mssv, full_name, status, category, note, created_at')
    .eq('session_id', currentSession.id);
  if (error){
    console.error('loadAttendance error:', error);
    toast('err', 'Lỗi tải điểm danh', error.message || 'Không thể tải dữ liệu điểm danh.');
    return;
  }
  let latestAuditMap = {};
  try {
    const { data: auditData } = await supabase.rpc('admin_get_audit_logs', { p_session_id: String(currentSession.id) });
    if (auditData && auditData.ok && auditData.logs) {
      // Sắp xếp tăng dần theo thời gian trước (nếu mssv xuất hiện nhiều lần, cái sau sẽ ghi đè cái trước)
      const logs = auditData.logs.sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));
      logs.forEach(l => {
        latestAuditMap[l.mssv] = l.changed_at;
      });
    }
  } catch(e) {
    console.warn('Cannot fetch audit logs for time display, falling back to created_at', e);
  }

  attendanceMap = {};
  (data || []).forEach(r => {
    let cleanNote = (r.note || '').trim();
    if (cleanNote === 'Không có dữ liệu tham gia' || cleanNote === 'Camera ESP32 điểm danh AI' || cleanNote.startsWith('Camera ESP32')) {
      cleanNote = '';
    }
    const cat = r.category === 'Khuôn mặt' ? 'Admin' : (r.category || '');
    // Hiển thị thời gian điểm danh thực tế (ưu tiên thời điểm đổi trạng thái gần nhất trong audit log)
    const effectiveTime = latestAuditMap[r.mssv] || r.created_at;
    attendanceMap[r.mssv] = {
      status: r.status,
      time: effectiveTime ? fmtClock(new Date(effectiveTime)) : '—',
      editedAt: latestAuditMap[r.mssv] || null,
      category: cat,
      note: cleanNote
    };
  });

  // Tự động đồng bộ các đơn xin nghỉ phép ĐÃ DUYỆT (approved) của ngày hôm nay vào phiên
  await syncApprovedLeavesToSession(false);

  // Load team members for group view (if teams exist)
  if (teamGroups.length) {
    loadTeamMembersForAttendance();
  }
}

function leaveCoversSession(leaveDate, leavePeriod, sessionStartedAt, sessionDurationMin, sessionName = '') {
  if (!leaveDate || !sessionStartedAt) return false;
  if (!leavePeriod || leavePeriod === 'full_day') return true;

  const startDt = new Date(sessionStartedAt);
  if (isNaN(startDt.getTime())) return false;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(startDt);

  const getPart = t => parts.find(p => p.type === t)?.value || '';
  const sessionDay = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  if (sessionDay !== leaveDate) return false;

  const nameLower = (sessionName || '').toLowerCase();
  const hasSang = nameLower.includes('sáng') || nameLower.includes('sang') || nameLower.includes('ca 1');
  const hasChieu = nameLower.includes('chiều') || nameLower.includes('chieu') || nameLower.includes('ca 2');
  const hasToi = nameLower.includes('tối') || nameLower.includes('toi') || nameLower.includes('ca 3');

  if (leavePeriod === 'morning' && hasSang && !hasChieu && !hasToi) return true;
  if (leavePeriod === 'afternoon' && hasChieu && !hasSang && !hasToi) return true;
  if (leavePeriod === 'evening' && hasToi && !hasSang && !hasChieu) return true;

  const [y, m, d] = leaveDate.split('-').map(Number);
  const periodHours = {
    morning: [0, 12],
    afternoon: [12, 17],
    evening: [17, 24]
  }[leavePeriod];

  if (!periodHours) return true;

  const periodStart = Date.UTC(y, m - 1, d, periodHours[0] - 7, 0, 0, 0);
  const periodEnd = Date.UTC(y, m - 1, d, periodHours[1] - 7, 0, 0, 0);

  const durMs = (sessionDurationMin || 240) * 60 * 1000;
  const sessionStartMs = startDt.getTime();
  const sessionEndMs = sessionStartMs + durMs;

  return sessionStartMs < periodEnd && sessionEndMs > periodStart;
}

async function syncApprovedLeavesToSession(isManual = false) {
  if (!currentSession || !currentSession.id) {
    if (isManual) toast('warn', 'Chưa có phiên', 'Không có phiên điểm danh nào đang mở.');
    return;
  }
  try {
    const sessionDate = currentSession.started_at ? new Date(currentSession.started_at).toLocaleDateString('sv-SE') : new Date().toLocaleDateString('sv-SE');
    const { data: approvedLeaves, error } = await supabase.from('leave_requests')
      .select('mssv, leave_date, leave_period, reason')
      .eq('status', 'approved')
      .eq('leave_date', sessionDate);

    if (error) throw error;
    if (!approvedLeaves || !approvedLeaves.length) {
      if (isManual) toast('ok', 'Đã kiểm tra', 'Hôm nay không có đơn xin nghỉ phép nào được duyệt.');
      return;
    }

    // 1. Phân loại đơn: bao phủ phiên này vs không bao phủ
    const coveringLeaves = approvedLeaves.filter(lv =>
      leaveCoversSession(lv.leave_date, lv.leave_period, currentSession.started_at, currentSession.duration_min, currentSession.session_name)
    );
    const nonCoveringLeaves = approvedLeaves.filter(lv =>
      !leaveCoversSession(lv.leave_date, lv.leave_period, currentSession.started_at, currentSession.duration_min, currentSession.session_name)
    );

    let changed = false;

    // 2. DỌN DẸP LỖI CŨ: Nếu sinh viên chỉ xin nghỉ ca khác (vd xin nghỉ sáng nhưng phiên đang mở là chiều/tối)
    // mà trước đó lỡ bị đồng bộ thành "vắng có phép" (do lỗi cũ tính cả ngày), thì huỷ bỏ trạng thái để họ điểm danh bình thường
    const wrongMssvs = nonCoveringLeaves
      .map(l => l.mssv)
      .filter(mssv => !coveringLeaves.some(c => c.mssv === mssv))
      .filter(mssv => {
        const cur = attendanceMap[mssv];
        if (!cur || cur.status !== 'vắng có phép') return false;
        if (cur.category === 'Học trường' || (cur.note || '').includes('Lịch học')) return false;
        return cur.category === 'Xin nghỉ' || (cur.note || '').includes('Nghỉ phép') || cur.time === 'Đã duyệt' || !cur.category;
      });

    if (wrongMssvs.length > 0) {
      const { error: delErr } = await supabase.from('attendance')
        .delete()
        .eq('session_id', currentSession.id)
        .in('mssv', wrongMssvs)
        .eq('status', 'vắng có phép');
      if (!delErr) {
        wrongMssvs.forEach(m => {
          delete attendanceMap[m];
        });
        changed = true;
      }
    }

    // 3. ĐỒNG BỘ: Chỉ đánh dấu "vắng có phép" cho sinh viên có đơn bao phủ đúng ca này
    const needSync = coveringLeaves.filter(lv => {
      const cur = attendanceMap[lv.mssv];
      return !cur || (cur.status !== 'có mặt' && cur.status !== 'đi muộn' && cur.status !== 'vắng có phép');
    });

    if (needSync.length > 0) {
      for (const lv of needSync) {
        const pLabel = adminLeavePeriodNames[lv.leave_period] || 'Cả ngày';
        const reasonText = lv.reason ? `Nghỉ phép (${pLabel}): ${lv.reason}` : `Nghỉ phép (${pLabel})`;
        const { error: rpcErr } = await supabase.rpc('admin_set_status', {
          p_session_id: String(currentSession.id),
          p_mssv: lv.mssv,
          p_status: 'vắng có phép',
          p_reason: reasonText
        });
        if (!rpcErr) {
          attendanceMap[lv.mssv] = {
            status: 'vắng có phép',
            time: 'Đã duyệt',
            editedAt: null,
            category: 'Xin nghỉ',
            note: reasonText
          };
          changed = true;
        }
      }
    }

    if (changed) {
      updateStats();
      renderTable();
    }

    if (isManual) {
      const count = coveringLeaves.length;
      const cleanCount = wrongMssvs.length;
      let msg = `Đã đồng bộ ${count} sinh viên có đơn nghỉ phép phù hợp ca này.`;
      if (cleanCount > 0) msg += ` Đã hoàn tác ${cleanCount} sinh viên chỉ nghỉ ca khác.`;
      toast('ok', 'Đồng bộ đơn nghỉ', msg);
    }
  } catch(e) {
    console.error('Lỗi đồng bộ đơn nghỉ:', e);
    if (isManual) toast('err', 'Lỗi đồng bộ đơn', e.message || 'Không thể đồng bộ đơn nghỉ.');
  }
}
function showEmpty(){
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-off';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đã đóng</span>';
  const navBadge = document.getElementById('navAttendanceBadge');
  if (navBadge) { navBadge.textContent = 'Đã đóng'; navBadge.style.background = 'rgba(0,0,0,0.06)'; navBadge.style.color = 'var(--muted)'; }
  
  const heroCard = document.getElementById('heroSessionCard');
  if (heroCard) {
    document.getElementById('heroSessionIcon').textContent = '⏹';
    document.getElementById('heroSessionTitle').textContent = 'Chưa có phiên điểm danh nào đang mở';
    document.getElementById('heroSessionSubtitle').textContent = 'Vào mục Điểm danh từ thanh menu để mở phiên và chiếu mã QR.';
    document.getElementById('heroSessionActions').innerHTML = '<button class="btn btn-primary" onclick="navTo(\'attendance\')">Tạo phiên điểm danh mới →</button>';
  }

  const btnBack = document.getElementById('btnBackToActive');
  if (btnBack) btnBack.style.display = 'none';
  clearInterval(countdownTimer);
  loadTodayHistory();
  loadTodaySchoolSchedule();
}
function showDashboard(){
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-on';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đang mở</span>';
  const navBadge = document.getElementById('navAttendanceBadge');
  if (navBadge) { navBadge.textContent = 'Đang mở'; navBadge.style.background = 'var(--ok-bg)'; navBadge.style.color = 'var(--ok)'; }

  const heroCard = document.getElementById('heroSessionCard');
  if (heroCard && currentSession) {
    document.getElementById('heroSessionIcon').textContent = '🟢';
    document.getElementById('heroSessionTitle').textContent = currentSession.session_name || 'Phiên điểm danh đang mở';
    document.getElementById('heroSessionSubtitle').textContent = 'Phiên đang hoạt động. Mã QR đang chiếu cho sinh viên.';
    document.getElementById('heroSessionActions').innerHTML = '<button class="btn btn-primary" onclick="navTo(\'attendance\')">Vào màn hình điểm danh →</button><button class="btn btn-danger" onclick="openCloseModal()">■ Đóng phiên</button>';
  }
  const createBox = document.getElementById('overviewSessionCreateBox');
  if (createBox) createBox.style.display = 'none';
}
function renderQR(){
  if (!currentSession || !currentSession.id || !currentSession.qr_token) return;
  const canvas = document.getElementById('qrCanvas');
  if (!canvas) return;
  canvas.innerHTML = '';
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  const url = base + '/checkin.html?s=' + encodeURIComponent(currentSession.id) + '&t=' + encodeURIComponent(currentSession.qr_token);
  if (typeof QRCode !== 'undefined') {
    new QRCode(canvas, { text: url, width: 360, height: 360, correctLevel: QRCode.CorrectLevel.M });
  }
  if (currentSession.qr_born_at) {
    document.getElementById('qrBorn').textContent = fmtClock(new Date(currentSession.qr_born_at));
  }
}
async function regenerateQR(){
  const btn = document.getElementById('btnRefreshQr');
  btn.disabled = true;
  const old = btn.innerHTML;
  btn.innerHTML = '⏳ Đang tạo...';
  try {
    let res = await supabase.rpc('admin_regenerate_qr');
    if (res.error && res.error.code === 'PGRST203' && currentSession?.id) {
      res = await supabase.rpc('admin_regenerate_qr', { p_session_id: String(currentSession.id) });
    }
    const { data, error } = res;
    if (error || !data?.ok) throw new Error(data?.message || error?.message);
    if (!currentSession) currentSession = {};
    currentSession.qr_token = data.qr_token;
    currentSession.qr_born_at = data.qr_born_at;
    renderQR();
    toast('ok', 'Đã đổi mã QR', 'Mã cũ không còn hiệu lực.');
  } catch(e){ toast('err', 'Đổi QR thất bại', e.message); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}
function toggleFullscreen(){
  const el = document.getElementById('qrPanel');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen().catch(() => toast('err', 'Không hỗ trợ', 'Trình duyệt chặn.'));
}
function updateStats(){
  const activeStudents = students.filter(s => s.is_active !== false);
  const total = activeStudents.length;
  let present = 0, late = 0, excused = 0, absent = 0;
  activeStudents.forEach(s => {
    const a = attendanceMap[s.mssv];
    if (a && a.status === 'có mặt') present++;
    else if (a && a.status === 'đi muộn') late++;
    else if (a && a.status === 'vắng có phép') excused++;
    else absent++; // Chưa điểm danh hoặc vắng không phép tính hết vào vắng k phép
  });
  const elTotal = document.getElementById('statTotal');
  if (elTotal) elTotal.textContent = total;
  const elPres = document.getElementById('statPresent');
  if (elPres) elPres.textContent = present;
  const lateEl = document.getElementById('statLate');
  if (lateEl) lateEl.textContent = late;
  const elAbs = document.getElementById('statAbsent');
  if (elAbs) elAbs.textContent = absent;
  const excEl = document.getElementById('statExcused');
  if (excEl) excEl.textContent = excused;

  const pct = total ? Math.round(((present + late) / total) * 100) : 0;
  const progressPct = document.getElementById('progressPct');
  if (progressPct) progressPct.textContent = pct + '%';
  const progressFill = document.getElementById('progressFill');
  if (progressFill) progressFill.style.width = pct + '%';

  const fAll = document.querySelector('.filter[data-status="all"] .count');
  if (fAll) fAll.textContent = total;
  const fPres = document.querySelector('.filter[data-status="present"] .count');
  if (fPres) fPres.textContent = present;
  const fLate = document.querySelector('.filter[data-status="late"] .count');
  if (fLate) fLate.textContent = late;
  const fAbs = document.querySelector('.filter[data-status="absent"] .count');
  if (fAbs) fAbs.textContent = absent;
  const fExc = document.querySelector('.filter[data-status="excused"] .count');
  if (fExc) fExc.textContent = excused;
  const fUnm = document.querySelector('.filter[data-status="unmarked"]');
  if (fUnm) fUnm.style.display = 'none';
}

function getStudentCleanNote(note) {
  if (!note) return '';
  let clean = String(note).trim();
  if (clean === 'Không có dữ liệu tham gia' || 
      clean === 'Camera ESP32 điểm danh AI' || 
      clean.startsWith('Camera ESP32') || 
      clean === 'Tích chọn' || 
      clean === 'Tích chọn thủ công' || 
      clean === 'Admin tích chọn' ||
      clean === 'Cập nhật hàng loạt') {
    return '';
  }
  return clean;
}

function getStudentScheduleCellHtml(mssv) {
  const info = window._todayStudentScheduleMap ? window._todayStudentScheduleMap[mssv] : null;
  if (!info) {
    return '<span style="font-size:11px;color:var(--muted)">⚪ Chưa có lịch</span>';
  }

  // Phân tích đơn xin nghỉ phép của sinh viên
  const leaves = info.leaves || [];
  let activeLeaveBadge = '';
  let inactiveLeaveBadge = '';

  if (leaves.length > 0) {
    const sDate = currentSession?.started_at ? new Date(currentSession.started_at).toLocaleDateString('sv-SE') : new Date().toLocaleDateString('sv-SE');
    const sStart = currentSession?.started_at || new Date().toISOString();
    const sDur = currentSession?.duration_min || 240;
    const sName = currentSession?.session_name || '';

    const covering = leaves.find(l => leaveCoversSession(sDate, l.period, sStart, sDur, sName));
    if (covering) {
      const pShort = covering.period === 'morning' ? 'Nghỉ sáng' : (covering.period === 'afternoon' ? 'Nghỉ chiều' : (covering.period === 'evening' ? 'Nghỉ tối' : 'Nghỉ cả ngày'));
      activeLeaveBadge = `<div style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;background:#e0e7ff;color:#4338ca;border:1px solid #c7d2fe" title="${escapeHtml(covering.fullText || info.leaveText)}">📝 ${escapeHtml(pShort)}</div>`;
    } else {
      // Đơn nghỉ thuộc buổi khác (vd: xin nghỉ sáng nhưng phiên hiện tại là chiều/tối)
      const otherLeave = leaves[0];
      const pShort = otherLeave.period === 'morning' ? 'Nghỉ sáng' : (otherLeave.period === 'afternoon' ? 'Nghỉ chiều' : (otherLeave.period === 'evening' ? 'Nghỉ tối' : 'Nghỉ phép'));
      inactiveLeaveBadge = `<div style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:1px 5px;border-radius:4px;background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1" title="${escapeHtml(otherLeave.fullText || info.leaveText)}">📝 ${escapeHtml(pShort)} (ca khác)</div>`;
    }
  }

  // Nếu có đơn nghỉ bao phủ đúng ca/phiên này, ưu tiên hiển thị badge đơn nghỉ
  if (activeLeaveBadge) {
    return activeLeaveBadge;
  }

  // Nếu không có đơn hoặc đơn thuộc ca khác, hiển thị lịch học trường kèm huy hiệu phụ (nếu có)
  let schedContent = '<span style="font-size:11px;color:var(--muted)">⚪ Chưa có lịch</span>';
  if (info.status === 'in_class') {
    const cur = info.currentClass;
    const title = cur ? `${cur.subject} - Phòng ${cur.room} (${cur.timeRange})` : 'Đang trong giờ học';
    const subText = cur ? `<div style="font-size:10.5px;color:#dc2626;font-weight:600;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(title)}">${escapeHtml(cur.subject)} (${escapeHtml(cur.room)})</div>` : '';
    schedContent = `<div><span class="sched-status-tag tag-busy-now" style="font-size:10px" title="${escapeHtml(title)}">🔴 Đang học</span>${subText}</div>`;
  } else if (info.status === 'upcoming_class') {
    const cur = info.upcomingClass || (info.classes && info.classes[0]);
    const title = cur ? `${cur.subject} - Phòng ${cur.room} (${cur.timeRange})` : 'Có ca học sắp tới';
    const subText = cur ? `<div style="font-size:10.5px;color:#d97706;font-weight:500;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(title)}">${escapeHtml(cur.subject)} (${escapeHtml(cur.timeRange)})</div>` : '';
    schedContent = `<div><span class="sched-status-tag tag-busy-future" style="font-size:10px" title="${escapeHtml(title)}">⏳ Sắp học</span>${subText}</div>`;
  } else if (info.status === 'finished_classes') {
    schedContent = `<span class="sched-status-tag tag-free-now" style="font-size:10px" title="Đã kết thúc các ca học hôm nay">🟢 Đã học xong (Rảnh)</span>`;
  } else if (info.status === 'free_all_day') {
    schedContent = `<span class="sched-status-tag tag-free-now" style="font-size:10px" title="Không có lịch học trường hôm nay">🟢 Rảnh cả ngày</span>`;
  }

  if (inactiveLeaveBadge) {
    return `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start">${inactiveLeaveBadge}${schedContent}</div>`;
  }
  return schedContent;
}

function renderAttendanceMethodBadge(a) {
  if (!a) return '';
  const rawStatus = a.status || 'unmarked';
  const cat = (a.category || '').trim();
  const note = (a.note || '').trim();
  let methodBadge = '';

  if (cat === 'Admin' || cat === 'Admin Batch' || note.includes('Admin') || note.includes('Tích chọn') || note.includes('Thủ công')) {
    methodBadge = '<span style="display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:#fef3c7;color:#b45309;border:1px solid #fde68a">✍️ Tích chọn</span>';
  } else if (rawStatus === 'có mặt' || rawStatus === 'đi muộn') {
    const catLabel = cat && cat !== 'Đi học' && cat !== 'Khuôn mặt' ? ` (${escapeHtml(cat)})` : '';
    methodBadge = '<span style="display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0">📱 Quét QR' + catLabel + '</span>';
  } else if (rawStatus === 'vắng có phép') {
    if (note.includes('Lịch học') || cat === 'Học trường') {
      methodBadge = '<span style="display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd">🏫 Học trường</span>';
    } else {
      methodBadge = '<span style="display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:#e0e7ff;color:#4338ca;border:1px solid #c7d2fe">📝 Đơn nghỉ</span>';
    }
  }

  return methodBadge ? '<div style="margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">' + methodBadge + '</div>' : '';
}

function renderTable(){
  const activeStudents = students.filter(s => s.is_active !== false);
  const list = activeStudents.filter(s => {
    const a = attendanceMap[s.mssv];
    const status = (a && a.status === 'có mặt') ? 'present' : ((a && a.status === 'đi muộn') ? 'late' : ((a && a.status === 'vắng có phép') ? 'excused' : 'absent'));
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
    tbody.innerHTML = '<tr><td colspan="6"><div class="tbl-empty"><div class="tbl-empty-icon">🔍</div><b>Không có sinh viên nào</b><span>Thử đổi bộ lọc hoặc từ khoá.</span></div></td></tr>';
  } else {
    tbody.innerHTML = page.map(s => {
      const a = attendanceMap[s.mssv];
      const resetRequest = window._pendingResetRequestsByMssv?.[s.mssv];
      const resetRequestLabel = resetRequest ? '<div style="margin-top:4px;font-size:10.5px;font-weight:700;color:#b45309">🔔 Có yêu cầu reset</div>' : '';
      const rawStatus = a?.status || 'unmarked';
      const selClass = rawStatus === 'có mặt' ? 'st-ok' : (rawStatus === 'đi muộn' ? 'st-late' : (rawStatus === 'vắng có phép' ? 'st-warn' : (rawStatus === 'unmarked' ? 'st-none' : 'st-no')));
      const methodRow = renderAttendanceMethodBadge(a);
      const schedColHtml = getStudentScheduleCellHtml(s.mssv);
      const cleanNote = getStudentCleanNote(a?.note);
      const noteHtml = cleanNote
        ? `<span style="font-size:11.5px;color:var(--text);font-weight:600;word-break:break-word" title="${escapeHtml(cleanNote)}">📝 ${escapeHtml(cleanNote)}</span>`
        : `<span style="font-size:11px;color:var(--muted);font-style:italic">—</span>`;

      return '<tr>' +
        '<td><div class="student-cell"><div class="avt">' + s.name.trim().slice(-1) + '</div><div><div class="td-name">' + escapeHtml(s.name) + '</div>' + methodRow + resetRequestLabel + '</div></div></td>' +
        '<td class="td-mono">' + escapeHtml(s.mssv) + resetRequestLabel + '</td>' +
        '<td><select class="status-select ' + selClass + '" onchange="promptChangeStatus(\'' + s.mssv + '\', this.value, this)">' +
          (rawStatus==='unmarked' ? '<option value="" selected disabled>— Chọn —</option>' : '') +
          '<option value="có mặt" ' + (rawStatus==='có mặt'?'selected':'') + '>Có mặt</option>' +
          '<option value="đi muộn" ' + (rawStatus==='đi muộn'?'selected':'') + '>Đi muộn</option>' +
          '<option value="vắng có phép" ' + (rawStatus==='vắng có phép'?'selected':'') + '>Vắng có phép</option>' +
          '<option value="vắng không phép" ' + (rawStatus==='vắng không phép'?'selected':'') + '>Vắng không phép</option>' +
        '</select></td>' +
        '<td class="td-mono">' + (a?.time || '—') + '</td>' +
        '<td>' + schedColHtml + '</td>' +
        '<td><div style="display:flex;align-items:center;justify-content:space-between;gap:6px">' +
          '<div style="flex:1;min-width:0">' + noteHtml + '</div>' +
          '<button class="btn btn-secondary btn-sm" style="padding:2px 6px;font-size:10.5px;flex:none;border-radius:4px" onclick="openEditNoteModal(\'' + s.mssv + '\', \'' + escapeHtml(s.name) + '\')" title="Chỉnh sửa ghi chú">✏️</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }
  const end = Math.min(start + pageSize, total);
  document.getElementById('pagerInfo').innerHTML = total === 0 ? 'Không có sinh viên nào'
    : 'Hiển thị <b>' + (start+1) + '–' + end + '</b> / <b>' + total + '</b>';
  document.getElementById('pagerNum').innerHTML = '<b>' + currentPage + '</b>/' + totalPages;
  document.getElementById('pagerPrev').disabled = currentPage <= 1;
  document.getElementById('pagerNext').disabled = currentPage >= totalPages;
}
function renderFeed(){
  const feed = document.getElementById('feedList');
  if (!feed) return;
  const recent = Object.entries(attendanceMap)
    .filter(([_, a]) => a.status === 'có mặt' || a.status === 'đi muộn')
    .sort((a, b) => (b[1].time || '').localeCompare(a[1].time || ''))
    .slice(0, 5);
  if (!recent.length){ feed.innerHTML = '<div class="feed-empty">Chưa có ai điểm danh</div>'; return; }
  feed.innerHTML = recent.map(([mssv, a]) => {
    const s = students.find(x => x.mssv === mssv);
    const name = s?.name || mssv;
    return '<div class="feed-item"><div class="feed-avt">' + name.trim().slice(-1) + '</div><div class="feed-name">' + escapeHtml(name) + '</div><div class="feed-time">' + (a.time || '—') + '</div></div>';
  }).join('');
}
async function openSession(){
  const name = document.getElementById('quickName').value.trim();
  const dur = parseInt(document.getElementById('quickDuration').value, 10) || 90;
  if (!name) return toast('err', 'Thiếu tên phiên', 'Vui lòng nhập tên phiên.');

  // Lấy ngưỡng đi muộn từ ô nhập người dùng (mặc định 15 phút nếu để trống)
  const lateInput = document.getElementById('quickLateThreshold');
  const lateMin = lateInput ? (parseInt(lateInput.value, 10) || 15) : 15;
  localStorage.setItem('admin_late_minutes', String(lateMin));

  const { data, error } = await supabase.rpc('admin_open_session', {
    p_name: name,
    p_duration_min: dur,
    p_warn_before_min: lateMin
  });
  if (error || !data?.ok) return toast('err', 'Không mở được phiên', data?.message || error?.message);
  toast('ok', 'Đã mở phiên', `"${name}" — ${dur} phút (Tính đi muộn sau ${lateMin} phút)`);
  await refreshAll();
}

// Chỉnh sửa trạng thái kèm Lý do & ghi Audit Log
let _pendingStatusChange = null;

let _currentResetRequestId = null;
window._pendingResetRequestsByMssv = window._pendingResetRequestsByMssv || {};

async function resetStudentPassword(mssv, requestId = null, studentName = null) {
  const label = studentName ? `${studentName} (${mssv})` : mssv;
  if (!confirm('Bạn có chắc muốn cấp mật khẩu tạm mới cho ' + label + ' không?')) return;
  
  toast('info', 'Đang xử lý', 'Vui lòng chờ...');
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    
    if (!token) {
      throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng tải lại trang.');
    }

    const { data, error } = await supabase.functions.invoke('admin-reset-password', {
      body: { target_mssv: mssv, request_id: requestId || null },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (error) {
      let extra = '';
      if (error.context && typeof error.context.text === 'function') {
        const bodyText = await error.context.text();
        extra = '\\n' + bodyText;
      }
      throw new Error(error.message + extra);
    }
    if (data?.error) throw new Error(data.error);
    
    document.getElementById('tempPwdText').innerText = data.tempPassword;
    document.getElementById('resetPwdModal').classList.add('show');
    
    const completeBtn = document.getElementById('btnCompleteReset');
    if (requestId && completeBtn) {
      _currentResetRequestId = requestId;
      completeBtn.style.display = 'inline-block';
      completeBtn.disabled = false;
      completeBtn.innerText = 'Đã gửi cho sinh viên';
    } else if (completeBtn) {
      completeBtn.style.display = 'none';
      _currentResetRequestId = null;
    }
    
    toast('ok', 'Thành công', 'Đã tạo mật khẩu tạm.');
    if (data.historySaved === false) toast('warn', 'Đã reset nhưng chưa ghi lịch sử', 'Vui lòng báo quản trị hệ thống kiểm tra bảng lịch sử reset.');
  } catch (err) {
    console.error('Edge Function Error:', err);
    toast('err', 'Lỗi reset mật khẩu', err.message);
  }
}

async function fetchResetRequests() {
  const { data, error } = await supabase
    .from('password_reset_requests')
    .select('id, mssv, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
    
  window._pendingResetRequestsByMssv = Object.fromEntries((!error && data ? data : []).map(req => [req.mssv, req]));
  const pendingCount = Object.keys(window._pendingResetRequestsByMssv).length;
  const menuBadge = document.getElementById('navPasswordResetBadge');
  if (menuBadge) { menuBadge.textContent = pendingCount; menuBadge.style.display = pendingCount ? 'inline-flex' : 'none'; }
  if (typeof renderTable === 'function' && document.getElementById('studentTbody')) renderTable();
  if (typeof renderPasswordResetStudents === 'function' && document.getElementById('passwordResetStudentRows')) renderPasswordResetStudents();
}

function resetRequestBadge(request) {
  return request ? '<div style="margin-top:4px;font-size:10.5px;font-weight:700;color:#b45309">🔔 Có yêu cầu reset</div>' : '';
}

function renderPasswordResetStudents() {
  const tbody = document.getElementById('passwordResetStudentRows');
  if (!tbody) return;
  const q = (document.getElementById('passwordResetSearch')?.value || '').trim().toLocaleLowerCase('vi');
  const filtered = students.filter(s => !q || String(s.mssv).toLocaleLowerCase('vi').includes(q) || String(s.name || '').toLocaleLowerCase('vi').includes(q));
  const count = document.getElementById('passwordResetStudentCount');
  if (count) count.textContent = `${filtered.length} / ${students.length} sinh viên`;
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="3"><div class="tbl-empty">Không tìm thấy sinh viên phù hợp.</div></td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(s => {
    const req = window._pendingResetRequestsByMssv?.[s.mssv];
    return `<tr><td><b>${escapeHtml(s.name || '')}</b>${resetRequestBadge(req)}</td><td class="td-mono">${escapeHtml(s.mssv)}${resetRequestBadge(req)}</td><td style="text-align:right"><button class="btn btn-primary" style="padding:6px 10px;font-size:12px" onclick="resetStudentPassword('${escapeHtml(s.mssv)}', ${req ? `'${req.id}'` : 'null'}, '${escapeHtml(s.name || s.mssv)}')">🔑 Reset Pass</button></td></tr>`;
  }).join('');
}

async function loadPasswordResetView() {
  if (!students.length) await loadStudents();
  renderPasswordResetStudents();
  await Promise.all([fetchResetRequests(), loadPasswordResetHistory()]);
}

async function loadPasswordResetHistory() {
  const tbody = document.getElementById('passwordResetHistoryRows');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4"><div class="tbl-empty">Đang tải lịch sử...</div></td></tr>';
  const { data, error } = await supabase.from('password_reset_history')
    .select('id, mssv, student_name, temp_password, reset_by_name, created_at')
    .order('created_at', { ascending: false }).limit(200);
  if (error) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="tbl-empty">Không tải được lịch sử: ${escapeHtml(error.message)}</div></td></tr>`;
    return;
  }
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="tbl-empty">Chưa có lịch sử reset.</div></td></tr>';
    return;
  }
  tbody.innerHTML = data.map(row => `<tr><td><b>${escapeHtml(row.student_name || '')}</b></td><td class="td-mono">${escapeHtml(row.mssv || '')}</td><td class="td-mono">${row.temp_password ? `<button class="btn btn-secondary" style="padding:4px 7px;font-family:monospace" onclick="navigator.clipboard.writeText('${escapeHtml(row.temp_password)}').then(()=>toast('ok','Đã copy','Mật khẩu đã được copy'))">${escapeHtml(row.temp_password)} · Copy</button>` : '—'}</td><td>${escapeHtml(row.reset_by_name || 'Admin')}</td><td>${new Date(row.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td></tr>`).join('');
}

async function clearPasswordResetHistory() {
  if (!confirm('Xóa toàn bộ lịch sử reset mật khẩu? Thao tác này không thể hoàn tác.')) return;
  const { data, error } = await supabase.rpc('admin_clear_password_reset_history');
  if (error || data?.ok === false) {
    toast('err', 'Không xóa được lịch sử', error?.message || data?.message || 'Vui lòng thử lại.');
    return;
  }
  toast('ok', 'Đã xóa lịch sử', 'Lịch sử reset mật khẩu đã được xóa.');
  await loadPasswordResetHistory();
}

async function completeResetRequest() {
  if (!_currentResetRequestId) return;
  const btn = document.getElementById('btnCompleteReset');
  if (btn) { btn.disabled = true; btn.innerText = 'Đang lưu...'; }
  
  const { data, error } = await supabase.rpc('admin_complete_reset_request', { p_request_id: _currentResetRequestId });
  if (error) {
    toast('err', 'Lỗi', error.message);
    if (btn) { btn.disabled = false; btn.innerText = 'Đã gửi cho sinh viên'; }
    return;
  }
  toast('ok', 'Đã xử lý', 'Đã đánh dấu yêu cầu là hoàn thành.');
  document.getElementById('resetPwdModal').classList.remove('show');
  _currentResetRequestId = null;
  fetchResetRequests();
}

function toggleReasonTimeInput(useRealTime) {
  const timeInput = document.getElementById('reasonTimeInput');
  if (timeInput) {
    timeInput.disabled = useRealTime;
    if (useRealTime) {
      const now = new Date();
      timeInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
  }
}

function promptChangeStatus(mssv, newStatus, selectEl, sessionId = null, currentOldStatus = null, customStudentName = null){
  const sid = sessionId || currentSession?.id;
  if (!sid) {
    toast('warn', 'Chưa có phiên', 'Không tìm thấy phiên điểm danh để cập nhật.');
    if (selectEl) {
      if (sessionId) viewPastSession(sessionId, true);
      else renderTable();
    }
    return;
  }
  const s = students.find(x => x.mssv === mssv);
  const studentName = customStudentName || s?.name || mssv;
  const oldStatus = currentOldStatus || attendanceMap[mssv]?.status || 'chưa điểm danh';
  _pendingStatusChange = { mssv, newStatus, oldStatus, studentName, selectEl, sessionId: sid };

  const modal = document.getElementById('reasonModal');
  const infoEl = document.getElementById('reasonStudentInfo');
  const selEl = document.getElementById('reasonModalSelect');
  const input = document.getElementById('reasonInput');
  const timeInput = document.getElementById('reasonTimeInput');
  const useRealTimeCb = document.getElementById('reasonUseRealTime');

  if (infoEl) infoEl.innerHTML = '<b>' + escapeHtml(studentName) + '</b> (MSSV: ' + escapeHtml(mssv) + ')';
  if (selEl && newStatus) selEl.value = newStatus;
  if (input) input.value = '';

  if (useRealTimeCb) useRealTimeCb.checked = true;
  if (timeInput) {
    const now = new Date();
    timeInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    timeInput.disabled = true;
  }

  if (modal) modal.classList.add('show');
  if (input) setTimeout(() => input.focus(), 100);
}
function closeReasonModal(){
  const modal = document.getElementById('reasonModal');
  if (modal) modal.classList.remove('show');
  if (_pendingStatusChange?.selectEl) {
    if (_pendingStatusChange.sessionId && (!currentSession?.id || String(_pendingStatusChange.sessionId) !== String(currentSession.id))) {
      viewPastSession(_pendingStatusChange.sessionId, true);
    } else {
      renderTable(); // reset select về giá trị cũ
    }
  }
  _pendingStatusChange = null;
}
async function executeStatusChange(){
  if (!_pendingStatusChange) return;
  const sid = _pendingStatusChange.sessionId || currentSession?.id;
  if (!sid) return;
  const { mssv, studentName, oldStatus } = _pendingStatusChange;
  const newStatus = document.getElementById('reasonModalSelect')?.value || _pendingStatusChange.newStatus;
  const reason = (document.getElementById('reasonInput')?.value || '').trim();

  const now = new Date();
  const useRealTime = document.getElementById('reasonUseRealTime')?.checked ?? true;
  let targetTime = now;
  if (!useRealTime) {
    const customVal = document.getElementById('reasonTimeInput')?.value;
    if (customVal) {
      const parsed = new Date(customVal);
      if (!isNaN(parsed.getTime())) targetTime = parsed;
    }
  }

  // Bỏ qua nếu chọn lại đúng trạng thái cũ và không có lý do mới và dùng giờ cũ
  if (oldStatus && oldStatus.trim() === (newStatus || '').trim() && !reason && useRealTime) {
    toast('info', 'Không có thay đổi', studentName + ' đã ở trạng thái "' + newStatus + '".');
    const modal = document.getElementById('reasonModal');
    if (modal) modal.classList.remove('show');
    _pendingStatusChange = null;
    return;
  }

  const btn = document.getElementById('reasonConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang lưu...'; }

  let savedOk = false;
  let saveErrorMsg = '';

  // 1. Thử gọi RPC admin_set_status trên DB (xử lý đồng thời attendance & audit log)
  try {
    const { data, error } = await supabase.rpc('admin_set_status', {
      p_session_id: String(sid),
      p_mssv: mssv,
      p_status: newStatus,
      p_reason: reason || null
    });
    if (!error && data?.ok) {
      savedOk = true;
    } else {
      saveErrorMsg = data?.message || error?.message || '';
    }
  } catch(eRpc) {
    saveErrorMsg = eRpc.message;
  }

  // 2. Luôn cập nhật created_at theo thời gian thực (hoặc giờ tùy chỉnh) cho cả phiên hiện tại lẫn phiên cũ
  try {
    const updatePayload = {
      status: newStatus,
      category: 'Admin',
      note: reason || '',
      created_at: targetTime.toISOString()
    };
    const { error: upErr } = await supabase.from('attendance')
      .update(updatePayload)
      .eq('session_id', sid)
      .eq('mssv', mssv);
    if (!upErr) savedOk = true;
  } catch(errUp) {
    console.warn('Lỗi update attendance timestamp:', errUp);
  }

  if (!savedOk) {
    toast('err', 'Cập nhật thất bại', saveErrorMsg || 'Không thể lưu thay đổi.');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Lưu thay đổi'; }
    return;
  }

  // 3. Hoàn tất thành công: cập nhật UI ngay lập tức
  toast('ok', 'Đã cập nhật', studentName + ' → ' + newStatus);
  const modal = document.getElementById('reasonModal');
  if (modal) modal.classList.remove('show');

  const isCurrentActive = currentSession?.id && String(sid) === String(currentSession.id);
  if (isCurrentActive) {
    if (!attendanceMap[mssv]) attendanceMap[mssv] = {};
    attendanceMap[mssv].status = newStatus;
    attendanceMap[mssv].time = fmtClock(targetTime);
    attendanceMap[mssv].created_at = targetTime.toISOString();
    attendanceMap[mssv].editedAt = targetTime.toISOString();
    attendanceMap[mssv].category = 'Admin';
    attendanceMap[mssv].note = reason || '';

    renderAll();
    await loadAttendance();
    renderAll();
  }

  // Cập nhật lại danh sách lịch sử hôm nay (để update các số liệu KPI/thẻ phiên)
  await loadTodayHistory();
  // Đồng thời làm mới bảng chi tiết của phiên này nếu đang mở
  await viewPastSession(sid, true);

  _pendingStatusChange = null;

  const tabAudit = document.getElementById('tabAuditLog');
  if (tabAudit && tabAudit.classList.contains('active')) {
    loadAuditLogs();
  }

  if (btn) { btn.disabled = false; btn.innerHTML = 'Lưu thay đổi'; }
}
window.executeStatusChange = executeStatusChange;
window.confirmStatusChange = executeStatusChange;

document.getElementById('reasonConfirmBtn')?.addEventListener('click', executeStatusChange);
document.getElementById('reasonInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') executeStatusChange();
});

// XỬ LÝ CHỈNH SỬA GHI CHÚ RIÊNG BIỆT (CHỈ CỘT GHI CHÚ MỚI ĐƯỢC PHÉP CHỈNH SỬA)
let _pendingNoteEdit = null;
function openEditNoteModal(mssv, customStudentName = null) {
  const sid = currentSession?.id;
  if (!sid) {
    toast('warn', 'Chưa có phiên', 'Không có phiên điểm danh nào để cập nhật ghi chú.');
    return;
  }
  const s = (students || []).find(x => x.mssv === mssv);
  const studentName = customStudentName || s?.name || mssv;
  const currentNote = getStudentCleanNote(attendanceMap[mssv]?.note);
  _pendingNoteEdit = { mssv, studentName, sessionId: sid };

  const modal = document.getElementById('noteEditModal');
  const infoEl = document.getElementById('noteEditStudentInfo');
  const input = document.getElementById('noteEditInput');
  if (infoEl) infoEl.innerHTML = '<b>' + escapeHtml(studentName) + '</b> (MSSV: ' + escapeHtml(mssv) + ')';
  if (input) input.value = currentNote;
  if (modal) modal.classList.add('show');
  if (input) setTimeout(() => input.focus(), 100);
}
window.openEditNoteModal = openEditNoteModal;

function closeNoteEditModal() {
  const modal = document.getElementById('noteEditModal');
  if (modal) modal.classList.remove('show');
  _pendingNoteEdit = null;
}
window.closeNoteEditModal = closeNoteEditModal;

async function saveStudentNote() {
  if (!_pendingNoteEdit) return;
  const { mssv, studentName, sessionId } = _pendingNoteEdit;
  const input = document.getElementById('noteEditInput');
  const newNote = (input?.value || '').trim();
  const btn = document.getElementById('noteEditConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang lưu...'; }

  try {
    const { error } = await supabase.from('attendance')
      .update({ note: newNote })
      .eq('session_id', sessionId)
      .eq('mssv', mssv);
    if (error) throw error;

    if (attendanceMap[mssv]) {
      attendanceMap[mssv].note = newNote;
    }
    renderTable();
    toast('ok', 'Đã lưu ghi chú', `Cập nhật ghi chú cho ${studentName}`);
    closeNoteEditModal();
  } catch (err) {
    console.error('saveStudentNote error:', err);
    toast('err', 'Không lưu được ghi chú', err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Lưu ghi chú'; }
  }
}
window.saveStudentNote = saveStudentNote;

// Chuyển Tabs trong Phiên
function switchSessionTab(tabName){
  const tabStudents = document.getElementById('tabBtnStudents');
  const tabGroups = document.getElementById('tabBtnGroups');
  const tabAudit = document.getElementById('tabBtnAudit');
  const panelStudents = document.getElementById('studentsTabPanel');
  const panelGroups = document.getElementById('groupsTabPanel');
  const panelAudit = document.getElementById('auditLogPanel');
  if (!tabStudents || !tabAudit || !tabGroups) return;
  
  // Reset all tabs
  tabStudents.classList.remove('active');
  tabGroups.classList.remove('active');
  tabAudit.classList.remove('active');
  if (panelStudents) panelStudents.style.display = 'none';
  if (panelGroups) panelGroups.style.display = 'none';
  if (panelAudit) panelAudit.style.display = 'none';
  
  if (tabName === 'audit') {
    tabAudit.classList.add('active');
    if (panelAudit) panelAudit.style.display = 'block';
    loadAuditLogs();
  } else if (tabName === 'groups') {
    tabGroups.classList.add('active');
    if (panelGroups) panelGroups.style.display = 'block';
    loadTeamMembersForAttendance();
  } else {
    tabStudents.classList.add('active');
    if (panelStudents) panelStudents.style.display = 'block';
  }
}
async function loadAuditLogs(){
  const listEl = document.getElementById('auditLogList');
  const badgeEl = document.getElementById('auditLogCountBadge');
  if (!listEl || !currentSession?.id) return;
  listEl.innerHTML = '<div style="padding:28px 16px;text-align:center;color:var(--muted);font-size:13px"><span class="spin"></span> Đang tải lịch sử thay đổi...</div>';
  try {
    const { data, error } = await supabase.rpc('admin_get_audit_logs', { p_session_id: String(currentSession.id) });
    if (error || !data?.ok){
      listEl.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--err);font-size:13px">Lỗi tải Audit Log: ' + escapeHtml(error?.message || data?.message || 'Không thể tải') + '</div>';
      return;
    }
    const allLogs = data.logs || [];
    // LỌC BỎ CÁC RECORD TRÙNG LẶP / VÔ NGHĨA (cùng trạng thái & không ghi lý do)
    const logs = allLogs.filter(l => (l.old_status || '').trim() !== (l.new_status || '').trim() || (l.reason && l.reason.trim()));
    if (badgeEl) badgeEl.textContent = logs.length;

    const statusPill = st => {
      const s = (st || '').trim().toLowerCase();
      if (s === 'có mặt') return '<span class="audit-st-pill ok">Có mặt</span>';
      if (s === 'đi muộn') return '<span class="audit-st-pill late">Đi muộn</span>';
      if (s === 'vắng có phép') return '<span class="audit-st-pill excused">Có phép</span>';
      if (s === 'vắng không phép') return '<span class="audit-st-pill unexcused">Không phép</span>';
      return `<span class="audit-st-pill none">${escapeHtml(st || 'Chưa ĐD')}</span>`;
    };

    const statusHtml = logs.length ? logs.map(l => {
      const d = new Date(l.changed_at);
      const t = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const rawUser = (l.changed_by || 'Admin').split('@')[0];
      const user = escapeHtml(rawUser);
      const sName = escapeHtml(l.student_name || l.mssv);
      const oldPill = statusPill(l.old_status || 'chưa điểm danh');
      const newPill = statusPill(l.new_status);
      const reason = l.reason ? `<div class="audit-reason-quote">💬 "${escapeHtml(l.reason)}"</div>` : '';

      return `
        <div class="audit-row">
          <div class="audit-row-main">
            <span class="audit-time-tag">⏱ ${t}</span>
            <span class="audit-user-tag">👤 ${user}</span>
            <strong class="audit-student-name">${sName}</strong>
            <span class="audit-mssv-sub">(${escapeHtml(l.mssv)})</span>
            <span class="audit-flow">${oldPill} <span class="audit-arrow">➔</span> ${newPill}</span>
          </div>
          ${reason}
        </div>`;
    }).join('') : '<div style="padding:18px 4px;color:var(--muted);font-size:12px;text-align:center">Chưa có thay đổi trạng thái nào trong phiên này.</div>';

    let recordHtml = '';
    try {
      const { data: historyData, error: historyError } = await supabase.rpc('admin_get_attendance_record_history', { p_session_id: String(currentSession.id) });
      if (!historyError && historyData?.ok && historyData.records?.length) {
        const records = historyData.records;
        const time = value => value ? new Date(value).toLocaleString('vi-VN') : '—';
        const details = (label, value) => '<div style="font-size:11.5px;color:var(--muted);margin-top:3px">' + label + ': <b>' + escapeHtml(value || '—') + '</b></div>';

        const rows = records.map(h => {
          const old = h.old_record || {}, next = h.new_record || {};
          return `
            <div style="padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <strong style="font-size:12.5px">${escapeHtml(h.student_name || h.mssv)} (${escapeHtml(h.mssv)})</strong>
                <span style="font-size:11px;color:var(--muted)">⏱ ${time(h.changed_at)} · 👤 ${escapeHtml((h.changed_by || 'Admin').split('@')[0])}</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div style="padding:6px 8px;background:var(--surface-2);border-radius:6px;font-size:11.5px">
                  <div style="font-weight:700;color:var(--muted);margin-bottom:2px">Trước khi sửa</div>
                  ${details('Trạng thái', old.status)}
                  ${details('Giờ ĐD', time(old.checked_at))}
                  ${details('Ghi chú', old.note)}
                </div>
                <div style="padding:6px 8px;background:var(--surface-2);border-radius:6px;font-size:11.5px">
                  <div style="font-weight:700;color:var(--ok);margin-bottom:2px">Sau khi sửa</div>
                  ${details('Trạng thái', next.status)}
                  ${details('Giờ ĐD', time(next.checked_at))}
                  ${details('Ghi chú', next.note)}
                </div>
              </div>
            </div>`;
        }).join('');

        recordHtml = `
          <details class="audit-tech-details">
            <summary>🔍 Lịch sử bản ghi đối chiếu (giờ cũ / mới) — ${records.length} lần sửa</summary>
            <div class="audit-tech-content">${rows}</div>
          </details>`;
      }
    } catch (_) { /* schema migration fallback */ }

    listEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h3 style="font-size:13px;font-weight:700;margin:0">Dòng thời gian thay đổi trạng thái</h3>
        <span style="font-size:11.5px;color:var(--muted)">${logs.length} thao tác thực tế</span>
      </div>
      <div class="audit-timeline">${statusHtml}</div>
      ${recordHtml}`;
  } catch(e){
    listEl.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--err);font-size:13px">Lỗi kết nối: ' + escapeHtml(e.message) + '</div>';
  }
}

let teamGroups = [];
let selectedTeamId = '';
let teamAvailabilityTimer = null;
const TEAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
function vietnamToday(){
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
}
function vietnamDayBounds(day = vietnamToday()){
  const [y,m,d] = day.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, d, -7)).toISOString(), end: new Date(Date.UTC(y, m - 1, d + 1, -7)).toISOString() };
}
function vietnamTime(value){
  return new Date(value).toLocaleTimeString('vi-VN', { timeZone: TEAM_TIME_ZONE, hour:'2-digit', minute:'2-digit' });
}
function vietnamDateTime(value){
  return new Date(value).toLocaleString('vi-VN', { timeZone: TEAM_TIME_ZONE, hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });
}
function teamStudentOptions(selected = '', includeEmpty = false){
  return (includeEmpty ? '<option value="">Chọn đội trưởng</option>' : '') + students.map(s =>
    '<option value="' + escapeHtml(s.mssv) + '" ' + (s.mssv === selected ? 'selected' : '') + '>' + escapeHtml(s.name) + ' · ' + escapeHtml(s.mssv) + '</option>'
  ).join('');
}
async function loadTeamGroups(){
  const { data, error } = await supabase.from('team_groups').select('id,name,field,leader_mssv,created_at').order('created_at', { ascending: true });
  if (error) { toast('err', 'Không tải được nhóm', error.message); return; }
  teamGroups = data || [];
  const list = document.getElementById('teamGroupsList');
  document.getElementById('newTeamLeader').innerHTML = teamStudentOptions('', true);
  document.getElementById('editTeamLeader').innerHTML = teamStudentOptions('', true);
  document.getElementById('teamMemberPicker').innerHTML = teamStudentOptions();
  if (!teamGroups.length) {
    selectedTeamId = '';
    list.innerHTML = '<div class="schedule-loading">Chưa có nhóm. Bấm “Tạo nhóm” để bắt đầu.</div>';
    return;
  }

  const { data: memberships, error: membersError } = await supabase.from('team_group_members').select('team_id,mssv');
  if (membersError) { list.innerHTML = '<div class="schedule-loading">' + escapeHtml(membersError.message) + '</div>'; return; }
  const allMemberIds = [...new Set((memberships || []).map(m => m.mssv))];
  const bounds = vietnamDayBounds();
  let schedules = [];
  if (allMemberIds.length) {
    const result = await supabase.from('student_schedules').select('mssv,start_time,end_time')
      .in('mssv', allMemberIds).lt('start_time', bounds.end).gt('end_time', bounds.start);
    if (!result.error) schedules = result.data || [];
  }
  const membersByTeam = new Map(teamGroups.map(t => [t.id, []]));
  (memberships || []).forEach(m => membersByTeam.get(m.team_id)?.push(m.mssv));
  const now = Date.now();
  const names = Object.fromEntries(students.map(s => [s.mssv, s.name]));
  list.innerHTML = teamGroups.map(team => {
    const ids = membersByTeam.get(team.id) || [];
    const busy = new Set(schedules.filter(s => ids.includes(s.mssv) && new Date(s.start_time).getTime() <= now && new Date(s.end_time).getTime() > now).map(s => s.mssv));
    const leader = names[team.leader_mssv] || 'Chưa chọn đội trưởng';
    const fieldText = team.field && team.field !== team.name ? escapeHtml(team.field) + ' · ' : '';
    return '<button class="team-accordion" onclick="openTeamGroup(\'' + team.id + '\')" aria-label="Mở nhóm ' + escapeHtml(team.name) + '">' +
      '<span class="team-accordion-main"><span class="team-accordion-name">' + escapeHtml(team.name) + '</span><span class="team-accordion-meta">' + fieldText + 'Đội trưởng: ' + escapeHtml(leader) + ' · ' + ids.length + ' thành viên</span></span>' +
      '<span class="team-accordion-counts"><span class="team-count-pill free">' + (ids.length - busy.size) + ' rảnh</span><span class="team-count-pill busy">' + busy.size + ' bận</span><span aria-hidden="true">›</span></span></button>';
  }).join('');
  if (selectedTeamId && document.getElementById('teamModal').classList.contains('show')) await loadTeamAvailability();
  if (typeof refreshStudentTeamsData === 'function') {
    refreshStudentTeamsData().then(() => {
      if (typeof renderStudentsTable === 'function' && currentView === 'students') renderStudentsTable();
    });
  }
}
function openCreateTeamModal(){
  document.getElementById('newTeamName').value = '';
  document.getElementById('teamCreateModal').classList.add('show');
}
function closeTeamCreateModal(){ document.getElementById('teamCreateModal').classList.remove('show'); }
function closeTeamModal(){ document.getElementById('teamModal').classList.remove('show'); selectedTeamId = ''; }
async function openTeamGroup(id){
  selectedTeamId = id;
  const team = teamGroups.find(t => t.id === id);
  if (!team) return;
  document.getElementById('teamModalTitle').textContent = team.name;
  document.getElementById('editTeamName').value = team.name;
  document.getElementById('editTeamLeader').value = team.leader_mssv || '';
  document.getElementById('teamModal').classList.add('show');
  await loadTeamAvailability();
}
async function createTeamGroup(){
  const name = document.getElementById('newTeamName').value.trim();
  const leader = document.getElementById('newTeamLeader').value;
  if (!name || !leader) return toast('warn', 'Thiếu thông tin', 'Nhập tên nhóm và chọn đội trưởng.');
  const { data: authData } = await supabase.auth.getSession();
  const { data, error } = await supabase.from('team_groups').insert({ name, field: name, leader_mssv: leader, created_by: authData?.session?.user?.id }).select('id').single();
  if (error) return toast('err', 'Tạo nhóm thất bại', error.message);
  document.getElementById('newTeamName').value = '';
  selectedTeamId = data.id;
  closeTeamCreateModal();
  toast('ok', 'Đã tạo nhóm', name);
  await loadTeamGroups();
  await openTeamGroup(data.id);
}
async function saveTeamGroup(){
  const name = document.getElementById('editTeamName').value.trim();
  const leader = document.getElementById('editTeamLeader').value || null;
  const { error } = await supabase.from('team_groups').update({ name, leader_mssv: leader }).eq('id', selectedTeamId);
  if (error) return toast('err', 'Không lưu được nhóm', error.message);
  toast('ok', 'Đã lưu nhóm'); await loadTeamGroups();
  const team = teamGroups.find(t => t.id === selectedTeamId);
  if (team) document.getElementById('teamModalTitle').textContent = team.name;
}
async function deleteTeamGroup(){
  const team = teamGroups.find(t => t.id === selectedTeamId);
  if (!team || !confirm('Xóa nhóm “' + team.name + '” cùng danh sách thành viên?')) return;
  const { error } = await supabase.from('team_groups').delete().eq('id', selectedTeamId);
  if (error) return toast('err', 'Xóa nhóm thất bại', error.message);
  closeTeamModal(); toast('ok', 'Đã xóa nhóm', team.name); await loadTeamGroups();
}
async function addTeamMember(){
  const mssv = document.getElementById('teamMemberPicker').value;
  if (!selectedTeamId || !mssv) return toast('warn', 'Chọn thành viên', 'Vui lòng chọn một thành viên để thêm.');
  const { error } = await supabase.from('team_group_members').insert({ team_id: selectedTeamId, mssv });
  if (error) {
    if (error.code === '23505') {
      return toast('info', 'Thành viên đã có trong nhóm', 'Thành viên này đã được thêm vào nhóm rồi.');
    }
    return toast('err', 'Không thêm được thành viên', error.message);
  }
  await loadTeamGroups();
}
async function removeTeamMember(mssv){
  if (!confirm('Xóa thành viên này khỏi nhóm?')) return;
  const { error } = await supabase.from('team_group_members').delete().eq('team_id', selectedTeamId).eq('mssv', mssv);
  if (error) return toast('err', 'Không xóa được thành viên', error.message);
  await loadTeamGroups();
}
async function loadTeamAvailability(){
  const list = document.getElementById('teamMemberList');
  const team = teamGroups.find(t => t.id === selectedTeamId);
  if (!team) return;
  list.innerHTML = '<div class="schedule-loading">Đang tải thành viên và lịch...</div>';
  const { data: memberships, error } = await supabase.from('team_group_members').select('mssv').eq('team_id', team.id).order('added_at');
  if (error) { list.innerHTML = '<div class="schedule-loading">' + escapeHtml(error.message) + '</div>'; return; }
  const memberIds = (memberships || []).map(m => m.mssv);
  document.getElementById('teamMemberCount').textContent = memberIds.length + ' thành viên';
  document.getElementById('teamNowLabel').textContent = 'Bây giờ: ' + vietnamTime(new Date()) + ' · Giờ Việt Nam · tự cập nhật mỗi phút';
  if (!memberIds.length) { list.innerHTML = '<div class="schedule-loading">Nhóm chưa có thành viên.</div>'; return; }
  const bounds = vietnamDayBounds();
  const { data: schedules, error: scheduleError } = await supabase.from('student_schedules')
    .select('mssv,subject_name,room_name,start_time,end_time').in('mssv', memberIds).lt('start_time', bounds.end).gt('end_time', bounds.start).order('start_time');
  if (scheduleError) { list.innerHTML = '<div class="schedule-loading">Không tải được lịch học: ' + escapeHtml(scheduleError.message) + '</div>'; return; }
  const {data:knownTeamSchedules}=await supabase.from('student_schedules').select('mssv').in('mssv',memberIds);
  const membersWithCalendar=new Set((knownTeamSchedules||[]).map(r=>r.mssv));
  const {data:approvedLeaves}=await supabase.from('leave_requests')
    .select('mssv,leave_date,leave_period,reason')
    .eq('status','approved').in('mssv',memberIds);
  const leaveByMember=new Map(memberIds.map(id=>[id,[]]));
  (approvedLeaves||[]).forEach(r=>{
    const today=new Date(bounds.start).toLocaleDateString('sv-SE');
    if(r.leave_date===today)leaveByMember.get(r.mssv)?.push({period:adminLeavePeriodNames[r.leave_period]||'Cả ngày',reason:r.reason});
  });
  const byMember = new Map(memberIds.map(id => [id, []]));
  (schedules || []).forEach(s => byMember.get(s.mssv)?.push(s));
  const now = Date.now();
  list.innerHTML = memberIds.map(mssv => {
    const member = students.find(s => s.mssv === mssv);
    const allClasses = byMember.get(mssv) || [];
    const activeClass = allClasses.find(sc => new Date(sc.start_time).getTime() <= now && new Date(sc.end_time).getTime() > now);
    const upcoming = allClasses.filter(sc => new Date(sc.start_time).getTime() > now);
    const visibleClasses = [...(activeClass ? [activeClass] : []), ...upcoming];
    const hasCalendar=membersWithCalendar.has(mssv);
    const isLeader = team.leader_mssv === mssv;
    const scheduleHtml = visibleClasses.length ? visibleClasses.map(sc => {
      const active = sc === activeClass;
      return '<div class="team-class ' + (active ? '' : 'team-schedule-future') + '">' + (active ? '🔴 Đang học · ' : '📅 Sắp tới · ') + escapeHtml(sc.subject_name || 'Có lịch học') + ' · ' + vietnamTime(sc.start_time) + '–' + vietnamTime(sc.end_time) + (sc.room_name ? ' · ' + escapeHtml(sc.room_name) : '') + '</div>';
    }).join('') : '<div class="team-class">'+(hasCalendar?'Hôm nay không có tiết học.':'⚪ Chưa có dữ liệu lịch; vẫn xem xét đơn xin nghỉ.')+'</div>';
    const leaveHtml=(leaveByMember.get(mssv)||[]).map(r=>'<div class="team-class" style="background:#eaf7ef;color:#176b43">✅ Đã duyệt nghỉ · '+escapeHtml(r.period)+' · '+escapeHtml(r.reason)+'</div>').join('');
    const state = !hasCalendar?'<span class="team-availability" style="color:var(--muted)">⚪ Chưa có dữ liệu</span>':activeClass ? '<span class="team-availability busy">🔴 Đang bận</span>' : '<span class="team-availability free">🟢 Đang rảnh</span>';
    return '<div class="team-member"><div class="team-member-top"><span class="team-member-name">' + escapeHtml(member?.name || mssv) + (isLeader ? ' · 👑 Đội trưởng' : '') + ' <span style="font-weight:500;color:var(--muted)">' + escapeHtml(mssv) + '</span></span><span style="display:flex;align-items:center;gap:8px">' + state + '<button class="btn btn-danger" style="padding:4px 8px;font-size:10.5px" onclick="removeTeamMember(\'' + escapeHtml(mssv) + '\')">Xóa</button></span></div>' + scheduleHtml + leaveHtml + '</div>';
  }).join('');
}

// Mở lại phiên đã đóng (closed -> active)
function openReopenModal(){
  const modal = document.getElementById('reopenModal');
  if (modal) modal.classList.add('show');
}
function closeReopenModal(){
  const modal = document.getElementById('reopenModal');
  if (modal) modal.classList.remove('show');
}
async function executeReopenSession(){
  if (!currentSession?.id) return;
  const btn = document.getElementById('reopenConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang mở lại...'; }
  try {
    const { data, error } = await supabase.rpc('admin_reopen_session', { p_session_id: String(currentSession.id) });
    if (error || !data?.ok) throw new Error(data?.message || error?.message || 'Không thể mở lại phiên');
    closeReopenModal();
    toast('ok', 'Đã mở lại phiên', 'Phiên điểm danh hiện đã hoạt động trở lại.');
    await refreshAll();
    await loadTodayHistory();
  } catch(e){
    toast('err', 'Mở lại thất bại', e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Xác nhận mở lại'; }
  }
}

let _bulkCb = null;
function showBulkModal(title, text, cb){
  document.getElementById('bulkTitle').textContent = title;
  document.getElementById('bulkText').innerHTML = text;
  _bulkCb = cb;
  document.getElementById('bulkModal').classList.add('show');
}
function closeBulkModal(){ document.getElementById('bulkModal').classList.remove('show'); _bulkCb = null; }
document.getElementById('bulkConfirmBtn').addEventListener('click', () => { if (_bulkCb) _bulkCb(); closeBulkModal(); });
function confirmMarkAllAbsent(){
  const list = students.filter(s => !attendanceMap[s.mssv]);
  if (!list.length) return toast('info', 'Không có SV nào chưa quét');
  showBulkModal('Đánh dấu vắng?', 'Sẽ đánh dấu <b>' + list.length + ' sinh viên</b> thành "Vắng không phép".', async () => {
    const { data, error } = await supabase.rpc('admin_batch_set_status', {
      p_session_id: String(currentSession.id), p_mssv_list: list.map(s => s.mssv), p_status: 'vắng không phép', p_reason: 'Admin đánh dấu vắng tất cả chưa quét'
    });
    if (error || !data?.ok) return toast('err', 'Lỗi', data?.message || error?.message);
    toast('ok', 'Đã cập nhật', data.count + ' sinh viên → Vắng');
    await loadAttendance(); renderAll();
  });
}
function confirmMarkAllPresent(){
  showBulkModal('Đánh dấu có mặt tất cả?', 'Sẽ đánh dấu <b>TẤT CẢ ' + students.length + ' sinh viên</b> thành "Có mặt".', async () => {
    const { data, error } = await supabase.rpc('admin_batch_set_status', {
      p_session_id: String(currentSession.id), p_mssv_list: students.map(s => s.mssv), p_status: 'có mặt', p_reason: 'Admin đánh dấu có mặt cả lớp'
    });
    if (error || !data?.ok) return toast('err', 'Lỗi', data?.message || error?.message);
    toast('ok', 'Đã cập nhật', data.count + ' sinh viên → Có mặt');
    await loadAttendance(); renderAll();
  });
}

function copyAttendanceList() {
  if (!currentSession) return toast('warn', 'Chưa có phiên', 'Không có phiên điểm danh nào đang hoạt động.');
  let text = `Danh sách điểm danh: ${currentSession.session_name}\n`;
  text += `Ngày: ${new Date().toLocaleDateString('vi-VN')}\n\n`;
  
  let i = 1;
  students.forEach(s => {
    const a = attendanceMap[s.mssv];
    const status = a ? a.status : 'Chưa quét';
    const note = a && a.note ? ` (${a.note})` : '';
    text += `${i++}. ${s.name} - ${s.mssv} - ${status}${note}\n`;
  });
  
  navigator.clipboard.writeText(text).then(() => {
    toast('ok', 'Đã copy', 'Danh sách đã được copy vào khay nhớ tạm.');
  }).catch(() => {
    toast('err', 'Lỗi copy', 'Trình duyệt không hỗ trợ copy tự động.');
  });
}
function openCloseModal(){
  let present = 0, late = 0, absent = 0, excused = 0, unmarked = 0;
  students.forEach(s => {
    const a = attendanceMap[s.mssv];
    if (!a) unmarked++;
    else if (a.status === 'có mặt') present++;
    else if (a.status === 'đi muộn') late++;
    else if (a.status === 'vắng có phép') excused++;
    else absent++;
  });
  document.getElementById('modalPresent').textContent = present;
  document.getElementById('modalAbsent').textContent = absent;
  document.getElementById('modalUnmarked').textContent = unmarked;
  const warn = document.getElementById('modalWarnText');
  if (unmarked > 0){ warn.style.display = 'block'; warn.innerHTML = '💡 Có <b>' + unmarked + ' sinh viên chưa quét</b>. Bạn có thể đánh dấu vắng trước khi đóng.'; }
  else warn.style.display = 'none';
  document.getElementById('closeModal').classList.add('show');
}
function closeModalFn(){ document.getElementById('closeModal').classList.remove('show'); }

// Đóng phiên TỰ ĐỘNG khi hết giờ (không cần confirm)
async function autoCloseSession(){
  clearInterval(countdownTimer);
  const sid = currentSession?.id ? String(currentSession.id) : null;
  const { data, error } = await supabase.rpc('admin_close_session', { p_session_id: sid });
  if (error || !data?.ok){ toast('err', 'Đóng phiên thất bại', data?.message || error?.message); _closingSession = false; return; }
  currentSession = null;
  showEmpty();
  await loadTodayHistory();
}

async function confirmDeleteHistory(){
  if (!confirm('Xóa toàn bộ lịch sử các phiên đã đóng trong 7 ngày qua? Hành động này không thể hoàn tác.')){
    return;
  }
  const { data, error } = await supabase.rpc('admin_delete_history');
  if (error || !data?.ok){
    const msg = error ? (error.message || JSON.stringify(error)) : (data?.message || 'Lỗi không xác định');
    toast('err', 'Xóa thất bại', msg);
    console.error('Lỗi khi gọi admin_delete_history:', error, data);
    return;
  }
  toast('ok', 'Đã xóa lịch sử', 'Đã xóa các phiên đã đóng.');
  await loadTodayHistory();
  if (typeof refreshAll === 'function') await refreshAll();
  else if (typeof loadAttendance === 'function') { await loadAttendance(); renderAll(); }
}

async function deleteSpecificSession(sid) {
  if (!confirm('Xóa phiên điểm danh này? Dữ liệu của phiên cũng sẽ bị xóa. Không thể hoàn tác.')) return;
  const { data, error } = await supabase.rpc('admin_delete_session', { p_session_id: sid });
  if (error || (data && !data.ok)) {
    toast('err', 'Xóa thất bại', error?.message || data?.message || 'Lỗi không xác định');
    return;
  }
  toast('ok', 'Đã xóa', 'Phiên điểm danh đã được xóa.');
  await loadTodayHistory();
  if (typeof refreshAll === 'function') await refreshAll();
  else if (typeof loadAttendance === 'function') { await loadAttendance(); renderAll(); }
}

// Đóng phiên THỦ CÔNG qua modal xác nhận
async function confirmCloseSession(){
  if (_closingSession) return;
  _closingSession = true;
  clearInterval(countdownTimer);
  const sid = currentSession?.id ? String(currentSession.id) : null;
  const { data, error } = await supabase.rpc('admin_close_session', { p_session_id: sid });
  if (error || !data?.ok){
    toast('err', 'Đóng phiên thất bại', data?.message || error?.message);
    _closingSession = false;
    return;
  }
  closeModalFn();
  toast('ok', 'Đã đóng phiên', 'Lịch sử được lưu trong mục "Lịch sử điểm danh".');
  currentSession = null;
  showEmpty();
  await loadTodayHistory();
}
async function loadTodayHistory(){
  const { data, error } = await supabase.rpc('admin_today_sessions');
  const wrap = document.getElementById('todayHistoryWrap');
  const list = document.getElementById('todayHistoryList');
  const emptyList = document.getElementById('emptyTodayHistoryList');
  const historyFullList = document.getElementById('historyFullList');
  const kpiPresentRateEl = document.getElementById('kpiPresentRate');
  const kpiAbsentRateEl = document.getElementById('kpiAbsentRate');

  if (error || !data?.ok || !data.sessions?.length){
    if (wrap) wrap.style.display = 'none';
    const emptyHtml = `
        <div style="padding:36px 16px;text-align:center;color:var(--muted);font-size:13px">
          <div style="font-size:26px;margin-bottom:8px">📋</div>
          <b>Chưa có lịch sử phiên nào</b>
          <p style="font-size:12px;margin-top:4px;color:var(--faint)">Các phiên điểm danh gần đây sẽ hiển thị tại đây.</p>
        </div>`;
    [emptyList, historyFullList, list].filter(Boolean).forEach(el => { el.innerHTML = emptyHtml; });
    if (kpiPresentRateEl) kpiPresentRateEl.textContent = '—%';
    if (kpiAbsentRateEl) kpiAbsentRateEl.textContent = '—%';
    return;
  }

  // Lưu map các phiên để có thể xem lại chi tiết ngay lập tức
  window._todaySessionsMap = {};
  data.sessions.forEach(s => { window._todaySessionsMap[s.id] = s; });

  // Tính KPI tổng quan từ các phiên gần nhất
  let totalPresent = 0;
  let totalAbsent = 0;
  data.sessions.forEach(s => {
    totalPresent += (s.present || 0) + (s.late || 0);
    totalAbsent += (s.absent || 0);
  });
  const grandTotal = totalPresent + totalAbsent;
  if (grandTotal > 0){
    const pRate = Math.round((totalPresent / grandTotal) * 100);
    const aRate = 100 - pRate;
    if (kpiPresentRateEl) kpiPresentRateEl.textContent = pRate + '%';
    if (kpiAbsentRateEl) kpiAbsentRateEl.textContent = aRate + '%';
  } else {
    if (kpiPresentRateEl) kpiPresentRateEl.textContent = '0%';
    if (kpiAbsentRateEl) kpiAbsentRateEl.textContent = '0%';
  }

  const itemsHtml = data.sessions.map(renderSessionHistoryCard).join('');

  if (wrap && list) { wrap.style.display = 'block'; list.innerHTML = itemsHtml; }
  if (emptyList) { emptyList.innerHTML = itemsHtml; }
  if (historyFullList) { historyFullList.innerHTML = itemsHtml; }
}

async function quickCloseSession(sid){
  if (!confirm('Đóng phiên điểm danh này? Sinh viên sẽ không thể tiếp tục quét QR.')) return;
  try {
    const { data, error } = await supabase.rpc('admin_close_session', { p_session_id: sid });
    if (error || !data?.ok) throw new Error(data?.message || error?.message || 'Không thể đóng phiên');
    toast('ok', 'Đã đóng phiên', 'Phiên đã chuyển sang trạng thái đã đóng.');
    if (currentSession?.id && String(currentSession.id) === String(sid)) {
      currentSession = null;
      showEmpty();
    }
    await loadTodayHistory();
    if (typeof refreshAll === 'function') await refreshAll();
  } catch(e){
    toast('err', 'Đóng phiên thất bại', e.message);
  }
}

async function quickReopenSession(sid){
  if (!confirm('Bạn có chắc muốn mở lại phiên điểm danh này?')) return;
  try {
    const { data, error } = await supabase.rpc('admin_reopen_session', { p_session_id: sid });
    if (error || !data?.ok) throw new Error(data?.message || error?.message || 'Không thể mở lại');
    toast('ok', 'Đã mở lại phiên', 'Phiên đã chuyển sang trạng thái đang hoạt động.');
    await refreshAll();
    await loadTodayHistory();
  } catch(e){
    toast('err', 'Lỗi', e.message);
  }
}

async function loadTodaySchoolSchedule(){
  const freeWrap = document.getElementById('schedFreeListWrap');
  const busyWrap = document.getElementById('schedBusyListWrap');
  const unknownWrap = document.getElementById('schedUnknownListWrap');
  const timeHeader = document.getElementById('schedRealtimeHeader');
  const freeBadge = document.getElementById('schedFreeCountBadge');
  const busyBadge = document.getElementById('schedBusyCountBadge');
  const freeCountEl = document.getElementById('schedFreeCount');
  const busyCountEl = document.getElementById('schedBusyCount');
  const kpiBusyEl = document.getElementById('kpiBusyCount');

  try {
    const now = new Date();
    // Format Vietnam time header
    const vnDateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
    const vnTimeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    if (timeHeader) timeHeader.textContent = `🕒 ${vnDateStr} • ${vnTimeStr}`;

    const todayKey = getVietnamDateKey(0);
    const startStr = new Date(`${todayKey}T00:00:00+07:00`).toISOString();
    const endStr = new Date(new Date(startStr).getTime() + 86400000).toISOString();

    const { data, error } = await supabase
      .from('student_schedules')
      .select('mssv, subject_name, room_name, teacher_name, start_time, end_time')
      .gte('start_time', startStr)
      .lt('start_time', endStr)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Lỗi khi tải lịch học trường:', error);
      if (freeWrap) freeWrap.innerHTML = '<div class="schedule-loading">Không thể tải dữ liệu thời khóa biểu.</div>';
      if (busyWrap) busyWrap.innerHTML = '<div class="schedule-loading">Không thể tải dữ liệu thời khóa biểu.</div>';
      return;
    }

    const {data:approvedLeaveRows}=await supabase.from('leave_requests')
      .select('mssv,leave_date,leave_period,reason')
      .eq('status','approved');
    const todayLeaveByStudent = {};
    (approvedLeaveRows || []).forEach(r => {
      const dayKey = new Date(startStr).toLocaleDateString('sv-SE');
      if (r.leave_date === dayKey) {
        (todayLeaveByStudent[r.mssv] ||= []).push({
          period: r.leave_period,
          periodLabel: adminLeavePeriodNames[r.leave_period] || 'Cả ngày',
          reason: r.reason || '',
          fullText: `${adminLeavePeriodNames[r.leave_period] || 'Cả ngày'}${r.reason ? ': ' + r.reason : ''}`
        });
      }
    });
    const {data:knownSchedules}=await supabase.from('student_schedules').select('mssv');
    const studentsWithCalendar=new Set((knownSchedules||[]).map(r=>r.mssv));

    const items = data || [];
    const allStudents = (students && students.length > 0) ? students : [
      { mssv: '123000555', name: 'Nguyễn Lê Vũ Duy' }, { mssv: '123000078', name: 'Huỳnh Tuấn Tú' },
      { mssv: '125001343', name: 'Dương Công Mạnh' }, { mssv: '123001058', name: 'Võ Duy Khang' },
      { mssv: '123000651', name: 'Nguyễn Văn Trung' }
    ];

    const studentMap = {};
    allStudents.forEach(s => { studentMap[s.mssv] = s.name; });

    // Group schedules by MSSV
    const scheduleByStudent = {};
    items.forEach(item => {
      if (!scheduleByStudent[item.mssv]) scheduleByStudent[item.mssv] = [];
      scheduleByStudent[item.mssv].push(item);
    });

    const nowMs = now.getTime();
    const freeList = [];
    const busyList = [];
    const unknownList = [];
    window._todayStudentScheduleMap = {};

    allStudents.forEach(s => {
      const sMssv = s.mssv;
      const sName = s.name || studentMap[sMssv] || sMssv;
      const sScheds = scheduleByStudent[sMssv] || [];
      const leaves = todayLeaveByStudent[sMssv] || [];
      const leaveText = leaves.map(l => l.fullText).join('; ');

      if (!studentsWithCalendar.has(sMssv)) {
        unknownList.push({mssv:sMssv,name:sName});
        window._todayStudentScheduleMap[sMssv] = {
          status: 'unknown',
          statusText: '⚪ Chưa có dữ liệu',
          leaves: leaves,
          leaveText: leaveText,
          classes: []
        };
      } else if (sScheds.length === 0) {
        freeList.push({
          mssv: sMssv,
          name: sName,
          status: 'free_all_day',
          statusText: '🟢 Rảnh cả ngày',
          classes: []
        });
        window._todayStudentScheduleMap[sMssv] = {
          status: 'free_all_day',
          statusText: '🟢 Rảnh cả ngày',
          leaves: leaves,
          leaveText: leaveText,
          classes: []
        };
      } else {
        // Has classes today - check real-time state
        let currentlyInClass = false;
        let futureClasses = 0;
        let pastClasses = 0;

        const classDetails = sScheds.map(c => {
          const cStart = new Date(c.start_time).getTime();
          const cEnd = new Date(c.end_time).getTime();
          let stateTag = '';
          let stateClass = '';

          if (nowMs >= cStart && nowMs < cEnd) {
            currentlyInClass = true;
            stateTag = '🔴 Đang trong giờ học';
            stateClass = 'tag-busy-now';
          } else if (nowMs < cStart) {
            futureClasses++;
            stateTag = '⏳ Sắp học';
            stateClass = 'tag-busy-future';
          } else {
            pastClasses++;
            stateTag = '✅ Đã kết thúc';
            stateClass = 'tag-busy-past';
          }

          const tStart = new Date(c.start_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
          const tEnd = new Date(c.end_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

          return {
            subject: c.subject_name || 'Môn học',
            room: c.room_name || 'Chưa xếp phòng',
            teacher: c.teacher_name || '',
            timeRange: `${tStart} – ${tEnd}`,
            stateTag,
            stateClass,
            isCurrent: (nowMs >= cStart && nowMs < cEnd)
          };
        });

        const currentClass = classDetails.find(c => c.isCurrent);
        const upcomingClass = classDetails.find(c => c.stateTag && c.stateTag.includes('Sắp'));

        if (currentlyInClass) {
          busyList.push({
            mssv: sMssv,
            name: sName,
            status: 'in_class',
            statusText: '🔴 Đang học',
            tagClass: 'tag-busy-now',
            classes: classDetails
          });
          window._todayStudentScheduleMap[sMssv] = {
            status: 'in_class',
            statusText: '🔴 Đang học',
            currentClass: currentClass,
            upcomingClass: upcomingClass,
            leaves: leaves,
            leaveText: leaveText,
            classes: classDetails
          };
        } else if (futureClasses > 0) {
          busyList.push({
            mssv: sMssv,
            name: sName,
            status: 'upcoming_class',
            statusText: '⏳ Có ca học sắp tới',
            tagClass: 'tag-busy-future',
            classes: classDetails
          });
          window._todayStudentScheduleMap[sMssv] = {
            status: 'upcoming_class',
            statusText: '⏳ Sắp học',
            currentClass: null,
            upcomingClass: upcomingClass,
            leaves: leaves,
            leaveText: leaveText,
            classes: classDetails
          };
        } else {
          // All classes have ended -> Currently free!
          freeList.push({
            mssv: sMssv,
            name: sName,
            status: 'finished_classes',
            statusText: '🟢 Đã xong ca học (Đang rảnh)',
            classes: classDetails
          });
          window._todayStudentScheduleMap[sMssv] = {
            status: 'finished_classes',
            statusText: '🟢 Đã xong ca học (Rảnh)',
            currentClass: null,
            upcomingClass: null,
            leaves: leaves,
            leaveText: leaveText,
            classes: classDetails
          };
        }
      }
    });

    // Cập nhật lại giao diện bảng điểm danh nếu đang mở
    if (document.getElementById('studentTbody') && typeof renderTable === 'function') {
      renderTable();
    }

    // Update counts
    const freeCount = freeList.length;
    const busyCount = busyList.length;
    const unknownCount = unknownList.length;
    const totalTodayClasses = Object.keys(scheduleByStudent).length;

    if (freeBadge) freeBadge.textContent = `🟢 ${freeCount} Bạn đang rảnh`;
    if (busyBadge) busyBadge.textContent = `🔴 ${busyCount} Bạn bận học`;
    if (freeCountEl) freeCountEl.textContent = freeCount;
    if (busyCountEl) busyCountEl.textContent = busyCount;
    const unknownCountEl=document.getElementById('schedUnknownCount');if(unknownCountEl)unknownCountEl.textContent=unknownCount;
    if (kpiBusyEl) kpiBusyEl.textContent = totalTodayClasses || busyCount;

    // Render Free list
    if (freeWrap) {
      if (freeList.length === 0) {
        freeWrap.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">
            <div style="font-size:24px;margin-bottom:6px">📚</div>
            <b>Hiện tại toàn bộ thành viên đều đang có lịch học!</b>
          </div>`;
      } else {
        freeWrap.innerHTML = freeList.map(s => `
          <div class="sched-student-card">
            <div class="sched-card-top">
              <div>
                <span class="sched-student-name">${escapeHtml(s.name)}</span>
                <span class="sched-student-mssv">(${escapeHtml(s.mssv)})</span>
              </div>
              <span class="sched-status-tag tag-free-now">${escapeHtml(s.statusText)}</span>
            </div>
            ${s.classes && s.classes.length > 0 ? `
              <div class="sched-class-info">
                <span style="font-size:11.5px;color:var(--muted)">Đã hoàn thành ${s.classes.length} ca học trước đó trong ngày.</span>
              </div>` : ''}
            ${(todayLeaveByStudent[s.mssv]||[]).map(x=>`<div style="margin-top:7px;padding:6px 8px;border-radius:7px;background:var(--ok-bg);color:var(--ok);font-size:11px">✅ Đã duyệt nghỉ: ${escapeHtml(x)}</div>`).join('')}
          </div>
        `).join('');
      }
    }

    // Render Busy list
    if (busyWrap) {
      if (busyList.length === 0) {
        busyWrap.innerHTML = `
          <div style="padding:28px 16px;text-align:center;color:var(--muted);font-size:13px">
            <div style="font-size:26px;margin-bottom:6px">🎉</div>
            <b>Không có thành viên nào đang bận học lúc này!</b>
            <p style="font-size:12px;margin-top:4px;color:var(--faint)">Tất cả thành viên đều có thể tập trung tại xưởng.</p>
          </div>`;
      } else {
        busyWrap.innerHTML = busyList.map(s => `
          <div class="sched-student-card" style="${s.status === 'in_class' ? 'border-left:3px solid #dc2626' : ''}">
            <div class="sched-card-top">
              <div>
                <span class="sched-student-name">${escapeHtml(s.name)}</span>
                <span class="sched-student-mssv">(${escapeHtml(s.mssv)})</span>
              </div>
              <span class="sched-status-tag ${s.tagClass}">${escapeHtml(s.statusText)}</span>
            </div>
            <div class="sched-class-info">
              ${s.classes.map(c => `
                <div style="margin-bottom:4px">
                  <div class="sched-subject-line">📚 ${escapeHtml(c.subject)}</div>
                  <div class="sched-meta-line">
                    <span>⏱ ${c.timeRange}</span>
                    <span class="room-chip">🚪 ${escapeHtml(c.room)}</span>
                    <span class="sched-status-tag ${c.stateClass}" style="font-size:9.5px">${c.stateTag}</span>
                  </div>
                </div>
              `).join('')}
            </div>
            ${(todayLeaveByStudent[s.mssv]||[]).map(x=>`<div style="margin:7px 10px;padding:6px 8px;border-radius:7px;background:var(--ok-bg);color:var(--ok);font-size:11px">✅ Đã duyệt nghỉ: ${escapeHtml(x)}</div>`).join('')}
          </div>
        `).join('');
      }
    }

    if(unknownWrap){unknownWrap.innerHTML=unknownList.length?unknownList.map(s=>`<div class="sched-student-card"><div class="sched-card-top"><div><span class="sched-student-name">${escapeHtml(s.name)}</span><span class="sched-student-mssv">(${escapeHtml(s.mssv)})</span></div><span class="sched-status-tag" style="background:#f1f5f9;color:var(--muted)">⚪ Chưa có dữ liệu</span></div>${(todayLeaveByStudent[s.mssv]||[]).map(x=>`<div style="margin-top:7px;padding:6px 8px;border-radius:7px;background:var(--ok-bg);color:var(--ok);font-size:11px">✅ Đã duyệt nghỉ: ${escapeHtml(x)}</div>`).join('')}</div>`).join(''):'<div class="schedule-loading">Đã có lịch cho tất cả thành viên.</div>';}

  } catch (err) {
    console.error('loadTodaySchoolSchedule error:', err);
    if (freeWrap) freeWrap.innerHTML = '<div class="schedule-loading">Lỗi khi phân tích lịch học.</div>';
    if (busyWrap) busyWrap.innerHTML = '<div class="schedule-loading">Lỗi khi phân tích lịch học.</div>';
    if (unknownWrap) unknownWrap.innerHTML = '<div class="schedule-loading">Lỗi khi phân tích lịch học.</div>';
  }
}

