/* =====================================================================
   LH-NaviX Admin — admin.students.js
   Quản lý sinh viên, nhóm, lịch ME, điểm danh, phiên, mật khẩu
   (Tách từ admin.html; các file nạp theo thứ tự, không đổi thứ tự.)
   ===================================================================== */
/* ==========================================================
   QUẢN LÝ SINH VIÊN & ĐỒNG BỘ LỊCH ME THEO KHOẢNG NGÀY
   ========================================================== */
let studentsManagementFilter = 'all';
let pendingMeStudent = null;
let currentDeleteTarget = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeMeTime(value) {
  let time = String(value || '').trim().replace(' ', 'T');
  if (/[+-]\d{2}$/.test(time)) time += ':00';
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(time)) return time;
  return time + '+07:00';
}

function generateWeeklyDates(startStr, endStr) {
  const dates = [];
  const start = new Date(startStr + 'T00:00:00+07:00');
  const end = new Date(endStr + 'T23:59:59+07:00');
  let curr = new Date(start);
  while (curr <= end) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    curr.setDate(curr.getDate() + 7);
  }
  return dates;
}

function deduplicateSchedules(list) {
  const map = new Map();
  for (const item of list) {
    const key = `${item.mssv}_${item.start_time}_${item.end_time}_${item.subject_name}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function getStoredSemesterDateRange() {
  const startInput = document.getElementById('schedRangeStart');
  const endInput = document.getElementById('schedRangeEnd');
  let start = startInput?.value || '';
  let end = endInput?.value || '';

  if (!start || !end) {
    try {
      const cached = JSON.parse(localStorage.getItem('me_sync_date_range') || '{}');
      if (cached.start && cached.end) {
        start = cached.start;
        end = cached.end;
      }
    } catch (e) {}
  }

  if (!start) start = '2026-10-12';
  if (!end) end = '2027-02-03';
  return { start, end };
}

async function loadSemesterSettings() {
  try {
    let start = '2026-10-12';
    let end = '2027-02-03';
    const { data } = await supabase.rpc('get_semester_settings');
    if (data && data.ok && data.start_date && data.end_date) {
      start = data.start_date;
      end = data.end_date;
    } else {
      const cached = JSON.parse(localStorage.getItem('me_sync_date_range') || '{}');
      if (cached.start && cached.end) { start = cached.start; end = cached.end; }
    }

    localStorage.setItem('me_sync_date_range', JSON.stringify({ start, end }));
    const sEl = document.getElementById('schedRangeStart');
    const eEl = document.getElementById('schedRangeEnd');
    if (sEl) sEl.value = start;
    if (eEl) eEl.value = end;
  } catch (e) {
    console.warn('loadSemesterSettings error:', e);
  }
}

async function saveSemesterDateRange() {
  const startEl = document.getElementById('schedRangeStart');
  const endEl = document.getElementById('schedRangeEnd');
  if (!startEl || !endEl) return;
  const start = startEl.value;
  const end = endEl.value;

  if (!start || !end || start > end) {
    toast('warn', 'Khoảng ngày không hợp lệ', 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
    return;
  }

  localStorage.setItem('me_sync_date_range', JSON.stringify({ start, end }));

  try {
    const { data, error } = await supabase.rpc('admin_save_semester_settings', {
      p_start_date: start,
      p_end_date: end
    });
    if (error || !data?.ok) {
      console.warn('admin_save_semester_settings error:', error || data);
      toast('ok', 'Đã lưu cục bộ', `Đã lưu khoảng ngày ${start} → ${end} vào trình duyệt.`);
    } else {
      toast('ok', 'Đã lưu cấu hình', `Đã lưu khoảng ngày ${start} → ${end} lên Supabase.`);
    }
  } catch (e) {
    toast('ok', 'Đã lưu cục bộ', `Đã lưu khoảng ngày ${start} → ${end} vào trình duyệt.`);
  }
}

function setStudentFilter(filter) {
  studentsManagementFilter = filter;
  document.querySelectorAll('#view-students .filters .filter').forEach(f => f.classList.remove('active'));
  const btn = document.getElementById('stuFilter' + (filter === 'all' ? 'All' : (filter === 'active' ? 'Active' : 'Inactive')));
  if (btn) btn.classList.add('active');
  renderStudentsTable();
}

let studentTeamsMap = new Map();
let currentAssigningMssv = null;

async function openTeamsListModal() {
  document.getElementById('teamsListModal').classList.add('show');
  await loadTeamGroups();
}
function closeTeamsListModal() {
  document.getElementById('teamsListModal').classList.remove('show');
}

function openAssignTeamModal(mssv) {
  currentAssigningMssv = mssv;
  const stu = students.find(s => s.mssv === mssv);
  const infoEl = document.getElementById('assignTeamStudentInfo');
  if (infoEl) infoEl.textContent = stu ? `${stu.name} (${stu.mssv})` : `MSSV: ${mssv}`;

  const sel = document.getElementById('assignTeamSelect');
  if (sel) {
    let html = '<option value="">-- Chưa vào nhóm (Rời nhóm) --</option>';
    (teamGroups || []).forEach(g => {
      html += `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}${g.field ? ' (' + escapeHtml(g.field) + ')' : ''}</option>`;
    });
    sel.innerHTML = html;
    const currentTeams = studentTeamsMap.get(mssv) || [];
    sel.value = currentTeams.length > 0 ? currentTeams[0].id : '';
  }
  document.getElementById('assignTeamModal').classList.add('show');
}

function closeAssignTeamModal() {
  document.getElementById('assignTeamModal').classList.remove('show');
  currentAssigningMssv = null;
}

async function saveStudentTeamAssignment() {
  if (!currentAssigningMssv) return;
  const sel = document.getElementById('assignTeamSelect');
  const newTeamId = sel ? sel.value : '';
  const mssv = currentAssigningMssv;
  const btn = document.getElementById('btnSaveAssignTeam');
  if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }

  try {
    const { error: delErr } = await supabase.from('team_group_members').delete().eq('mssv', mssv);
    if (delErr) throw delErr;

    if (newTeamId) {
      const { error: insErr } = await supabase.from('team_group_members').insert({ team_id: newTeamId, mssv });
      if (insErr) throw insErr;
    }

    toast('ok', 'Cập nhật thành công', 'Đã lưu nhóm cho sinh viên ' + mssv);
    closeAssignTeamModal();
    await refreshStudentTeamsData();
    renderStudentsTable();
  } catch (err) {
    toast('err', 'Lỗi lưu nhóm', err.message || 'Không thể cập nhật nhóm.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Lưu'; }
  }
}

function toggleAddStudentCard(show) {
  const card = document.getElementById('cardAddStudent');
  if (!card) return;
  const isCurrentlyHidden = card.style.display === 'none' || !card.style.display;
  const nextShow = typeof show === 'boolean' ? show : isCurrentlyHidden;
  card.style.display = nextShow ? 'block' : 'none';
  if (nextShow) {
    const input = document.getElementById('inputSearchMssv');
    if (input) setTimeout(() => input.focus(), 60);
  }
}
function focusAddStudentMssv() {
  toggleAddStudentCard(true);
}

let collapsedTeamsSet = new Set();

function toggleTeamAccordion(teamId) {
  if (collapsedTeamsSet.has(teamId)) {
    collapsedTeamsSet.delete(teamId);
  } else {
    collapsedTeamsSet.add(teamId);
  }
  const body = document.getElementById('teamBody_' + teamId);
  const icon = document.getElementById('teamIcon_' + teamId);
  const isCollapsed = collapsedTeamsSet.has(teamId);
  if (body) body.style.display = isCollapsed ? 'none' : 'block';
  if (icon) icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
}

function toggleAllTeamAccordions(expand) {
  if (expand) {
    collapsedTeamsSet.clear();
  } else {
    (teamGroups || []).forEach(g => collapsedTeamsSet.add(g.id));
    collapsedTeamsSet.add('none');
  }
  renderStudentsTable();
}

async function refreshStudentTeamsData() {
  try {
    const [{ data: tg }, { data: tgm }] = await Promise.all([
      supabase.from('team_groups').select('id,name,field,leader_mssv').order('name'),
      supabase.from('team_group_members').select('team_id,mssv')
    ]);
    teamGroups = tg || [];
    studentTeamsMap.clear();
    const groupMap = new Map((tg || []).map(g => [g.id, g.name]));
    (tgm || []).forEach(m => {
      if (!studentTeamsMap.has(m.mssv)) studentTeamsMap.set(m.mssv, []);
      const tName = groupMap.get(m.team_id);
      if (tName) studentTeamsMap.get(m.mssv).push({ id: m.team_id, name: tName });
    });
  } catch (e) {
    console.warn('[refreshStudentTeamsData error]', e);
  }
}

async function loadStudentsManagement() {
  const loaded = await loadStudents();
  if (!loaded) {
    ['stuKpiTotal', 'stuKpiGroups', 'stuKpiActive', 'stuKpiInactive', 'countFilterAll', 'countFilterActive', 'countFilterInactive']
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    const container = document.getElementById('studentsGroupContainer');
    if (container) container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--err)">Không tải được danh sách. Xem thông báo lỗi phía trên.</div>';
    const countBadge = document.getElementById('stuTableCount');
    if (countBadge) countBadge.textContent = 'Chưa tải được dữ liệu';
    return;
  }
  const total = students.length;
  const activeCount = students.filter(s => s.is_active !== false).length;
  const inactiveCount = students.filter(s => s.is_active === false).length;

  const totalEl = document.getElementById('stuKpiTotal');
  const activeEl = document.getElementById('stuKpiActive');
  const inactiveEl = document.getElementById('stuKpiInactive');
  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = activeCount;
  if (inactiveEl) inactiveEl.textContent = inactiveCount;

  const cAll = document.getElementById('countFilterAll');
  const cAct = document.getElementById('countFilterActive');
  const cIna = document.getElementById('countFilterInactive');
  if (cAll) cAll.textContent = total;
  if (cAct) cAct.textContent = activeCount;
  if (cIna) cIna.textContent = inactiveCount;

  await refreshStudentTeamsData();
  await refreshStudentFaceDataMap();

  const groupsEl = document.getElementById('stuKpiGroups');
  if (groupsEl) groupsEl.textContent = (teamGroups || []).length;

  renderStudentsTable();
}

let studentFaceDataMap = new Map();
async function refreshStudentFaceDataMap() {
  try {
    const { data } = await supabase.from('student_face_data').select('mssv, descriptors, thumbnails, updated_at');
    studentFaceDataMap.clear();
    (data || []).forEach(row => {
      const valid = (row.descriptors || []).filter(d => d);
      if (valid.length > 0) {
        studentFaceDataMap.set(row.mssv, {
          count: valid.length,
          thumbnails: row.thumbnails || [],
          updated_at: row.updated_at
        });
      }
    });
  } catch(e) {
    console.warn('[refreshStudentFaceDataMap]', e);
  }
}

async function renderStudentsTable() {
  const container = document.getElementById('studentsGroupContainer');
  const searchInput = document.getElementById('stuTableSearch');
  const countBadge = document.getElementById('stuTableCount');
  if (!container) return;

  const q = (searchInput?.value || '').toLowerCase().trim();
  const isSearching = !!q;

  const filtered = students.filter(s => {
    const isActive = s.is_active !== false;
    if (studentsManagementFilter === 'active' && !isActive) return false;
    if (studentsManagementFilter === 'inactive' && isActive) return false;
    if (!q) return true;
    return s.mssv.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q);
  });

  if (countBadge) countBadge.textContent = `${filtered.length} / ${students.length} sinh viên`;

  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted);background:var(--surface-2);border-radius:10px">Không tìm thấy sinh viên nào khớp với bộ lọc.</div>';
    return;
  }

  // Phân bổ sinh viên vào từng nhóm
  const teamStudentsMap = new Map();
  (teamGroups || []).forEach(g => teamStudentsMap.set(g.id, []));
  const unassignedList = [];

  filtered.forEach(s => {
    const myTeams = studentTeamsMap.get(s.mssv) || [];
    if (myTeams.length === 0) {
      unassignedList.push(s);
    } else {
      myTeams.forEach(t => {
        if (!teamStudentsMap.has(t.id)) teamStudentsMap.set(t.id, []);
        teamStudentsMap.get(t.id).push(s);
      });
    }
  });

  // Render bảng thành viên cho từng nhóm
  function renderMemberTableHtml(memberList, teamId) {
    if (!memberList || memberList.length === 0) {
      return '<div style="padding:16px 20px;color:var(--muted);font-size:12.5px;font-style:italic">Chưa có thành viên nào trong nhóm này. Bấm “Phân ca & Chi tiết” hoặc gán sinh viên để thêm.</div>';
    }

    const rows = memberList.map((s, idx) => {
      const isActive = s.is_active !== false;
      const team = teamGroups.find(t => t.id === teamId);
      const isLeader = team && team.leader_mssv === s.mssv;

      const statusBadge = isActive
        ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:99px;background:var(--ok-bg);color:var(--ok);font-size:11px;font-weight:700">🟢 Hoạt động</span>'
        : '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:99px;background:var(--surface-2);color:var(--muted);border:1px solid var(--border);font-size:11px;font-weight:700">⚪ Đã ngừng</span>';

      const faceInfo = studentFaceDataMap.get(s.mssv);
      const faceBadge = faceInfo
        ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:99px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700" title="Đã lưu ${faceInfo.count}/5 góc mặt">🟢 ${faceInfo.count}/5 góc</span>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:99px;background:var(--surface-2);color:var(--muted);border:1px solid var(--border);font-size:11px;font-weight:700">⚪ Chưa có</span>`;

      const avatarSrc = s.avatar || `images/faces/${s.mssv}.png`;
      const avatarHtml = `<img src="${escapeHtml(avatarSrc)}" onerror="this.src='images/logo.png'" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1.5px solid var(--border);flex-shrink:0;">`;

      const toggleActionBtn = isActive
        ? `<button class="btn btn-secondary btn-sm" onclick="toggleStudentActive('${s.mssv}', true)" title="Tạm dừng hoạt động sinh viên" style="font-size:11px;padding:3px 7px">⏸ Ngừng</button>`
        : `<button class="btn btn-secondary btn-sm" onclick="toggleStudentActive('${s.mssv}', false)" title="Khôi phục hoạt động" style="font-size:11px;padding:3px 7px;color:var(--ok)">▶ Bật</button>`;

      return `
        <tr style="${!isActive ? 'opacity:0.65;background:rgba(0,0,0,0.01)' : ''}">
          <td style="color:var(--muted);font-size:11.5px;width:35px">${idx + 1}</td>
          <td style="font-family:monospace;font-weight:700;font-size:12.5px;width:105px">${escapeHtml(s.mssv)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              ${avatarHtml}
              <div>
                <span style="font-weight:700;font-size:13px">${escapeHtml(s.name)}</span>
                ${isLeader ? '<span style="font-size:10px;font-weight:800;color:#d97706;background:#fef3c7;padding:1px 5px;border-radius:4px;border:1px solid #fde68a;margin-left:4px;">⭐ Đội trưởng</span>' : ''}
              </div>
            </div>
          </td>
          <td style="width:105px">${faceBadge}</td>
          <td style="width:110px">${statusBadge}</td>
          <td style="width:85px">
            <span style="font-size:12px;color:var(--muted)" id="schedCount_${s.mssv}">—</span>
          </td>
          <td style="text-align:right;width:260px">
            <div style="display:inline-flex;gap:5px;align-items:center">
              <button class="btn btn-secondary btn-sm" onclick="openAdminFaceEnrollModal('${escapeJsAttr(s.mssv)}')" title="Chụp & huấn luyện khuôn mặt AI cho sinh viên này" style="font-size:11px;padding:3px 7px">
                📷 Mẫu mặt
              </button>
              <button class="btn btn-secondary btn-sm" onclick="openAssignTeamModal('${escapeJsAttr(s.mssv)}')" title="Đổi hoặc gán nhóm cho sinh viên" style="font-size:11px;padding:3px 7px">
                👥 Nhóm
              </button>
              <button class="btn btn-secondary btn-sm" onclick="syncStudentScheduleSingle('${s.mssv}')" title="Đồng bộ lịch ME riêng" style="font-size:11px;padding:3px 7px">
                🔄 Lịch
              </button>
              ${toggleActionBtn}
              <button class="btn btn-danger btn-sm" onclick="openStudentDeleteModal('${s.mssv}')" title="Xóa vĩnh viễn" style="font-size:11px;padding:3px 6px">
                🗑
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="tbl-wrap" style="border:none;border-top:1px solid var(--border);border-radius:0">
        <table style="font-size:12.5px">
          <thead>
            <tr style="background:var(--surface)">
              <th style="width:35px">STT</th>
              <th style="width:105px">MSSV</th>
              <th>Họ và tên</th>
              <th style="width:105px">Mẫu mặt AI</th>
              <th style="width:110px">Trạng thái</th>
              <th style="width:85px">Lịch ME</th>
              <th style="width:260px;text-align:right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  let htmlCards = '';

  // 1. Render từng nhóm chuyên môn
  (teamGroups || []).forEach(team => {
    const members = teamStudentsMap.get(team.id) || [];
    if (isSearching && members.length === 0) return;

    const leaderObj = students.find(s => s.mssv === team.leader_mssv);
    const leaderText = leaderObj ? leaderObj.name : 'Chưa chỉ định';
    const isCollapsed = isSearching ? false : collapsedTeamsSet.has(team.id);

    htmlCards += `
      <div class="team-group-card" id="teamCard_${team.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.02)">
        <div class="team-group-head" onclick="toggleTeamAccordion('${team.id}')" style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;background:var(--surface-2);cursor:pointer;user-select:none;transition:background 0.15s">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span class="team-accordion-icon" id="teamIcon_${team.id}" style="font-size:12px;color:var(--muted);display:inline-block;transition:transform 0.2s;transform:${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}">▼</span>
            <span style="font-size:14px;font-weight:800;color:var(--text)">👥 ${escapeHtml(team.name)}</span>
            ${team.field && team.field !== team.name ? `<span style="font-size:11px;color:var(--muted);background:var(--surface);padding:2px 7px;border-radius:5px;border:1px solid var(--border)">${escapeHtml(team.field)}</span>` : ''}
            <span class="count-badge" style="font-size:11px;padding:2px 8px;font-weight:700">${members.length} bạn</span>
            <span style="font-size:11.5px;color:var(--muted)">· ⭐ Đội trưởng: <b style="color:var(--text)">${escapeHtml(leaderText)}</b></span>
          </div>
          <div style="display:flex;align-items:center;gap:6px" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm" onclick="openTeamGroup('${team.id}')" title="Quản lý chi tiết nhóm và lịch trực/rảnh" style="font-size:11px;padding:3px 8px">
              ⚙️ Phân ca & Chi tiết
            </button>
          </div>
        </div>
        <div class="team-group-body" id="teamBody_${team.id}" style="display:${isCollapsed ? 'none' : 'block'}">
          ${renderMemberTableHtml(members, team.id)}
        </div>
      </div>
    `;
  });

  // 2. Render nhóm sinh viên chưa phân nhóm
  if (!isSearching || unassignedList.length > 0) {
    const isNoneCollapsed = isSearching ? false : collapsedTeamsSet.has('none');
    htmlCards += `
      <div class="team-group-card" id="teamCard_none" style="background:var(--surface);border:1px dashed var(--border-strong);border-radius:10px;overflow:hidden">
        <div class="team-group-head" onclick="toggleTeamAccordion('none')" style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;background:var(--surface-2);cursor:pointer;user-select:none;transition:background 0.15s">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span class="team-accordion-icon" id="teamIcon_none" style="font-size:12px;color:var(--muted);display:inline-block;transition:transform 0.2s;transform:${isNoneCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}">▼</span>
            <span style="font-size:14px;font-weight:800;color:var(--warn)">⚪ Sinh viên chưa phân nhóm</span>
            <span class="count-badge" style="font-size:11px;padding:2px 8px;font-weight:700;background:#fef3c7;color:#b45309">${unassignedList.length} bạn</span>
          </div>
          <div style="font-size:11.5px;color:var(--muted)">Bấm để mở danh sách & gán nhóm</div>
        </div>
        <div class="team-group-body" id="teamBody_none" style="display:${isNoneCollapsed ? 'none' : 'block'}">
          ${renderMemberTableHtml(unassignedList, null)}
        </div>
      </div>
    `;
  }

  container.innerHTML = htmlCards;

  loadStudentsScheduleCounts(filtered.map(s => s.mssv));
}

async function loadStudentsScheduleCounts(mssvList) {
  if (!mssvList || !mssvList.length) return;
  try {
    const { data } = await supabase.from('student_schedules').select('mssv');
    if (!data) return;
    const counts = {};
    data.forEach(r => { counts[r.mssv] = (counts[r.mssv] || 0) + 1; });
    mssvList.forEach(m => {
      const el = document.getElementById('schedCount_' + m);
      if (el) el.textContent = (counts[m] || 0) + ' tiết';
    });
  } catch (e) {}
}

async function lookupStudentFromME() {
  const input = document.getElementById('inputSearchMssv');
  const statusEl = document.getElementById('lookupMeStatus');
  const previewBox = document.getElementById('studentMePreviewBox');
  const btn = document.getElementById('btnLookupMe');
  if (!input) return;
  const mssv = input.value.trim();
  if (!mssv) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--err)">Vui lòng nhập MSSV để tra cứu.</span>';
    return;
  }

  // Kiểm tra MSSV đã tồn tại trong Supabase chưa
  const existing = students.find(s => s.mssv === mssv);
  if (existing) {
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--warn)">⚠️ MSSV <b>${escapeHtml(mssv)}</b> đã có trong danh sách lớp: <b>${escapeHtml(existing.name)}</b> (${existing.is_active ? '🟢 Đang hoạt động' : '⚪ Đã ngừng'}). Không cần thêm mới.</span>`;
    }
    if (previewBox) previewBox.style.display = 'none';
    return;
  }

  const range = getStoredSemesterDateRange();
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang tra cứu…'; }
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--muted)">Đang kết nối hệ thống ME trường Đại học Lạc Hồng…</span>';
  if (previewBox) previewBox.style.display = 'none';

  try {
    const reqDate = `${range.start}T00:00:00+07:00`;
    const res = await fetch('https://tapi.lhu.edu.vn/calen/auth/XemLich_LichSinhVien', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ StudentID: mssv, Ngay: reqDate, PageIndex: 1, PageSize: 100 })
    });

    if (!res.ok) {
      let errMsg = 'Mã sinh viên không tồn tại trên hệ thống ME.';
      try {
        const errJson = await res.json();
        if (errJson.Message) errMsg = errJson.Message;
      } catch (e) {}
      throw new Error(errMsg);
    }

    const json = await res.json();
    const studentInfo = json.data?.[0]?.[0];
    if (!studentInfo || !studentInfo.HoTen) {
      throw new Error('Hệ thống ME không tìm thấy thông tin sinh viên với MSSV: ' + mssv);
    }

    const studentName = studentInfo.HoTen.trim();
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--ok)">✅ Tìm thấy: <b>${escapeHtml(studentName)}</b>. Đang lấy lịch học trong khoảng ${range.start} đến ${range.end}…</span>`;

    const weekDates = generateWeeklyDates(range.start, range.end);
    const rawSchedules = [];

    if (!Array.isArray(json.data?.[2])) throw new Error('ME trả cấu trúc thời khóa biểu không hợp lệ.');
    rawSchedules.push(...json.data[2]);

    for (let i = 1; i < weekDates.length; i++) {
      await sleep(100);
      const wDate = `${weekDates[i]}T00:00:00+07:00`;
      const wRes = await fetch('https://tapi.lhu.edu.vn/calen/auth/XemLich_LichSinhVien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ StudentID: mssv, Ngay: wDate, PageIndex: 1, PageSize: 100 })
      });
      if (!wRes.ok) {
        let message = `ME trả lỗi HTTP ${wRes.status} ở tuần ${weekDates[i]}.`;
        try { message = (await wRes.json()).Message || message; } catch (e) {}
        throw new Error(message);
      }
      const wJson = await wRes.json();
      if (!wJson.data?.[0]?.[0]?.HoTen || !Array.isArray(wJson.data?.[2])) {
        throw new Error(`ME trả dữ liệu không đầy đủ ở tuần ${weekDates[i]}. Chưa lưu sinh viên.`);
      }
      rawSchedules.push(...wJson.data[2]);
    }

    const startBound = new Date(`${range.start}T00:00:00+07:00`).getTime();
    const endBound = new Date(`${range.end}T23:59:59+07:00`).getTime();

    const formattedList = [];
    rawSchedules.forEach(c => {
      const start = normalizeMeTime(c.ThoiGianBD);
      const end = normalizeMeTime(c.ThoiGianKT);
      const startTimeMs = new Date(start).getTime();
      if (startTimeMs >= startBound && startTimeMs <= endBound) {
        formattedList.push({
          mssv: mssv,
          subject_name: (c.TenMonHoc || 'Chưa rõ').trim(),
          room_name: (c.TenPhong || 'Online').trim(),
          teacher_name: (c.GiaoVien || '').trim(),
          start_time: start,
          end_time: end,
          day_of_week: c.Thu || 0,
          buoi: Number(c.Buoi) || null
        });
      }
    });

    const deduped = deduplicateSchedules(formattedList);
    pendingMeStudent = {
      mssv: mssv,
      name: studentName,
      schedules: deduped,
      start: range.start,
      end: range.end
    };

    document.getElementById('previewStudentName').textContent = studentName;
    document.getElementById('previewStudentMssv').textContent = `MSSV: ${mssv} · Lớp ME: ${studentInfo.TenLop || 'Chưa rõ'}`;
    document.getElementById('previewScheduleCount').textContent = `${deduped.length} tiết học tìm thấy`;
    document.getElementById('previewDateRangeNote').textContent = `Khoảng ngày đồng bộ: ${range.start} → ${range.end} (${weekDates.length} tuần)`;

    const schedListEl = document.getElementById('previewScheduleList');
    if (deduped.length === 0) {
      schedListEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:12px">Không có môn học nào trong khoảng ngày này trên ME. Vẫn có thể lưu sinh viên vào danh sách lớp.</div>';
    } else {
      const bySubject = {};
      deduped.forEach(s => {
        bySubject[s.subject_name] = (bySubject[s.subject_name] || 0) + 1;
      });
      schedListEl.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px;color:var(--text)">Các môn học tìm được (${Object.keys(bySubject).length} môn):</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">
          ${Object.entries(bySubject).map(([sub, count]) => `
            <div style="padding:6px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px">
              <b>${escapeHtml(sub)}</b>
              <div style="font-size:11px;color:var(--muted)">${count} buổi học</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (previewBox) previewBox.style.display = 'block';
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--ok)">✅ Tra cứu hoàn tất. Vui lòng kiểm tra thông tin và nhấn xác nhận bên dưới.</span>';

  } catch (err) {
    console.error('lookupStudentFromME error:', err);
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--err)">❌ ${escapeHtml(err.message)}</span>`;
    if (previewBox) previewBox.style.display = 'none';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
}

async function confirmAddStudentFromME() {
  if (!pendingMeStudent) return;
  const btn = document.getElementById('btnConfirmAddStudent');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang lưu vào Supabase…'; }

  try {
    const { data: addRes, error: addErr } = await supabase.rpc('admin_add_student', {
      p_mssv: pendingMeStudent.mssv,
      p_name: pendingMeStudent.name
    });
    if (addErr || !addRes?.ok) {
      throw new Error(addRes?.message || addErr?.message || 'Không thể thêm sinh viên vào Supabase.');
    }

    let schedMsg = '';
    if (pendingMeStudent.schedules.length > 0) {
      const { data: syncRes, error: syncErr } = await supabase.rpc('admin_sync_student_schedules_for_range', {
        p_schedules: pendingMeStudent.schedules,
        p_from_date: pendingMeStudent.start,
        p_to_date: pendingMeStudent.end,
        p_mssv: pendingMeStudent.mssv
      });
      if (syncErr || !syncRes?.ok) {
        console.warn('Lưu lịch lỗi:', syncErr || syncRes);
        schedMsg = ' (Lưu lịch gặp lỗi: ' + (syncRes?.message || syncErr?.message) + ')';
      } else {
        schedMsg = ` và lưu ${syncRes.count} tiết học`;
      }
    }

    toast('ok', 'Đã thêm sinh viên thành công!', `Đã thêm ${pendingMeStudent.name} (${pendingMeStudent.mssv})${schedMsg}.`);

    document.getElementById('inputSearchMssv').value = '';
    document.getElementById('studentMePreviewBox').style.display = 'none';
    document.getElementById('lookupMeStatus').innerHTML = '<span style="color:var(--ok)">✅ Sinh viên đã được lưu thành công vào cơ sở dữ liệu.</span>';
    pendingMeStudent = null;

    await loadStudents();
    await loadStudentsManagement();
    renderAll();

  } catch (err) {
    console.error('confirmAddStudentFromME error:', err);
    toast('err', 'Thêm sinh viên thất bại', err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
}

function cancelAddStudentPreview() {
  const previewBox = document.getElementById('studentMePreviewBox');
  if (previewBox) previewBox.style.display = 'none';
  pendingMeStudent = null;
  const statusEl = document.getElementById('lookupMeStatus');
  if (statusEl) statusEl.textContent = '';
}

function focusAddStudentMssv() {
  const input = document.getElementById('inputSearchMssv');
  if (input) {
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus();
  }
}

async function toggleStudentActive(mssv, currentActive) {
  const newActive = !currentActive;
  const actionText = newActive ? 'khôi phục' : 'ngừng hoạt động';
  if (!confirm(`Bạn có chắc chắn muốn ${actionText} sinh viên MSSV ${mssv}?`)) return;

  try {
    const { data, error } = await supabase.rpc('admin_set_student_active', {
      p_mssv: mssv,
      p_is_active: newActive
    });
    if (error || !data?.ok) throw new Error(data?.message || error?.message || 'Không thể cập nhật trạng thái.');

    toast('ok', 'Cập nhật thành công', `Sinh viên ${data.name || mssv} đã được ${actionText}.`);
    await loadStudentsManagement();
    renderAll();
  } catch (err) {
    console.error('toggleStudentActive error:', err);
    toast('err', 'Thao tác thất bại', err.message);
  }
}

async function openStudentDeleteModal(mssv) {
  const stu = students.find(s => s.mssv === mssv);
  currentDeleteTarget = { mssv, name: stu?.name || mssv };

  const modal = document.getElementById('studentDeleteModal');
  const subtitle = document.getElementById('stuDeleteModalSubtitle');
  const content = document.getElementById('stuDeleteImpactContent');
  const input = document.getElementById('stuDeleteConfirmMssv');
  const btn = document.getElementById('btnConfirmDeleteStudent');

  if (subtitle) subtitle.textContent = `Sinh viên: ${currentDeleteTarget.name} (${mssv})`;
  if (input) input.value = '';
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
  if (content) content.innerHTML = '<div style="text-align:center;padding:16px;color:var(--muted)"><span class="spin"></span> Đang kiểm tra dữ liệu liên kết trên hệ thống...</div>';

  if (modal) modal.classList.add('show');

  try {
    const { data, error } = await supabase.rpc('admin_get_student_delete_impact', { p_mssv: mssv });
    if (error || !data?.ok) throw new Error(data?.message || error?.message || 'Không thể kiểm tra tác động xóa.');

    content.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px">
        <div style="font-weight:700;margin-bottom:8px">Chi tiết dữ liệu liên kết sẽ bị xóa:</div>
        <ul style="margin:0;padding-left:20px;display:grid;gap:4px">
          <li><b>${data.schedules_count}</b> tiết lịch học đã đồng bộ (student_schedules)</li>
          <li><b>${data.leave_count}</b> đơn xin nghỉ phép (leave_requests)</li>
          <li><b>${data.group_member_count}</b> nhóm dự án đang tham gia (team_group_members)</li>
          <li><b>${data.task_assign_count}</b> nhiệm vụ được giao (team_task_assignments)</li>
          <li><b>${data.reset_req_count}</b> yêu cầu đặt lại mật khẩu (password_reset_requests)</li>
          <li><b>${data.attendance_count}</b> bản ghi điểm danh (lịch sử điểm danh giữ nguyên nhưng không còn liên kết sinh viên)</li>
        </ul>
      </div>
    `;
  } catch (err) {
    if (content) content.innerHTML = `<div style="color:var(--err)">Không thể lấy chi tiết tác động: ${escapeHtml(err.message)}</div>`;
  }
}

function closeStudentDeleteModal() {
  const modal = document.getElementById('studentDeleteModal');
  if (modal) modal.classList.remove('show');
  currentDeleteTarget = null;
}

function checkStudentDeleteConfirmInput() {
  const input = document.getElementById('stuDeleteConfirmMssv');
  const btn = document.getElementById('btnConfirmDeleteStudent');
  if (!input || !btn || !currentDeleteTarget) return;

  const matches = input.value.trim() === currentDeleteTarget.mssv;
  btn.disabled = !matches;
  btn.style.opacity = matches ? '1' : '0.5';
  btn.style.cursor = matches ? 'pointer' : 'not-allowed';
}

async function executeStudentDelete() {
  if (!currentDeleteTarget) return;
  const btn = document.getElementById('btnConfirmDeleteStudent');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang xóa…'; }

  try {
    const { data, error } = await supabase.rpc('admin_delete_student', { p_mssv: currentDeleteTarget.mssv });
    if (error || !data?.ok) throw new Error(data?.message || error?.message || 'Không thể xóa sinh viên.');

    toast('ok', 'Đã xóa sinh viên', `Đã xóa vĩnh viễn sinh viên ${currentDeleteTarget.name} (${currentDeleteTarget.mssv}).`);
    closeStudentDeleteModal();
    await loadStudents();
    await loadStudentsManagement();
    renderAll();
  } catch (err) {
    console.error('executeStudentDelete error:', err);
    toast('err', 'Xóa thất bại', err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
}

async function syncStudentScheduleSingle(mssv) {
  const range = getStoredSemesterDateRange();
  toast('info', 'Đang kết nối ME…', `Đang đồng bộ TKB MSSV ${mssv} trong khoảng ${range.start} → ${range.end}.`);

  try {
    const weekDates = generateWeeklyDates(range.start, range.end);
    const rawSchedules = [];

    for (let w = 0; w < weekDates.length; w++) {
      await sleep(100);
      const wDate = `${weekDates[w]}T00:00:00+07:00`;
      const res = await fetch('https://tapi.lhu.edu.vn/calen/auth/XemLich_LichSinhVien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ StudentID: mssv, Ngay: wDate, PageIndex: 1, PageSize: 100 })
      });
      if (!res.ok) {
        let message = `ME trả lỗi HTTP ${res.status} ở tuần ${weekDates[w]}.`;
        try { message = (await res.json()).Message || message; } catch (e) {}
        throw new Error(message);
      }
      const json = await res.json();
      if (!json.data?.[0]?.[0]?.HoTen || !Array.isArray(json.data?.[2])) {
        throw new Error(`ME trả dữ liệu không đầy đủ ở tuần ${weekDates[w]}. Lịch cũ được giữ nguyên.`);
      }
      rawSchedules.push(...json.data[2]);
    }

    const startBound = new Date(`${range.start}T00:00:00+07:00`).getTime();
    const endBound = new Date(`${range.end}T23:59:59+07:00`).getTime();

    const formatted = [];
    rawSchedules.forEach(c => {
      const sTime = normalizeMeTime(c.ThoiGianBD);
      const eTime = normalizeMeTime(c.ThoiGianKT);
      const sTimeMs = new Date(sTime).getTime();
      if (sTimeMs >= startBound && sTimeMs <= endBound) {
        formatted.push({
          mssv: mssv,
          subject_name: (c.TenMonHoc || 'Chưa rõ').trim(),
          room_name: (c.TenPhong || 'Online').trim(),
          teacher_name: (c.GiaoVien || '').trim(),
          start_time: sTime,
          end_time: eTime,
          day_of_week: c.Thu || 0,
          buoi: Number(c.Buoi) || null
        });
      }
    });

    const deduped = deduplicateSchedules(formatted);

    const { data: syncRes, error: syncErr } = await supabase.rpc('admin_sync_student_schedules_for_range', {
      p_schedules: deduped,
      p_from_date: range.start,
      p_to_date: range.end,
      p_mssv: mssv
    });

    if (syncErr || !syncRes?.ok) throw new Error(syncRes?.message || syncErr?.message || 'Lỗi lưu lịch.');

    toast('ok', 'Đồng bộ xong!', `Đã cập nhật ${syncRes.count} tiết học cho MSSV ${mssv}.`);
    await renderStudentsTable();
    await loadTodaySchoolSchedule();

  } catch (err) {
    console.error('syncStudentScheduleSingle error:', err);
    toast('err', 'Đồng bộ thất bại', err.message);
  }
}

async function syncSchedulesForConfiguredRange() {
  const range = getStoredSemesterDateRange();
  const btn = document.getElementById('btnSyncRangeME');
  const oldText = btn ? btn.innerHTML : '';
  const progressEl = document.getElementById('schedRangeSyncProgress');

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang đồng bộ…'; }
  if (progressEl) {
    progressEl.style.display = 'block';
    progressEl.innerHTML = '<span class="spin"></span> Đang khởi tạo đồng bộ khoảng ngày ' + range.start + ' đến ' + range.end + '…';
  }

  toast('info', 'Bắt đầu đồng bộ ME', `Đang đồng bộ TKB từ ${range.start} đến ${range.end} cho cả lớp.`);

  try {
    const list = students.filter(s => s.is_active !== false);
    if (!list.length) throw new Error('Không có sinh viên nào đang hoạt động để đồng bộ.');

    const weekDates = generateWeeklyDates(range.start, range.end);
    const allSchedules = [];
    let successCount = 0;
    const failedStudents = [];

    const startBound = new Date(`${range.start}T00:00:00+07:00`).getTime();
    const endBound = new Date(`${range.end}T23:59:59+07:00`).getTime();

    for (let i = 0; i < list.length; i += 5) {
      const chunk = list.slice(i, i + 5);
      if (progressEl) {
        const pct = Math.round((i / list.length) * 100);
        progressEl.innerHTML = `<span class="spin"></span> Đang xử lý: ${i}/${list.length} sinh viên (${pct}%)…`;
      }

      await Promise.all(chunk.map(async stu => {
        try {
          const stuSchedules = [];
          for (let w = 0; w < weekDates.length; w++) {
            await sleep(100);
            const wDate = `${weekDates[w]}T00:00:00+07:00`;
            const res = await fetch('https://tapi.lhu.edu.vn/calen/auth/XemLich_LichSinhVien', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
              body: JSON.stringify({ StudentID: stu.mssv, Ngay: wDate, PageIndex: 1, PageSize: 100 })
            });
            if (!res.ok) {
              let message = `ME trả lỗi HTTP ${res.status} ở tuần ${weekDates[w]}.`;
              try { message = (await res.json()).Message || message; } catch (e) {}
              throw new Error(message);
            }
            const json = await res.json();
            if (!json.data?.[0]?.[0]?.HoTen || !Array.isArray(json.data?.[2])) {
              throw new Error(`ME trả dữ liệu không đầy đủ ở tuần ${weekDates[w]}.`);
            }
            json.data[2].forEach(c => {
                  const sTime = normalizeMeTime(c.ThoiGianBD);
                  const eTime = normalizeMeTime(c.ThoiGianKT);
                  const sTimeMs = new Date(sTime).getTime();
                  if (sTimeMs >= startBound && sTimeMs <= endBound) {
                    stuSchedules.push({
                      mssv: stu.mssv,
                      subject_name: (c.TenMonHoc || 'Chưa rõ').trim(),
                      room_name: (c.TenPhong || 'Online').trim(),
                      teacher_name: (c.GiaoVien || '').trim(),
                      start_time: sTime,
                      end_time: eTime,
                      day_of_week: c.Thu || 0,
                      buoi: Number(c.Buoi) || null
                    });
                  }
            });
          }
          const dedupedStu = deduplicateSchedules(stuSchedules);
          allSchedules.push(...dedupedStu);
          successCount++;
        } catch (e) {
          failedStudents.push(stu.mssv);
          console.warn('Đồng bộ thất bại MSSV ' + stu.mssv, e);
        }
      }));
    }

    if (failedStudents.length) {
      const shown = failedStudents.slice(0, 8).join(', ');
      const more = failedStudents.length > 8 ? ` và ${failedStudents.length - 8} MSSV khác` : '';
      throw new Error(`ME đồng bộ lỗi ${failedStudents.length}/${list.length} sinh viên (${shown}${more}). Không lưu dữ liệu để giữ nguyên lịch cũ.`);
    }

    const finalDeduped = deduplicateSchedules(allSchedules);

    const { data: syncRes, error: syncErr } = await supabase.rpc('admin_sync_student_schedules_for_range', {
      p_schedules: finalDeduped,
      p_from_date: range.start,
      p_to_date: range.end,
      p_mssv: null
    });

    if (syncErr || !syncRes?.ok) {
      throw new Error(syncRes?.message || syncErr?.message || 'Lỗi khi lưu lịch vào Supabase.');
    }

    localStorage.setItem('last_me_sync_range', Date.now().toString());
    if (progressEl) {
      progressEl.innerHTML = `<span style="color:var(--ok)">✅ Đã đồng bộ thành công ${syncRes.count} tiết học trong khoảng ${range.start} → ${range.end}!</span>`;
    }
    toast('ok', 'Đồng bộ hoàn tất!', `Đã cập nhật ${syncRes.count} tiết học cho ${successCount} sinh viên. Lịch ngoài khoảng này được giữ nguyên.`);

    await loadTodaySchoolSchedule();
    return true;

  } catch (err) {
    console.error('syncSchedulesForConfiguredRange error:', err);
    if (progressEl) {
      progressEl.innerHTML = `<span style="color:var(--err)">❌ Lỗi đồng bộ: ${escapeHtml(err.message)}</span>`;
    }
    toast('err', 'Đồng bộ thất bại', err.message);
    return false;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
}

async function syncSchedulesFromME(isAuto=false,targetDate=null,preserveOtherDays=false,sourceButton=null,quietSuccess=false){
  const btn=sourceButton||document.getElementById('btnSyncME');const oldText=btn?btn.innerHTML:'';
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spin"></span> Đang đồng bộ…';}
  if(!isAuto)toast('info','Đang kết nối ME…','Đang lấy thời khóa biểu '+(targetDate?'ngày '+targetDate:'mới nhất')+' cho '+(students?.length||31)+' sinh viên.');
  try{
    const list=students?.length?students:[
      {mssv:'123000555'},{mssv:'123000078'},{mssv:'125001579'},{mssv:'124000534'},
      {mssv:'125001875'},{mssv:'124000737'},{mssv:'125001809'},{mssv:'124001238'},
      {mssv:'124001851'},{mssv:'124000354'},{mssv:'124001589'},{mssv:'125000568'},
      {mssv:'125002381'},{mssv:'123000651'},{mssv:'125001648'},{mssv:'125000372'},
      {mssv:'123000722'},{mssv:'123001058'},{mssv:'123000185'},{mssv:'123000872'},
      {mssv:'125000798'},{mssv:'123001188'},{mssv:'125000550'},{mssv:'123000432'},
      {mssv:'123000375'},{mssv:'123001394'},{mssv:'125000890'},{mssv:'125001087'},
      {mssv:'124001273'},{mssv:'122000426'},{mssv:'125001343'}
    ];
    const allSchedules=[];let successfulCalendarResponses=0;const failedCalendarStudents=[];
    const requestDate=targetDate?`${targetDate}T00:00:00+07:00`:new Date().toISOString();
    for(let i=0;i<list.length;i+=6){
      const chunk=list.slice(i,i+6);
      const results=await Promise.all(chunk.map(async student=>{
        try{
          const res=await fetch('https://tapi.lhu.edu.vn/calen/auth/XemLich_LichSinhVien',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({StudentID:student.mssv,Ngay:requestDate,PageIndex:1,PageSize:100})});
          if(!res.ok){failedCalendarStudents.push(student.mssv);return [];}
          const json=await res.json(),items=json.data?.[2];if(!Array.isArray(items)){failedCalendarStudents.push(student.mssv);return [];}
          successfulCalendarResponses++;
          return items.map(c=>{
            const normalizeTime=value=>{let time=String(value||'').trim().replace(' ','T');if(/[+-]\d{2}$/.test(time))time+=':00';if(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(time))return time;return time+'+07:00';};
            const start=normalizeTime(c.ThoiGianBD),end=normalizeTime(c.ThoiGianKT);
            return {mssv:student.mssv,subject_name:(c.TenMonHoc||'Chưa rõ').trim(),room_name:(c.TenPhong||'Online').trim(),teacher_name:(c.GiaoVien||'').trim(),start_time:start,end_time:end,day_of_week:c.Thu||0,buoi:Number(c.Buoi)||null};
          });
        }catch(e){failedCalendarStudents.push(student.mssv);console.warn('Lỗi lấy lịch MSSV '+student.mssv,e);return [];}
      }));
      results.forEach(rows=>allSchedules.push(...rows));
    }
    if(!successfulCalendarResponses)throw new Error('Không kết nối được ME hoặc ME không trả dữ liệu hợp lệ.');
    if(preserveOtherDays&&targetDate){
      if(failedCalendarStudents.length)throw new Error(`ME chưa trả đủ lịch (${failedCalendarStudents.length}/${list.length} sinh viên). Lịch cũ được giữ nguyên; hãy thử đồng bộ lại.`);
      const dateRows=allSchedules.filter(r=>r.start_time&&vietnamDateKeyFromTimestamp(r.start_time)===targetDate);
      const {data,error}=await supabase.rpc('admin_sync_student_schedules_for_date',{p_schedules:dateRows,p_date:targetDate});
      if(error||!data?.ok)throw new Error(data?.message||error?.message||'Không thể cập nhật lịch ngày đã chọn.');
      localStorage.setItem('last_me_sync_'+targetDate,Date.now().toString());
      if(!quietSuccess)toast('ok','Lịch ngày mai đã cập nhật',`Đồng bộ ${data.count} tiết học ngày ${targetDate} từ ME.`);
    }else{
      if(!allSchedules.length)throw new Error('ME không trả về lịch học để đồng bộ.');
      const {data,error}=await supabase.rpc('admin_sync_student_schedules',{p_schedules:allSchedules});
      if(error||!data?.ok)throw new Error(data?.message||error?.message||'Lỗi khi lưu vào Supabase.');
      localStorage.setItem('last_me_sync',Date.now().toString());
      toast('ok','Đã đồng bộ xong!',`Đã cập nhật ${data.count} tiết học từ ME.`);
    }
    await loadTodaySchoolSchedule();
    return true;
  }catch(err){console.error('syncSchedulesFromME error:',err);toast('err','Đồng bộ thất bại',err.message);return false;}
  finally{if(btn){btn.disabled=false;btn.innerHTML=oldText;}}
}
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
  if (!currentSession.duration_min){ txt.textContent = '∞'; chip.className = 'countdown-chip'; warnEl.classList.remove('show'); return; }
  const start = new Date(currentSession.started_at).getTime();
  const end = start + currentSession.duration_min * 60000;
  const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const warn = (currentSession.warn_before_min || 5) * 60;
  if (left === 0){
    txt.textContent = '00:00'; chip.className = 'countdown-chip danger'; warnEl.classList.add('show');
    if (!_closingSession){ _closingSession = true; toast('warn', 'Phiên đã tự đóng', 'Hết thời gian mở phiên.'); autoCloseSession(); }
    return;
  }
  txt.textContent = fmtTime(left);
  if (left <= warn){ chip.className = 'countdown-chip danger'; warnEl.classList.add('show'); }
  else if (left <= warn * 2){ chip.className = 'countdown-chip warn'; warnEl.classList.remove('show'); }
  else { chip.className = 'countdown-chip'; warnEl.classList.remove('show'); }
}
function setupRealtime(){
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); }
  realtimeChannel = supabase.channel('admin-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, async payload => {
      if (!currentSession) return;
      if (payload.new && payload.new.session_id !== currentSession.id) return;
      await loadAttendance(); renderAll();
      if (payload.eventType === 'INSERT' && payload.new.mssv && !_lastMssvSet.has(payload.new.mssv)){
        _lastMssvSet.add(payload.new.mssv);
        const s = students.find(x => x.mssv === payload.new.mssv);
        toast('ok', 'SV vừa điểm danh', (s?.name || payload.new.mssv) + ' · ' + fmtClock(new Date()));
      }
    }).subscribe();
}
function renderAll(){ updateStats(); renderTable(); renderFeed(); renderGroupsTableIfVisible(); }
async function refreshAll(){
  await loadSession();
  if (!currentSession){ showEmpty(); return; }
  const mainGrid = document.querySelector('.main-grid');
  if (mainGrid) mainGrid.style.gridTemplateColumns = '';
  const qrPanel = document.getElementById('qrPanel');
  if (qrPanel) qrPanel.style.display = '';
  const dz = document.querySelector('.danger-zone');
  if (dz) dz.style.display = 'flex';
  const btnClose = document.getElementById('btnCloseSession');
  if (btnClose) btnClose.style.display = '';
  const btnReopen = document.getElementById('btnReopenSession');
  if (btnReopen) btnReopen.style.display = 'none';
  const btnBack = document.getElementById('btnBackToActive');
  if (btnBack) btnBack.style.display = 'none';
  const chip = document.getElementById('countdownChip');
  if (chip) chip.style.display = 'inline-flex';
  const sPill = document.getElementById('sessionBarPill');
  if (sPill) {
    sPill.className = 'session-pill pill-on';
    sPill.innerHTML = '<span class="net-dot"></span>Đang mở';
  }
  const topbarPill = document.getElementById('topbarSessionPill');
  if (topbarPill) {
    topbarPill.className = 'session-pill pill-on';
    topbarPill.innerHTML = '<span class="net-dot"></span><span>Đang mở</span>';
  }
  showDashboard();
  switchSessionTab('students');
  document.getElementById('sessionBarName').textContent = currentSession.session_name;
  document.getElementById('sessionStartTime').textContent = new Date(currentSession.started_at).toLocaleString('vi-VN');
  document.getElementById('sessionIdDisplay').textContent = String(currentSession.id).slice(0, 8);
  document.getElementById('sessionDurationDisplay').textContent = currentSession.duration_min ? currentSession.duration_min + ' phút' : 'Không giới hạn';
  const lateDisp = document.getElementById('sessionLateDisplay');
  if (lateDisp) {
    const lateVal = currentSession.warn_before_min || localStorage.getItem('admin_late_minutes') || 15;
    lateDisp.textContent = lateVal + ' phút';
  }
  _lastMssvSet = new Set();
  await loadAttendance();
  Object.keys(attendanceMap).forEach(m => _lastMssvSet.add(m));
  renderQR(); renderAll(); startCountdown();
  _closingSession = false;
}

window.backFromPastSession = async function() {
  window._isViewingPastSession = false;
  window._currentViewingSessionId = null;
  await loadSession();
  if (currentSession && currentSession.id) {
    await refreshAll();
  } else {
    showEmpty();
    const rCard = document.getElementById('attendanceReportCard');
    if (rCard) rCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

window.viewPastSession = async function(sid, forceRefresh = false) {
  if (!sid) return;

  // 1. Tìm thông tin phiên điểm danh
  let sess = window._todaySessionsMap ? window._todaySessionsMap[sid] : null;
  if (!sess) {
    const { data } = await supabase.from('sessions').select('*').eq('id', sid).maybeSingle();
    sess = data;
  }
  if (!sess) {
    toast('warn', 'Không tìm thấy phiên', 'Không thể tải thông tin phiên điểm danh này.');
    return;
  }

  // 2. Chuyển sang xem phiên trên toàn trang Dashboard to đầy đủ
  window._isViewingPastSession = true;
  window._currentViewingSessionId = String(sid);
  currentSession = sess;

  // Cấu hình giao diện to (Full Dashboard): Ẩn QR, dàn đều 100% chiều rộng
  const mainGrid = document.querySelector('.main-grid');
  if (mainGrid) mainGrid.style.gridTemplateColumns = '1fr';
  const qrPanel = document.getElementById('qrPanel');
  if (qrPanel) qrPanel.style.display = 'none';
  const dz = document.querySelector('.danger-zone');
  if (dz) dz.style.display = 'none';
  const btnClose = document.getElementById('btnCloseSession');
  if (btnClose) btnClose.style.display = 'none';
  const btnReopen = document.getElementById('btnReopenSession');
  if (btnReopen) btnReopen.style.display = sess.is_open ? 'none' : 'inline-flex';
  const btnBack = document.getElementById('btnBackToActive');
  if (btnBack) {
    btnBack.style.display = 'inline-flex';
    btnBack.innerHTML = '← Quay lại danh sách';
  }
  const chip = document.getElementById('countdownChip');
  if (chip) chip.style.display = 'none';

  const sPill = document.getElementById('sessionBarPill');
  if (sPill) {
    sPill.className = sess.is_open ? 'session-pill pill-on' : 'session-pill pill-off';
    sPill.innerHTML = sess.is_open ? '<span class="net-dot"></span>Đang mở' : '<span class="net-dot"></span>Đã đóng';
  }

  const nameEl = document.getElementById('sessionBarName');
  if (nameEl) nameEl.textContent = sess.session_name || 'Phiên điểm danh';
  const startEl = document.getElementById('sessionStartTime');
  if (startEl) startEl.textContent = sess.started_at ? new Date(sess.started_at).toLocaleString('vi-VN') : '—';
  const idEl = document.getElementById('sessionIdDisplay');
  if (idEl) idEl.textContent = String(sess.id).slice(0, 8);
  const durEl = document.getElementById('sessionDurationDisplay');
  if (durEl) durEl.textContent = sess.duration_min ? sess.duration_min + ' phút' : 'Không giới hạn';
  const lateDisp = document.getElementById('sessionLateDisplay');
  if (lateDisp) lateDisp.textContent = (sess.warn_before_min || 15) + ' phút';

  // Hiển thị Dashboard to
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.style.display = 'none';
  const dashboard = document.getElementById('dashboard');
  if (dashboard) dashboard.style.display = 'block';

  // Nạp dữ liệu điểm danh và hiển thị đầy đủ bảng sinh viên, bộ lọc, phân trang
  _lastMssvSet = new Set();
  await loadAttendance();
  Object.keys(attendanceMap).forEach(m => _lastMssvSet.add(m));
  renderAll();
  switchSessionTab('students');

  // Cuộn mượt lên đầu dashboard to để người dùng xem và chỉnh sửa
  if (!forceRefresh) {
    dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('info', 'Xem toàn trang', `Đang mở toàn trang phiên: "${sess.session_name}"`);
  }
};

function formatPastSessionDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(date);
}

function getAttendanceExportStatus(status, category) {
  return status === 'vắng có phép' && (category === 'Học trường' || category === 'Lịch ngoài') ? 'Đi học' : status;
}

function getAttendanceExportCategory(category) {
  return category === 'Xưởng' ? 'Chưa quét' : (category || '—');
}
window.getAttendanceExportCategory = getAttendanceExportCategory;

function applyAttendanceExportRowFill(worksheet, rowIndex, status, category, columnCount) {
  let rgb;
  if (status === 'vắng không phép') rgb = 'F4CCCC';
  else if (status === 'đi muộn') rgb = 'FFF2CC';
  else if (category === 'Học trường' || category === 'Lịch ngoài') rgb = 'D9EAD3';
  if (!rgb) return;

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
    const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    const cell = worksheet[address];
    if (cell) {
      cell.s = { ...(cell.s || {}), fill: { patternType: 'solid', fgColor: { rgb } } };
    }
  }
}

window.exportPastSessionExcel = async function(sid, button) {
  const oldText = button?.innerHTML || '';
  if (button) { button.disabled = true; button.textContent = 'Đang xuất...'; }
  try {
    if (typeof XLSX === 'undefined') await loadSheetJS();

    const [{ data: attData, error: attError }, { data: sessionData }] = await Promise.all([
      supabase.from('attendance')
        .select('mssv,full_name,status,category,note,created_at')
        .eq('session_id', sid)
        .order('mssv'),
      supabase.from('sessions')
        .select('session_name,started_at,is_open')
        .eq('id', sid)
        .maybeSingle()
    ]);

    if (attError) throw attError;

    const session = sessionData || window._todaySessionsMap?.[sid] || {};
    const sessionName = session.session_name || 'Phiên điểm danh';
    const startedTime = session.started_at ? new Date(session.started_at).toLocaleString('vi-VN') : '—';

    const rowsByMssv = new Map((attData || []).map(row => [String(row.mssv), row]));
    const studentByMssv = new Map((students || []).map(student => [String(student.mssv), student]));
    (attData || []).forEach(row => {
      if (!studentByMssv.has(String(row.mssv))) studentByMssv.set(String(row.mssv), { mssv: row.mssv, name: row.full_name || row.mssv });
    });
    const studentList = Array.from(studentByMssv.values()).sort((a, b) =>
      String(a.name || a.mssv).localeCompare(String(b.name || b.mssv), 'vi')
    );

    let countPresent = 0, countLate = 0, countExcused = 0, countUnexcused = 0;
    const tableRows = studentList.map((student, idx) => {
      const row = rowsByMssv.get(String(student.mssv));
      const st = row?.status || 'Chưa điểm danh';
      if (st === 'có mặt') countPresent++;
      else if (st === 'đi muộn') countLate++;
      else if (st === 'vắng có phép') countExcused++;
      else if (st === 'vắng không phép') countUnexcused++;

      return [
        idx + 1,
        String(student.mssv || ''),
        String(student.name || row?.full_name || student.mssv || ''),
        getAttendanceExportStatus(st, row?.category),
        (st === 'có mặt' || st === 'đi muộn' || st === 'vắng có phép') && row?.created_at ? formatPastSessionDateTime(row.created_at) : '—',
        getAttendanceExportCategory(row?.category),
        row?.note || '—'
      ];
    });

    const totalSv = studentList.length;
    const attended = countPresent + countLate;
    const pRate = totalSv ? Math.round(attended * 100 / totalSv) : 0;

    const sheetData = [
      ['BÁO CÁO ĐIỂM DANH PHIÊN - ĐỘI ROBOCON & XƯỞNG'],
      ['Tên phiên:', sessionName, 'Thời gian mở:', startedTime, 'Trạng thái:', session.is_open ? 'Đang mở' : 'Đã đóng'],
      ['Tổng SV:', totalSv, 'Có mặt:', countPresent, 'Đi muộn:', countLate, 'Có phép:', countExcused, 'Không phép:', countUnexcused, 'Tỉ lệ chuyên cần:', pRate + '%'],
      [],
      ['STT', 'MSSV', 'Họ và tên', 'Trạng thái', 'Thời gian điểm danh', 'Phân loại', 'Ghi chú'],
      ...tableRows
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    worksheet['!cols'] = [{ wch: 6 }, { wch: 15 }, { wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 30 }];
    worksheet['!autofilter'] = { ref: 'A5:G' + Math.max(5, sheetData.length) };
    studentList.forEach((student, idx) => {
      const row = rowsByMssv.get(String(student.mssv));
      applyAttendanceExportRowFill(worksheet, 5 + idx, row?.status, row?.category, 7);
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Điểm danh');

    const safeName = sessionName.replace(/[<>:\"\/\\|?*]/g, '_').slice(0, 60);
    const dateStamp = session.started_at ? new Date(session.started_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `DiemDanh_${safeName}_${dateStamp}.xlsx`);
    toast('ok', 'Đã xuất file Excel', `Đã tải về file "DiemDanh_${safeName}_${dateStamp}.xlsx".`);
  } catch (error) {
    toast('err', 'Xuất Excel thất bại', error.message || 'Không tạo được file .xlsx.');
  } finally {
    if (button) { button.disabled = false; button.innerHTML = oldText; }
  }
};
function runAdminStartupTask(name, task, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} phản hồi quá lâu.`)), 12000);
  });
  return Promise.race([task, timeout]).catch(error => {
    console.error(`[admin startup] ${name}:`, error);
    if (onTimeout) onTimeout(error);
  }).finally(() => clearTimeout(timer));
}

document.addEventListener('DOMContentLoaded', async () => {
  let user;
  try {
    user = await runAdminStartupTask('Xác thực tài khoản', checkAuth(), error => {
      const subtitle = document.getElementById('heroSessionSubtitle');
      if (subtitle) subtitle.textContent = 'Không kết nối được máy chủ xác thực. Vui lòng tải lại trang.';
      const rules = document.getElementById('roboconRulesList');
      if (rules) rules.innerHTML = '<div class="schedule-loading">Máy chủ xác thực phản hồi quá lâu. Vui lòng tải lại trang.</div>';
      const tasks = document.getElementById('overviewGroupTasksSummary');
      if (tasks) tasks.textContent = 'Chưa xác thực được tài khoản nên chưa thể tải nhiệm vụ.';
      const total = document.getElementById('kpiTotalStudents');
      if (total) total.textContent = '—';
    });
  } catch (error) {
    console.error('[admin startup] authentication failed:', error);
    return;
  }
  if (!user) return;

  const rulesContainer = document.getElementById('roboconRulesList');
  runAdminStartupTask('Nội quy xưởng', loadRoboconRules(), error => {
    if (rulesContainer) rulesContainer.innerHTML = `<div class="schedule-loading">${escapeHtml(error.message)} Vui lòng thử tải lại.</div>`;
  });

  runAdminStartupTask('Danh sách sinh viên và nhóm', (async () => {
    await loadStudents();
    await loadSemesterSettings();
    const kpiTotalEl = document.getElementById('kpiTotalStudents');
    if (kpiTotalEl) kpiTotalEl.textContent = students.filter(s => s.is_active !== false).length;
    await loadTeamGroups();
    if (teamAvailabilityTimer) clearInterval(teamAvailabilityTimer);
    teamAvailabilityTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadTeamGroups();
    }, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadTeamGroups();
    });
    renderAll();
  })(), error => toast('err', 'Tải dữ liệu chậm', escapeHtml(error.message)));

  runAdminStartupTask('Phiên điểm danh', refreshAll(), error => {
    const subtitle = document.getElementById('heroSessionSubtitle');
    if (subtitle) subtitle.textContent = `${error.message} Vui lòng thử tải lại.`;
  });
  runAdminStartupTask('Lịch sử điểm danh', loadTodayHistory());
  runAdminStartupTask('Lịch học hôm nay', loadTodaySchoolSchedule());
  runAdminStartupTask('Nhiệm vụ chung', loadOverviewGroupTasks(), error => {
    const summary = document.getElementById('overviewGroupTasksSummary');
    if (summary) summary.textContent = `${error.message} Vui lòng thử tải lại.`;
  });
  runAdminStartupTask('Yêu cầu đặt lại mật khẩu', fetchResetRequests());
  setupRealtime();

  // Tự động kiểm tra và đồng bộ ngầm từ ME nếu dữ liệu cũ hơn 24 giờ
  const lastSync = parseInt(localStorage.getItem('last_me_sync') || '0', 10);
  if (Date.now() - lastSync > 24 * 3600 * 1000) {
    setTimeout(() => syncSchedulesFromME(true), 2500);
  }

  document.getElementById('filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter');
    if (!btn) return;
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    currentPage = 1;
    renderTable();
  });
  document.getElementById('searchInput').addEventListener('input', e => {
    currentSearch = e.target.value.trim();
    currentPage = 1;
    renderTable();
  });
  document.getElementById('pagerSize').addEventListener('change', e => {
    pageSize = parseInt(e.target.value, 10);
    currentPage = 1;
    renderTable();
  });
  document.getElementById('pagerPrev').addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderTable(); });
  document.getElementById('pagerNext').addEventListener('click', () => { currentPage++; renderTable(); });

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

  pollTimer = setInterval(() => { if (currentSession) loadAttendance().then(renderAll); }, 30000);

  // Cleanup khi tab bị đóng/navigate đi
  window.addEventListener('beforeunload', () => {
    clearInterval(countdownTimer);
    clearInterval(pollTimer);
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  });
});

function renderGroupsTableIfVisible(){
  const panel = document.getElementById('groupsTabPanel');
  if (panel && panel.style.display !== 'none') {
    renderGroupsTable();
  }
}

function renderGroupsTable(){
  const tbody = document.getElementById('groupsTbody');
  if (!tbody) return;

  if (!teamGroups.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">Chưa có nhóm nào</td></tr>';
    return;
  }

  const names = Object.fromEntries(students.map(s => [s.mssv, s.name]));
  const rows = teamGroups.map(team => {
    const memberMssvs = teamMembersCache.get(team.id) || [];
    const leaderName = names[team.leader_mssv] || 'Chưa chọn';
    
    let present = 0, late = 0, absent = 0, excused = 0, unmarked = 0;
    memberMssvs.forEach(mssv => {
      const a = attendanceMap[mssv];
      if (!a) unmarked++;
      else if (a.status === 'có mặt') present++;
      else if (a.status === 'đi muộn') late++;
      else if (a.status === 'vắng có phép') excused++;
      else absent++;
    });
    
    const total = memberMssvs.length;
    const rate = total ? Math.round(((present + late) / total) * 100) : 0;
    const rateColor = rate >= 80 ? 'var(--ok)' : (rate >= 50 ? 'var(--warn)' : 'var(--err)');
    
    return '<tr style="cursor:pointer" onclick="openGroupDetail(\'' + escapeJsAttr(team.id) + '\')">' +
      '<td>' +
        '<div style="font-weight:700">' + escapeHtml(team.name) + '</div>' +
        '<div style="font-size:11px;color:var(--muted)">' + escapeHtml(team.field) + ' · ĐT: ' + escapeHtml(leaderName) + '</div>' +
      '</td>' +
      '<td class="td-mono" style="font-weight:700">' + total + '</td>' +
      '<td class="td-mono" style="color:var(--ok);font-weight:700">' + present + '</td>' +
      '<td class="td-mono" style="color:var(--warn);font-weight:700">' + late + '</td>' +
      '<td class="td-mono" style="color:var(--err);font-weight:700">' + absent + '</td>' +
      '<td class="td-mono" style="color:var(--info);font-weight:700">' + excused + '</td>' +
      '<td class="td-mono" style="color:var(--muted);font-weight:700">' + unmarked + '</td>' +
      '<td><span style="color:' + rateColor + ';font-weight:800;font-size:13px">' + rate + '%</span></td>' +
    '</tr>';
  }).join('');

  tbody.innerHTML = rows || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">Không có dữ liệu</td></tr>';
}

function openGroupDetail(teamId){
  const team = teamGroups.find(t => t.id === teamId);
  if (!team) return;
  
  const memberMssvs = teamMembersCache.get(teamId) || [];
  const names = Object.fromEntries(students.map(s => [s.mssv, s.name]));
  const panel = document.getElementById('groupDetailPanel');
  
  const rows = memberMssvs.map(mssv => {
    const a = attendanceMap[mssv];
    const rawStatus = a?.status || 'unmarked';
    const selClass = rawStatus === 'có mặt' ? 'st-ok' : (rawStatus === 'đi muộn' ? 'st-late' : (rawStatus === 'vắng có phép' ? 'st-warn' : (rawStatus === 'unmarked' ? 'st-none' : 'st-no')));
    const methodRow = renderAttendanceMethodBadge(a);
    const timeHtml = a?.time || '—';
    
    return '<tr>' +
      '<td><div class="student-cell"><div class="avt">' + (names[mssv]?.trim().slice(-1) || '?') + '</div><div><div class="td-name">' + escapeHtml(names[mssv] || mssv) + '</div>' + methodRow + '</div></div></td>' +
      '<td class="td-mono">' + escapeHtml(mssv) + '</td>' +
      '<td><select class="status-select ' + selClass + '" onchange="promptChangeStatus(\'' + mssv + '\', this.value, this)">' +
        (rawStatus==='unmarked' ? '<option value="" selected disabled>— Chọn —</option>' : '') +
        '<option value="có mặt" ' + (rawStatus==='có mặt'?'selected':'') + '>Có mặt</option>' +
        '<option value="đi muộn" ' + (rawStatus==='đi muộn'?'selected':'') + '>Đi muộn</option>' +
        '<option value="vắng có phép" ' + (rawStatus==='vắng có phép'?'selected':'') + '>Vắng có phép</option>' +
        '<option value="vắng không phép" ' + (rawStatus==='vắng không phép'?'selected':'') + '>Vắng không phép</option>' +
      '</select></td>' +
      '<td class="td-mono">' + timeHtml + '</td>' +
    '</tr>';
  }).join('');

  let present = 0, late = 0, absent = 0, excused = 0, unmarked = 0;
  memberMssvs.forEach(mssv => {
    const a = attendanceMap[mssv];
    if (!a) unmarked++;
    else if (a.status === 'có mặt') present++;
    else if (a.status === 'đi muộn') late++;
    else if (a.status === 'vắng có phép') excused++;
    else absent++;
  });
  const total = memberMssvs.length;
  const rate = total ? Math.round(((present + late) / total) * 100) : 0;

  panel.style.display = 'block';
  panel.innerHTML = '<div class="card" style="padding:16px 20px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
      '<div>' +
        '<div style="font-size:15px;font-weight:800">👥 ' + escapeHtml(team.name) + ' <span style="font-size:12px;font-weight:500;color:var(--muted)">(' + team.field + ')</span></div>' +
        '<div style="font-size:11.5px;color:var(--muted);margin-top:2px">Đội trưởng: ' + escapeHtml(names[team.leader_mssv] || 'Chưa chọn') + ' · Tổng: ' + total + ' thành viên · Tỷ lệ: <b style="color:' + (rate >= 80 ? 'var(--ok)' : (rate >= 50 ? 'var(--warn)' : 'var(--err)')) + '">' + rate + '%</b></div>' +
      '</div>' +
      '<button class="btn btn-secondary" onclick="closeGroupDetail()">✕ Đóng</button>' +
    '</div>' +
    '<div class="tbl-wrap">' +
      '<div class="tbl-scroll">' +
        '<table><thead><tr><th style="width:40%">Sinh viên</th><th style="width:18%">MSSV</th><th style="width:24%">Trạng thái</th><th style="width:18%">Thời gian</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>' +
    '</div>' +
  '</div>';
  
  // Scroll to detail panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeGroupDetail(){
  const panel = document.getElementById('groupDetailPanel');
  if (panel) {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }
}

