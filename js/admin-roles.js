/**
 * DIEM_DANH — js/admin-roles.js
 * Panel "Nhóm & Phân quyền" cho ADMIN (nạp trong admin.html).
 *
 * Chức năng:
 *   - Tạo nhóm / đội
 *   - Thêm, gỡ thành viên vào nhóm
 *   - Cấp quyền Đội trưởng cho một thành viên (hoặc người phụ trách)
 *   - Thu hồi quyền Đội trưởng
 *   - Xem danh sách tài khoản & quyền của từng người
 */

let adminTeams = [];
let adminUsers = [];

// ============================================================
// MỞ / ĐÓNG PANEL
// ============================================================
function showRolesPanel() {
  const p = document.getElementById('rolesPanel');
  if (!p) return;
  p.style.display = 'block';
  p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  loadAdminRoles();
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
}

// ============================================================
// TẢI DỮ LIỆU
// ============================================================
async function loadAdminRoles() {
  await loadAdminTeams();
  await loadAdminUsers();
}

async function loadAdminTeams() {
  const box = document.getElementById('adminTeamList');
  try {
    const { teams } = await fetchMyTeams();
    // Admin thấy tất cả nhóm nhờ my_teams()
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
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.message || 'Không có quyền.');

    adminUsers = Array.isArray(data.users) ? data.users : [];
    renderAdminUsers();
  } catch (e) {
    console.error('[loadAdminUsers]', e);
    if (box) box.innerHTML = '<div class="rk-empty">Không tải được danh sách tài khoản.</div>';
  }
}

// ============================================================
// TẠO NHÓM
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

  // Xoá form
  document.getElementById('newTeamName').value = '';
  document.getElementById('newTeamDesc').value = '';

  showAdminAlert('✓ Đã tạo nhóm "' + name + '". Hãy thêm thành viên và cấp Đội trưởng.', 'ok');
  await loadAdminTeams();
}

// ============================================================
// HIỂN THỊ DANH SÁCH NHÓM
// ============================================================
function renderAdminTeams() {
  const box = document.getElementById('adminTeamList');
  if (!box) return;

  if (!adminTeams.length) {
    box.innerHTML = '<div class="rk-empty">Chưa có nhóm nào. Hãy tạo nhóm đầu tiên ở trên.</div>';
    return;
  }

  let html = '<div class="rk-table-wrap"><table class="rk-table">' +
    '<thead><tr><th>Tên nhóm</th><th>Mô tả</th><th>Đội trưởng</th>' +
    '<th style="text-align:right;">Thao tác</th></tr></thead><tbody>';

  adminTeams.forEach((t) => {
    // Tìm thông tin đội trưởng trong danh sách user
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

    // Nút cấp Đội trưởng
    html += `<button class="rk-btn rk-btn-sm" onclick="adminPickLeader('${t.id}')">👑 Cấp Đội trưởng</button>`;

    // Nút thêm thành viên
    html += `<button class="rk-btn rk-btn-sm" onclick="adminAddMember('${t.id}')">＋ Thêm thành viên</button>`;

    // Nút thu hồi quyền
    if (t.leader_id) {
      html += `<button class="rk-btn rk-btn-sm rk-btn-err" onclick="adminRevokeLeader('${t.id}')">Thu hồi ĐT</button>`;
    }

    // Nút xóa nhóm
    html += `<button class="rk-btn rk-btn-sm rk-btn-err" onclick="adminDeleteTeam('${t.id}','${escapeHtml(t.name)}')">🗑 Xóa nhóm</button>`;

    html += '</div></td></tr>';
  });

  html += '</tbody></table></div>';
  box.innerHTML = html;
}

// ============================================================
// CẤP QUYỀN ĐỘI TRƯỞNG
// ============================================================
async function adminPickLeader(teamId) {
  const team = adminTeams.find((t) => t.id === teamId);
  if (!team) return;

  // Chỉ những tài khoản thuộc nhóm này mới có thể làm Đội trưởng
  const candidates = adminUsers.filter((u) => u.team_id === teamId && u.role !== 'admin');
  if (!candidates.length) {
    return showAdminAlert(
      'Nhóm "' + team.name + '" chưa có thành viên nào. Hãy thêm thành viên trước khi cấp quyền.',
      'err'
    );
  }

  const lines = candidates.map((u, i) =>
    `${i + 1}. ${u.full_name || u.username}${u.mssv ? ' (' + u.mssv + ')' : ''}` +
    (u.role === 'leader' ? '  ← đang là Đội trưởng nhóm khác' : '')
  );

  const choice = prompt(
    `Cấp quyền ĐỘI TRƯỞNG cho nhóm "${team.name}".\n\n` +
    lines.join('\n') + '\n\nNhập số thứ tự:'
  );
  if (choice === null) return;

  const idx = Number(choice.trim()) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
    return showAdminAlert('Lựa chọn không hợp lệ.', 'err');
  }

  const target = candidates[idx];
  if (!confirm(`Cấp quyền Đội trưởng cho ${target.full_name || target.username}?\n\n` +
    'Lưu ý: Đội trưởng cũ của nhóm này (nếu có) sẽ trở lại là thành viên thường.')) {
    return;
  }

  const { data, error } = await supabase.rpc('admin_set_team_leader', {
    p_team_id: teamId,
    p_user_id: target.user_id,
  });

  if (error || !data?.ok) {
    return showAdminAlert(data?.message || error?.message || 'Không cấp được quyền.', 'err');
  }

  showAdminAlert('✓ Đã cấp quyền Đội trưởng cho ' + (target.full_name || target.username), 'ok');
  await loadAdminRoles();
}

async function adminRevokeLeader(teamId) {
  const team = adminTeams.find((t) => t.id === teamId);
  if (!team) return;
  if (!confirm('Thu hồi quyền Đội trưởng của nhóm "' + team.name + '"?')) return;

  const { data, error } = await supabase.rpc('admin_revoke_leader', { p_team_id: teamId });
  if (error || !data?.ok) {
    return showAdminAlert(data?.message || error?.message || 'Không thu hồi được.', 'err');
  }

  showAdminAlert('✓ ' + (data.message || 'Đã thu hồi quyền Đội trưởng.'), 'ok');
  await loadAdminRoles();
}

// ============================================================
// THÊM / GỠ THÀNH VIÊN
// ============================================================
async function adminAddMember(teamId) {
  const team = adminTeams.find((t) => t.id === teamId);
  if (!team) return;

  // Những tài khoản chưa thuộc nhóm nào
  const candidates = adminUsers.filter((u) => !u.team_id && u.role !== 'admin');
  if (!candidates.length) {
    return showAdminAlert('Tất cả tài khoản đã thuộc một nhóm.', 'info');
  }

  const lines = candidates.map((u, i) =>
    `${i + 1}. ${u.full_name || u.username}${u.mssv ? ' (' + u.mssv + ')' : ''}`
  );

  const choice = prompt(
    `Thêm thành viên vào nhóm "${team.name}"\n\n` +
    lines.join('\n') + '\n\nNhập số thứ tự:'
  );
  if (choice === null) return;

  const idx = Number(choice.trim()) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
    return showAdminAlert('Lựa chọn không hợp lệ.', 'err');
  }

  const { data, error } = await supabase.rpc('team_add_member', {
    p_team_id: teamId,
    p_user_id: candidates[idx].user_id,
  });

  if (error || !data?.ok) {
    return showAdminAlert(data?.message || error?.message || 'Không thêm được.', 'err');
  }

  showAdminAlert('✓ ' + (data.message || 'Đã thêm thành viên.'), 'ok');
  await loadAdminRoles();
}

async function adminRemoveMember(teamId, userId) {
  if (!confirm('Gỡ thành viên này khỏi nhóm?')) return;

  const { data, error } = await supabase.rpc('team_remove_member', {
    p_team_id: teamId,
    p_user_id: userId,
  });

  if (error || !data?.ok) {
    return showAdminAlert(data?.message || error?.message || 'Không gỡ được.', 'err');
  }

  showAdminAlert('✓ ' + (data.message || 'Đã gỡ thành viên.'), 'ok');
  await loadAdminRoles();
}

// ============================================================
// DANH SÁCH TÀI KHOẢN & QUYỀN
// ============================================================
function renderAdminUsers() {
  const box = document.getElementById('adminUserList');
  if (!box) return;

  if (!adminUsers.length) {
    box.innerHTML = '<div class="rk-empty">Không có tài khoản nào.</div>';
    return;
  }

  const roleBadge = (role) => {
    const cls = role === 'admin' ? 'chip-admin'
      : (role === 'leader' ? 'chip-leader' : 'chip-student');
    return `<span class="rk-role-chip ${cls}">${ROLE_LABELS[role] || role}</span>`;
  };

  let html = '<div class="rk-table-wrap"><table class="rk-table">' +
    '<thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>MSSV</th><th>Vai trò</th>' +
    '<th>Nhóm</th><th style="text-align:right;">Thao tác</th></tr></thead><tbody>';

  adminUsers.forEach((u) => {
    html += '<tr>';
    html += `<td><b>${escapeHtml(u.full_name || '—')}</b></td>`;
    html += `<td class="rk-muted">${escapeHtml(u.username)}</td>`;
    html += `<td class="rk-muted">${u.mssv ? escapeHtml(u.mssv) : '—'}</td>`;
    html += `<td>${roleBadge(u.role)}</td>`;
    html += `<td class="rk-muted">${u.team_name ? escapeHtml(u.team_name) : '—'}</td>`;
    html += '<td><div class="rk-actions">';

    // Chỉ gỡ được nếu không phải Admin và không phải Đội trưởng
    const team = adminTeams.find((t) => t.id === u.team_id);
    const isThisTeamLeader = team && team.leader_id === u.user_id;
    if (u.team_id && u.role !== 'admin' && !isThisTeamLeader) {
      html += `<button class="rk-btn rk-btn-sm rk-btn-err" ` +
        `onclick="adminRemoveMember('${u.team_id}','${u.user_id}')">Gỡ khỏi nhóm</button>`;
    } else if (isThisTeamLeader) {
      html += '<span class="rk-muted">Đội trưởng</span>';
    }

    html += '</div></td></tr>';
  });

  html += '</tbody></table></div>';
  html += '<p class="rk-muted" style="margin-top:10px;">' +
    'Vai trò <b>Đội trưởng</b> được cấp từ danh sách nhóm phía trên. ' +
    'Tài khoản Admin không thể bị gỡ quyền.</p>';

  box.innerHTML = html;
}

// ============================================================
// XÓA NHÓM
// ============================================================
async function adminDeleteTeam(teamId, teamName) {
  // Kiểm tra nhóm còn thành viên không
  const members = adminUsers.filter((u) => u.team_id === teamId);
  if (members.length > 0) {
    return showAdminAlert(
      `Nhóm "${teamName}" còn ${members.length} thành viên. Hãy gỡ hết thành viên trước khi xóa nhóm.`,
      'err'
    );
  }

  if (!confirm(`Bạn có chắc muốn XÓA nhóm "${teamName}"?\nHành động này không thể hoàn tác.`)) return;

  const { data, error } = await supabase.rpc('admin_delete_team', { p_team_id: teamId });

  if (error || !data?.ok) {
    return showAdminAlert(data?.message || error?.message || 'Không xóa được nhóm.', 'err');
  }

  showAdminAlert(`✓ Đã xóa nhóm "${teamName}".`, 'ok');
  await loadAdminRoles();
}
