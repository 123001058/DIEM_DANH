/**
 * DIEM_DANH — js/admin-roles.js
 * Panel "Nhóm & Phân quyền" dùng chung cho ADMIN và LEADER/DEPUTY.
 *
 * Admin   : tạo nhóm, thêm/gỡ thành viên, cấp đội trưởng chính
 * Leader/Deputy : cấp đội phó, đặt lại thành viên — trong nhóm của mình
 */

let adminTeams = [];
let adminUsers = [];
let _rolesCurrentUserRole = null; // 'admin' | 'leader' | 'deputy'
let _studentsMap = {};             // mssv → name (từ students.json)

// ============================================================
// MỞ / ĐÓNG PANEL
// ============================================================
async function showRolesPanel() {
  const p = document.getElementById('rolesPanel');
  if (!p) return;
  p.style.display = 'block';
  p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  await loadAdminRoles();
}

function hideRolesPanel() {
  const p = document.getElementById('rolesPanel');
  if (p) p.style.display = 'none';
}

function showAdminAlert(msg, type = 'info') {
  const el = document.getElementById('adminRolesAlert');
  if (!el) return alert(msg);
  el.className = 'rk-alert show rk-alert-' + type;
  el.innerText = msg;
  setTimeout(() => { el.className = 'rk-alert'; }, 5000);
}

// ============================================================
// TẢI DỮ LIỆU
// ============================================================
async function loadAdminRoles() {
  // Lấy role hiện tại nếu chưa có
  if (!_rolesCurrentUserRole) {
    const auth = await getCurrentAuth();
    _rolesCurrentUserRole = auth?.role || 'student';
  }
  // Tải students.json một lần để đồng bộ tên
  if (!Object.keys(_studentsMap).length) {
    try {
      const res = await fetch('students.json');
      const json = await res.json();
      (json.students || []).forEach((s) => {
        if (s.mssv) _studentsMap[String(s.mssv).trim()] = s.name;
      });
    } catch (e) {
      console.warn('[loadAdminRoles] Không tải được students.json', e);
    }
  }
  await loadAdminTeams();
  await loadAdminUsers();
}

async function loadAdminTeams() {
  const box = document.getElementById('adminTeamList');
  try {
    const { teams } = await fetchMyTeams();
    adminTeams = teams;
    renderAdminTeams();
  } catch (e) {
    console.error('[loadAdminTeams]', e);
    if (box) box.innerHTML = '<div class="rk-empty">Không tải được danh sách nhóm.</div>';
  }
}

async function loadAdminUsers() {
  const box = document.getElementById('adminUserList');
  try {
    // leader/deputy dùng RPC list_team_users (nhóm mình), admin dùng admin_list_users
    let users = [];
    if (_rolesCurrentUserRole === 'admin') {
      const { data, error } = await supabase.rpc('admin_list_users');
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Không có quyền.');
      users = Array.isArray(data.users) ? data.users : [];
    } else {
      // Leader/deputy: lấy toàn bộ user thông qua get_team_availability của tất cả nhóm mình quản lý
      const { data: teamsData } = await supabase.rpc('my_teams');
      const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];
      const seen = new Set();
      for (const t of teams) {
        const { data: av } = await supabase.rpc('get_team_availability', { p_team_id: t.id });
        (av?.members || []).forEach((m) => {
          if (!seen.has(m.user_id)) {
            seen.add(m.user_id);
            users.push({
              user_id: m.user_id,
              username: m.username,
              full_name: m.full_name,
              mssv: m.mssv,
              role: m.role,
              team_id: t.id,
              team_name: t.name,
              team_role: m.team_role || 'member',
            });
          }
        });
      }
    }

    // Đồng bộ tên từ students.json theo MSSV
    users = users.map((u) => {
      if (u.mssv && _studentsMap[String(u.mssv).trim()]) {
        return { ...u, full_name: _studentsMap[String(u.mssv).trim()] };
      }
      return u;
    });

    adminUsers = users;
    renderAdminUsers();
  } catch (e) {
    console.error('[loadAdminUsers]', e);
    if (box) box.innerHTML = '<div class="rk-empty">Không tải được danh sách tài khoản.</div>';
  }
}

// ============================================================
// TẠO NHÓM (chỉ Admin)
// ============================================================
async function adminCreateTeam() {
  const name = document.getElementById('newTeamName')?.value.trim();
  const desc = document.getElementById('newTeamDesc')?.value.trim();
  if (!name) return showAdminAlert('Vui lòng nhập tên nhóm.', 'err');

  const { data, error } = await supabase.rpc('admin_create_team', {
    p_name: name,
    p_description: desc || null,
  });

  if (error || !data?.ok) {
    return showAdminAlert(data?.message || error?.message || 'Không tạo được nhóm.', 'err');
  }

  document.getElementById('newTeamName').value = '';
  document.getElementById('newTeamDesc').value = '';
  showAdminAlert('✓ Đã tạo nhóm "' + name + '".', 'ok');
  await loadAdminTeams();
}

// ============================================================
// HIỂN THỊ DANH SÁCH NHÓM
// ============================================================
function renderAdminTeams() {
  const box = document.getElementById('adminTeamList');
  if (!box) return;

  if (!adminTeams.length) {
    box.innerHTML = '<div class="rk-empty">Chưa có nhóm nào.</div>';
    return;
  }

  let html = '<div class="rk-table-wrap"><table class="rk-table">' +
    '<thead><tr><th>Tên nhóm</th><th>Mô tả</th><th>Đội trưởng</th>' +
    '<th style="text-align:right;">Thao tác</th></tr></thead><tbody>';

  const isAdmin = _rolesCurrentUserRole === 'admin';
  const canManage = isAdmin || _rolesCurrentUserRole === 'leader' || _rolesCurrentUserRole === 'deputy';

  adminTeams.forEach((t) => {
    const leader = adminUsers.find((u) => u.user_id === t.leader_id);
    const leaderName = leader
      ? (leader.full_name || leader.username)
      : '<span class="rk-muted">Chưa cấp quyền</span>';
    const memberCount = adminUsers.filter((u) => u.team_id === t.id).length;

    html += '<tr>';
    html += `<td><b>${escapeHtml(t.name)}</b><div class="rk-muted">${memberCount} thành viên</div></td>`;
    html += `<td class="rk-muted">${t.description ? escapeHtml(t.description) : '—'}</td>`;
    html += `<td>${leader ? escapeHtml(leaderName) : leaderName}</td>`;
    html += '<td><div class="rk-actions">';

    if (canManage) {
      html += `<button class="rk-btn rk-btn-sm" onclick="adminAddMember('${t.id}')">＋ Thêm thành viên</button>`;
    }
    if (isAdmin) {
      if (t.leader_id) {
        html += `<button class="rk-btn rk-btn-sm rk-btn-err" onclick="adminRevokeLeader('${t.id}')">Thu hồi ĐT</button>`;
      }
      html += `<button class="rk-btn rk-btn-sm rk-btn-err" onclick="adminDeleteTeam('${t.id}','${escapeHtml(t.name)}')">🗑 Xóa nhóm</button>`;
    }

    html += '</div></td></tr>';
  });

  html += '</tbody></table></div>';
  box.innerHTML = html;
}

// ============================================================
// THÊM / GỠ THÀNH VIÊN (Admin)
// ============================================================
async function adminAddMember(teamId) {
  // Hiện modal chọn thành viên inline
  const team = adminTeams.find((t) => t.id === teamId);
  if (!team) return;

  const candidates = adminUsers.filter((u) => !u.team_id && u.role !== 'admin');
  if (!candidates.length) return showAdminAlert('Tất cả tài khoản đã thuộc một nhóm.', 'info');

  showPickerModal(
    `Thêm thành viên vào nhóm "${team.name}"`,
    candidates,
    async (userId) => {
      const { data, error } = await supabase.rpc('team_add_member', {
        p_team_id: teamId,
        p_user_id: userId,
      });
      if (error || !data?.ok) return showAdminAlert(data?.message || error?.message || 'Không thêm được.', 'err');
      showAdminAlert('✓ ' + (data.message || 'Đã thêm thành viên.'), 'ok');
      await loadAdminRoles();
    }
  );
}

async function adminRemoveMember(teamId, userId) {
  if (!confirm('Gỡ thành viên này khỏi nhóm?')) return;
  const { data, error } = await supabase.rpc('team_remove_member', {
    p_team_id: teamId,
    p_user_id: userId,
  });
  if (error || !data?.ok) return showAdminAlert(data?.message || error?.message || 'Không gỡ được.', 'err');
  showAdminAlert('✓ ' + (data.message || 'Đã gỡ thành viên.'), 'ok');
  await loadAdminRoles();
}

// ============================================================
// THU HỒI ĐỘI TRƯỞNG (Admin)
// ============================================================
async function adminRevokeLeader(teamId) {
  const team = adminTeams.find((t) => t.id === teamId);
  if (!team) return;
  if (!confirm('Thu hồi quyền Đội trưởng của nhóm "' + team.name + '"?')) return;

  const { data, error } = await supabase.rpc('admin_revoke_leader', { p_team_id: teamId });
  if (error || !data?.ok) return showAdminAlert(data?.message || error?.message || 'Không thu hồi được.', 'err');
  showAdminAlert('✓ ' + (data.message || 'Đã thu hồi.'), 'ok');
  await loadAdminRoles();
}

// ============================================================
// XÓA NHÓM (Admin)
// ============================================================
async function adminDeleteTeam(teamId, teamName) {
  const members = adminUsers.filter((u) => u.team_id === teamId);
  if (members.length > 0) {
    return showAdminAlert(`Nhóm "${teamName}" còn ${members.length} thành viên. Gỡ hết trước khi xóa.`, 'err');
  }
  if (!confirm(`Bạn có chắc muốn XÓA nhóm "${teamName}"?\nHành động này không thể hoàn tác.`)) return;

  const { data, error } = await supabase.rpc('admin_delete_team', { p_team_id: teamId });
  if (error || !data?.ok) return showAdminAlert(data?.message || error?.message || 'Không xóa được nhóm.', 'err');
  showAdminAlert(`✓ Đã xóa nhóm "${teamName}".`, 'ok');
  await loadAdminRoles();
}

// ============================================================
// DANH SÁCH TÀI KHOẢN & DROPDOWN VAI TRÒ INLINE
// ============================================================
function renderAdminUsers() {
  const box = document.getElementById('adminUserList');
  if (!box) return;

  if (!adminUsers.length) {
    box.innerHTML = '<div class="rk-empty">Không có tài khoản nào.</div>';
    return;
  }

  const isAdmin = _rolesCurrentUserRole === 'admin';
  const canManage = isAdmin || _rolesCurrentUserRole === 'leader' || _rolesCurrentUserRole === 'deputy'; = (role) => {
    const cls = role === 'admin'   ? 'chip-admin'
              : role === 'leader'  ? 'chip-leader'
              : role === 'deputy'  ? 'chip-deputy'
              : 'chip-student';
    return `<span class="rk-role-chip ${cls}">${ROLE_LABELS[role] || role}</span>`;
  };

  const teamRoleBadge = (teamRole) => {
    const cls = teamRole === 'leader' ? 'chip-leader'
              : teamRole === 'deputy' ? 'chip-deputy'
              : 'chip-student';
    return `<span class="rk-role-chip ${cls}" style="font-size:11px;">${TEAM_ROLE_LABELS[teamRole] || teamRole}</span>`;
  };

  let html = '<div class="rk-table-wrap"><table class="rk-table">' +
    '<thead><tr><th>Họ tên</th><th>MSSV</th><th>Vai trò hệ thống</th>' +
    '<th>Nhóm</th><th>Vai trò nhóm</th><th style="text-align:right;">Thao tác</th></tr></thead><tbody>';

  adminUsers.forEach((u) => {
    const team = adminTeams.find((t) => t.id === u.team_id);
    const isThisTeamLeader = team && team.leader_id === u.user_id;
    const currentTeamRole = u.team_role || (isThisTeamLeader ? 'leader' : 'member');

    html += '<tr>';
    html += `<td><b>${escapeHtml(u.full_name || '—')}</b><div class="rk-muted" style="font-size:11.5px;">${escapeHtml(u.username)}</div></td>`;
    html += `<td class="rk-muted">${u.mssv ? escapeHtml(u.mssv) : '—'}</td>`;
    html += `<td>${roleBadge(u.role)}</td>`;
    html += `<td class="rk-muted">${u.team_name ? escapeHtml(u.team_name) : '—'}</td>`;

    // Cột vai trò nhóm — dropdown inline nếu có quyền
    html += '<td>';
    if (u.team_id && u.role !== 'admin') {
      // Admin cấp được tất cả; leader/deputy chỉ cấp deputy/member (không cấp leader)
      const canChangeRole = isAdmin || (u.team_id && _rolesCurrentUserRole !== 'student');
      if (canChangeRole) {
        html += `<select class="role-inline-select ${currentTeamRole}"
          onchange="setMemberRoleInline('${u.team_id}','${u.user_id}',this)"
          title="Đổi vai trò trong nhóm">`;
        if (isAdmin) {
          html += `<option value="leader" ${currentTeamRole === 'leader' ? 'selected' : ''}>👑 Đội trưởng</option>`;
        }
        html += `<option value="deputy" ${currentTeamRole === 'deputy' ? 'selected' : ''}>🥈 Đội phó</option>`;
        html += `<option value="member" ${currentTeamRole === 'member' ? 'selected' : ''}>👤 Thành viên</option>`;
        html += `</select>`;
      } else {
        html += teamRoleBadge(currentTeamRole);
      }
    } else {
      html += '<span class="rk-muted">—</span>';
    }
    html += '</td>';

    // Thao tác: leader/deputy cũng gỡ được thành viên thường
    html += '<td><div class="rk-actions">';
    if (u.team_id && u.role !== 'admin' && !isThisTeamLeader && canManage) {
      html += `<button class="rk-btn rk-btn-sm rk-btn-err" ` +
        `onclick="adminRemoveMember('${u.team_id}','${u.user_id}')">Gỡ khỏi nhóm</button>`;
    }
    html += '</div></td></tr>';
  });

  html += '</tbody></table></div>';
  box.innerHTML = html;
}

// ============================================================
// ĐỔI VAI TRÒ NHÓM BẰNG DROPDOWN INLINE
// ============================================================
async function setMemberRoleInline(teamId, userId, selectEl) {
  const newRole = selectEl.value;
  const oldRole = selectEl.dataset.prev || selectEl.querySelector('option[selected]')?.value || '';

  // Xác nhận trước khi cấp leader (quan trọng)
  if (newRole === 'leader') {
    const u = adminUsers.find((x) => x.user_id === userId);
    if (!confirm(`Cấp quyền ĐỘI TRƯỞNG CHÍNH cho ${u?.full_name || 'người này'}?\nĐội trưởng cũ (nếu có) sẽ trở thành thành viên.`)) {
      selectEl.value = oldRole;
      return;
    }
  }

  selectEl.disabled = true;
  try {
    // Gọi RPC đã chốt: leader_set_member_role(p_team_id, p_user_id, p_new_role)
    // với p_new_role = 'leader' | 'deputy' | 'member'
    const { data, error } = await supabase.rpc('leader_set_member_role', {
      p_team_id: teamId,
      p_user_id: userId,
      p_new_role: newRole,
    });

    if (error || !data?.ok) {
      showAdminAlert(data?.message || error?.message || 'Không đổi được vai trò.', 'err');
      selectEl.value = oldRole;
      return;
    }

    // Cập nhật style dropdown
    selectEl.className = 'role-inline-select ' + newRole;
    selectEl.dataset.prev = newRole;
    showAdminAlert('✓ ' + (data.message || 'Đã cập nhật vai trò.'), 'ok');

    // Reload để cập nhật chip hệ thống
    await loadAdminRoles();
  } catch (e) {
    selectEl.value = oldRole;
    showAdminAlert('Lỗi: ' + e.message, 'err');
  } finally {
    selectEl.disabled = false;
  }
}

// ============================================================
// MODAL CHỌN NGƯỜI (thay thế prompt())
// ============================================================
function showPickerModal(title, candidates, onPick) {
  // Xóa modal cũ nếu có
  document.getElementById('_pickerModal')?.remove();

  const items = candidates.map((u, i) =>
    `<button class="picker-item" onclick="__pickerPick(${i})" type="button">
      <span class="picker-avatar">${escapeHtml((u.full_name || u.username || '?')[0])}</span>
      <span>
        <b>${escapeHtml(u.full_name || u.username)}</b>
        ${u.mssv ? `<small class="rk-muted"> · ${escapeHtml(u.mssv)}</small>` : ''}
        ${u.team_name ? `<small class="rk-muted"> · Nhóm: ${escapeHtml(u.team_name)}</small>` : ''}
      </span>
    </button>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = '_pickerModal';
  modal.className = 'picker-overlay';
  modal.innerHTML = `
    <div class="picker-box">
      <div class="picker-header">
        <b>${escapeHtml(title)}</b>
        <button type="button" onclick="document.getElementById('_pickerModal').remove()">✕</button>
      </div>
      <div class="picker-list">${items || '<div class="rk-empty">Không có người phù hợp.</div>'}</div>
    </div>`;

  document.body.appendChild(modal);

  window.__pickerPick = async (idx) => {
    modal.remove();
    delete window.__pickerPick;
    await onPick(candidates[idx].user_id);
  };

  // Bấm ngoài để đóng
  modal.addEventListener('click', (e) => {
    if (e.target === modal) { modal.remove(); delete window.__pickerPick; }
  });
}
