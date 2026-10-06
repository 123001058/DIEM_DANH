/**
 * DIEM_DANH — js/roles.js
 * Tiện ích dùng chung cho cơ chế PHÂN QUYỀN & GIAO NHIỆM VỤ.
 *
 * Vai trò:
 *   admin   : tài khoản quản trị duy nhất (quyền cao nhất).
 *   leader  : Đội trưởng chính do Admin cấp — quản lý toàn nhóm,
 *             tự cấp Đội phó trong nhóm mình.
 *   deputy  : Đội phó — quyền NGANG Đội trưởng (xem lịch rảnh, giao việc),
 *             TRỪ việc đổi vai trò của người khác.
 *   student : Thành viên, chỉ xem & thực hiện nhiệm vụ được giao.
 *
 * Yêu cầu: js/config.js phải được nạp TRƯỚC js/roles.js.
 */

const ROLES = {
  ADMIN: 'admin',
  LEADER: 'leader',
  DEPUTY: 'deputy',
  STUDENT: 'student',
};

// Nhãn tiếng Việt cho vai trò
const ROLE_LABELS = {
  admin: 'Quản trị viên',
  leader: 'Đội trưởng',
  deputy: 'Đội phó',
  student: 'Thành viên',
};

// Nhãn vai trò trong nhóm (team_role)
const TEAM_ROLE_LABELS = {
  leader: 'Đội trưởng',
  deputy: 'Đội phó',
  member: 'Thành viên',
};

const THU_LABELS = {
  2: 'Thứ Hai',
  3: 'Thứ Ba',
  4: 'Thứ Tư',
  5: 'Thứ Năm',
  6: 'Thứ Sáu',
  7: 'Thứ Bảy',
  8: 'Chủ Nhật',
};

const THU_SHORT = { 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN' };

const BUOI_LABELS = {
  1: 'Sáng (07:30 – 11:25)',
  2: 'Chiều (12:50 – 16:45)',
  3: 'Tối (17:30 – 20:50)',
};

const BUOI_SHORT = { 1: 'Sáng', 2: 'Chiều', 3: 'Tối' };

const TASK_STATUS_LABELS = {
  todo: 'Chưa bắt đầu',
  doing: 'Đang thực hiện',
  done: 'Hoàn thành',
  cancelled: 'Đã huỷ',
};

const PRIORITY_LABELS = {
  low: 'Thấp',
  normal: 'Thường',
  high: 'Cao',
};

/**
 * Lấy phiên đăng nhập + hồ sơ + vai trò hiện tại.
 * Nguồn sự thật là bảng `profiles` (do trigger handle_new_user đồng bộ).
 * @returns {Promise<{user:object, profile:object, role:string, isAdmin:boolean, isLeader:boolean, isStudent:boolean}|null>}
 */
async function getCurrentAuth() {
  try {
    const { data, error } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (error || !user) return null;

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, mssv, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (pErr) {
      console.warn('[getCurrentAuth] Không đọc được profiles:', pErr);
      return null;
    }

    // Dự phòng: nếu profile chưa có, coi như thành viên
    const role = profile?.role || ROLES.STUDENT;

    return {
      user,
      profile,
      role,
      isAdmin:   role === ROLES.ADMIN,
      isLeader:  role === ROLES.LEADER,
      isDeputy:  role === ROLES.DEPUTY,
      isStudent: role === ROLES.STUDENT,
      canManage: role === ROLES.LEADER || role === ROLES.DEPUTY || role === ROLES.ADMIN,
      displayName: profile?.full_name || profile?.username || user.email,
    };
  } catch (e) {
    console.error('[getCurrentAuth]', e);
    return null;
  }
}

/**
 * Chặn trang theo vai trò.
 * @param {string[]} allowed Danh sách vai trò được phép (rỗng = chỉ cần đăng nhập)
 * @param {string} title Nhánh trang nguồn (hiển thị khi bị từ chối)
 * @returns {Promise<object|null>} Thông tin auth, hoặc null nếu đã điều hướng đi
 */
async function requireRoles(allowed = [], title = 'trang này') {
  const auth = await getCurrentAuth();

  if (!auth) {
    location.replace('index.html');
    return null;
  }

  if (allowed.length && !allowed.includes(auth.role)) {
    alert(`Tài khoản của bạn không có quyền truy cập ${title}.`);
    // Đưa về đúng trang theo vai trò
    location.replace(roleHome(auth.role));
    return null;
  }
  // Tự động thoát nếu phiên bị đăng xuất/hết hạn ở nơi khác
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.replace('index.html');
  });

  return auth;
}

/** Trang đích phù hợp với từng vai trò */
function roleHome(role) {
  if (role === ROLES.ADMIN)   return 'admin.html';
  if (role === ROLES.LEADER)  return 'admin.html';
  if (role === ROLES.DEPUTY)  return 'admin.html';
  return 'tasks.html';
}

/** Danh sách nhóm mà người dùng hiện tại tham gia / quản lý */
async function fetchMyTeams() {
  try {
    const { data, error } = await supabase.rpc('my_teams');
    if (error) {
      console.warn('[fetchMyTeams]', error);
      return { isAdmin: false, teams: [] };
    }
    return {
      isAdmin: !!data?.is_admin,
      teams: Array.isArray(data?.teams) ? data.teams : [],
    };
  } catch (e) {
    console.warn('[fetchMyTeams]', e);
    return { isAdmin: false, teams: [] };
  }
}

/** Nhóm mà người dùng đang quản lý (leader_id = mình), hoặc nhóm đầu tiên nếu là admin */
async function fetchManagedTeam() {
  const { data, error } = await supabase.rpc('my_teams');
  if (error) return null;
  const teams = Array.isArray(data?.teams) ? data.teams : [];
  if (!teams.length) return null;

  const { data: authData } = await supabase.auth.getUser();
  const uid = authData?.user?.id;

  // Ưu tiên nhóm mình làm đội trưởng
  const led = teams.find((t) => t.leader_id && t.leader_id === uid);
  return led || teams[0];
}

/** Đăng xuất và về trang chủ */
async function roleLogout() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('[roleLogout]', e);
  }
  location.href = 'index.html';
}

// Hiển thị thông báo nhỏ dưới form (nếu trang có #errBox)
function roleNotify(msg, isError = false) {
  const box = document.getElementById('errBox');
  if (!box) return;
  box.innerText = msg;
  box.style.color = isError ? 'var(--err)' : 'var(--ok)';
}
