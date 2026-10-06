/**
 * DIEM_DANH ΓÇö js/tasks.js
 * Trang nhiß╗çm vß╗Ñ cho TH├ÇNH VI├èN (v├á ─Éß╗Öi tr╞░ß╗ƒng xem tiß║┐n ─æß╗Ö cß╗ºa m├¼nh).
 * Th├ánh vi├¬n CHß╗ê thß║Ñy & cß║¡p nhß║¡t ─æ╞░ß╗úc nhß╗»ng nhiß╗çm vß╗Ñ ─æ╞░ß╗úc giao cho m├¼nh
 * (─æ╞░ß╗úc bß║úo ─æß║úm bß╗ƒi RLS + RPC update_task_status).
 */

let myAuth = null;
let myTeam = null;
let myTasks = [];
let myBlocks = [];       // c├íc khoß║úng bß║¡n ─æ├ú khai b├ío
let myMatrix = {};       // lß╗ïch rß║únh cß╗ºa ch├¡nh m├¼nh

// ============================================================
// KHß╗₧I Tß║áO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  myAuth = await requireRoles([], 'trang nhiß╗çm vß╗Ñ');
  if (!myAuth) return;

  const chip = document.getElementById('roleChip');
  if (myAuth.isLeader) {
    chip.textContent = '─Éß╗Öi tr╞░ß╗ƒng';
    chip.className = 'rk-role-chip chip-leader';
  } else if (myAuth.isDeputy) {
    chip.textContent = '─Éß╗Öi ph├│';
    chip.className = 'rk-role-chip chip-deputy';
  } else if (myAuth.isAdmin) {
    chip.textContent = 'Quß║ún trß╗ï vi├¬n';
    chip.className = 'rk-role-chip chip-admin';
  }

  const sub = document.getElementById('mySubtitle');
  if (sub) sub.textContent = `Xin ch├áo, ${myAuth.displayName}`;

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
    showAlert('Bß║ín ch╞░a ─æ╞░ß╗úc ph├ón v├áo nh├│m n├áo. Nhiß╗çm vß╗Ñ sß║╜ xuß║Ñt hiß╗çn khi ─Éß╗Öi tr╞░ß╗ƒng giao.', 'info');
    return;
  }
  // ╞»u ti├¬n nh├│m m├¼nh l├ám ─æß╗Öi tr╞░ß╗ƒng (nß║┐u c├│)
  myTeam = teams.find((t) => t.leader_id === myAuth.user.id) || teams[0];
}

// ============================================================
// NHIß╗åM Vß╗ñ
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
    // Th├ánh vi├¬n chß╗ë thß║Ñy phß║ºn c├┤ng cß╗ºa m├¼nh
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
      ? '<div class="rk-empty">Kh├┤ng c├│ nhiß╗çm vß╗Ñ n├áo ß╗ƒ trß║íng th├íi n├áy.</div>'
      : '<div class="rk-empty">Bß║ín ch╞░a ─æ╞░ß╗úc giao nhiß╗çm vß╗Ñ n├áo. H├úy kiß╗âm tra lß║íi sau.</div>';
    return;
  }

  let html = '<div class="rk-task-list">';

  list.forEach((t) => {
    const a = t.my_assignment;
    const slot = (t.slot_thu && t.slot_buoi)
      ? `${THU_SHORT[t.slot_thu]} ┬╖ ${BUOI_SHORT[t.slot_buoi]}` : null;
    const due = fmtDue(t.due_at);

    html += '<div class="rk-task">';
    html += '<div class="rk-task-head"><div class="rk-task-title">' + escapeHtml(t.title) + '</div>' +
      `<span class="rk-badge ${escapeHtml(a.status)}">${TASK_STATUS_LABELS[a.status] || a.status}</span></div>`;

    if (t.description) {
      html += `<div class="rk-task-desc">${escapeHtml(t.description)}</div>`;
    }

    if (t.priority === 'high') {
      html += '<div class="rk-task-meta"><span class="rk-badge high">╞»u ti├¬n cao</span></div>';
    }

    html += '<div class="rk-task-meta" style="margin-top:8px;">';
    if (slot) html += `<span>≡ƒòÉ Khung dß╗▒ kiß║┐n: ${escapeHtml(slot)}</span><span class="rk-dot"></span>`;
    if (due) html += `<span>ΓÅ│ Hß║ín: ${escapeHtml(due)}</span>`;
    html += '</div>';

    // N├║t cß║¡p nhß║¡t tiß║┐n ─æß╗Ö
    html += '<div class="rk-task-foot"><div class="rk-assignee-list">' +
      '<span class="rk-muted">Cß║¡p nhß║¡t tiß║┐n ─æß╗Ö:</span>';
    ['todo', 'doing', 'done'].forEach((s) => {
      const active = a.status === s;
      html += `<button class="rk-btn rk-btn-sm${active ? ' rk-btn-primary' : ''}" ` +
        `onclick="setStatus('${t.id}','${s}')">${TASK_STATUS_LABELS[s]}</button>`;
    });
    html += '</div>';

    if (a.note) {
      html += `<div class="rk-muted" style="margin-top:10px;">≡ƒô¥ Ghi ch├║ ─Éß╗Öi tr╞░ß╗ƒng: ${escapeHtml(a.note)}</div>`;
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
    return showAlert(data?.message || error?.message || 'Kh├┤ng cß║¡p nhß║¡t ─æ╞░ß╗úc.', 'err');
  }

  showAlert('Γ£ô ' + (data.message || '─É├ú cß║¡p nhß║¡t tiß║┐n ─æß╗Ö.'), 'ok');
  await loadMyTasks();
  renderMyTasks();
  updateStats();
}

// ============================================================
// KHAI B├üO Lß╗èCH Rß║óNH
// ============================================================
async function loadMyAvailability() {
  try {
    // Khoß║úng bß║¡n ─æ├ú khai b├ío (chß╗ë ─æß╗ìc ─æ╞░ß╗úc ch├¡nh m├¼nh qua RLS)
    const { data: blocks, error: bErr } = await supabase
      .from('availability_blocks')
      .select('slot_thu, slot_buoi, reason')
      .eq('user_id', myAuth.user.id);

    if (bErr) throw bErr;
    myBlocks = Array.isArray(blocks) ? blocks : [];

    // T├¡nh lß╗ïch rß║únh (kß║┐t hß╗úp lß╗ïch hß╗ìc + khoß║úng bß║¡n)
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
    '<th class="rk-week-corner">Khung giß╗¥</th>';
  for (const th of thuList) html += `<th>${THU_SHORT[th]}</th>`;
  html += '</tr></thead><tbody>';

  for (const bu of buoiList) {
    html += `<tr><td class="rk-week-rowhead">${BUOI_SHORT[bu]}</td>`;
    for (const th of thuList) {
      const info = myMatrix[`${uid}|${th}|${bu}`] || { free: true, reason: 'Rß║únh' };
      // ├ö c├│ lß╗¢p th├¼ kh├┤ng cho ─æ├ính dß║Ñu (─æ├ú biß║┐t l├á bß║¡n)
      const isClass = info.reason && info.reason.startsWith('C├│ lß╗¢p');
      const lb = freeLabel(info.free, info.reason);
      const cls = isClass ? 'is-busy-class' : lb.cls;
      const cursor = isClass ? '' : ' is-clickable';
      const title = isClass
        ? `${THU_LABELS[th]} ┬╖ ${BUOI_SHORT[bu]} ΓÇö ${info.reason} (kh├┤ng thß╗â thay ─æß╗òi)`
        : `${THU_LABELS[th]} ┬╖ ${BUOI_SHORT[bu]} ΓÇö bß║Ñm ─æß╗â ─æ├ính dß║Ñu ${info.free ? 'Bß║¼N' : 'Rß║óNH'}`;

      html += `<td><div class="rk-slot ${cls}${cursor}" title="${escapeHtml(title)}" ` +
        `onclick="${isClass ? '' : `toggleBlock(${th},${bu},${info.free ? 'true' : 'false'})`}">` +
        `<span class="rk-slot-mark">${isClass ? '≡ƒôÜ' : (info.free ? 'Γ£ô' : 'Γ£ò')}</span>` +
        `<span class="rk-slot-text">${isClass ? 'C├│ lß╗¢p' : (info.free ? 'Rß║únh' : 'Bß║¡n')}</span></div></td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  html += '<p class="rk-muted" style="margin-top:10px;">≡ƒƒ¿ ├ö c├│ lß╗¢p kh├┤ng thß╗â thay ─æß╗òi. ' +
    'Bß║Ñm v├áo ├┤ xanh (Rß║únh) ─æß╗â ─æ├ính dß║Ñu l├á Bß║¡n, bß║Ñm ├┤ ─æß╗Å ─æß╗â gß╗í.</p>';

  box.innerHTML = html;
}

/** Bß║¡t/tß║»t khoß║úng bß║¡n cho ch├¡nh m├¼nh */
async function toggleBlock(thu, buoi, currentlyFree) {
  const willBeBusy = currentlyFree === true;
  const reasonBox = document.getElementById('blockReasonBox');
  const reasonInput = document.getElementById('blockReason');

  let reason = null;
  if (willBeBusy) {
    // Hß╗Åi l├╜ do (kh├┤ng bß║»t buß╗Öc)
    reason = prompt(
      `Khai b├ío Bß║¼N v├áo ${THU_LABELS[thu]} ┬╖ ${BUOI_SHORT[buoi]}.\n\n` +
      'L├╜ do (kh├┤ng bß║»t buß╗Öc):',
      ''
    );
    if (reason === null) return; // huß╗╖
  } else {
    if (!confirm(`Gß╗í ─æ├ính dß║Ñu bß║¡n ${THU_LABELS[thu]} ┬╖ ${BUOI_SHORT[buoi]}?`)) return;
  }

  const { data, error } = await supabase.rpc('set_availability_block', {
    p_slot_thu: thu,
    p_slot_buoi: buoi,
    p_busy: willBeBusy,
    p_reason: reason || null,
  });

  if (error || !data?.ok) {
    return showAlert(data?.message || error?.message || 'Kh├┤ng cß║¡p nhß║¡t ─æ╞░ß╗úc.', 'err');
  }

  if (reasonInput) reasonInput.value = '';
  if (reasonBox) reasonBox.style.display = 'none';

  showAlert('Γ£ô ' + (data.message || '─É├ú cß║¡p nhß║¡t lß╗ïch rß║únh.'), 'ok');
  await loadMyAvailability();
  renderMyAvailability();
  updateStats();
}

// ============================================================
// THß╗ÉNG K├è & TIß╗åN ├ìCH
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
