// Test quyền thật bằng tài khoản đã đăng nhập.
// Gọi REST API trực tiếp (không cần thư viện ngoài) qua endpoint
// /auth/v1/token?grant_type=password để lấy access token.
const URL = 'https://nhjkpknhybenkxwadvzv.supabase.co';
const KEY = 'sb_publishable_h1nRwciz_rOgnD88ZCnkIw_v0Czf1L8';

// ==== ĐIỀN TÀI KHOẢN TEST VÀO ĐÂY (hoặc dùng env) ====
const USER = process.env.TEST_USER || '';
const PASS = process.env.TEST_PASS || '';
// ====================================================

if (!USER || !PASS) {
  console.log('Thieu TAI KHOAN. Chay nhu sau:');
  console.log('  $env:TEST_USER="tendaikhoan"; $env:TEST_PASS="matkhau"; node scratch/test_flow.mjs');
  process.exit(1);
}

let TOKEN = '';

async function rpc(fn, body = {}) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function rest(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${TOKEN}` },
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

const show = (label, res) => {
  const ok = res.status < 400;
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(22)} [${res.status}] ` +
    JSON.stringify(res.data).slice(0, 160));
};

(async () => {
  // 1) Đăng nhập lấy access token
  const email = USER.includes('@') ? USER : USER + '@diemdanh.local';
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  });
  const auth = await r.json();
  if (!auth.access_token) {
    console.log('DANG NHAP THAT BAI:', JSON.stringify(auth).slice(0, 200));
    process.exit(1);
  }
  TOKEN = auth.access_token;
  console.log(`\nDang nhap OK: ${email}`);
  console.log(`user_id = ${auth.user.id}\n`);

  // 2) Vai trò
  const me = await rest(`profiles?user_id=eq.${auth.user.id}&select=role,full_name,mssv`);
  const prof = Array.isArray(me.data) ? me.data[0] : null;
  console.log('=== HO SO ===');
  console.log(`  role=${prof?.role} | ten=${prof?.full_name} | mssv=${prof?.mssv}\n`);

  // 3) Hàm đọc
  console.log('=== HAM DOC ===');
  show('is_admin', await rpc('is_admin'));
  show('is_leader', await rpc('is_leader'));

  const mt = await rpc('my_teams');
  show('my_teams', mt);
  const teams = mt.data?.teams || [];

  if (teams.length) {
    const tid = teams[0].id;
    console.log(`\n=== NHOM "${teams[0].name}" ===`);
    show('get_team_availability', await rpc('get_team_availability', { p_team_id: tid }));
    show('get_team_board', await rpc('get_team_board', { p_team_id: tid }));
  } else {
    console.log('\n(Chua thuoc nhom nao)');
  }

  // 4) Chặn ghi ngoài quyền
  console.log('\n=== KIEM TRA RANH GIOI ===');
  const t1 = await rpc('admin_create_team', { p_name: 'zz-test-' + Date.now() });
  console.log(t1.data?.ok
    ? '  ! admin_create_team THANH CONG  <-- bat buoc la Admin'
    : '  ✓ bi chan: ' + (t1.data?.message || 'HTTP ' + t1.status));

  const t2 = await rpc('admin_list_users');
  console.log(t2.data?.ok
    ? '  ! admin_list_users THANH CONG  <-- bat buoc la Admin'
    : '  ✓ bi chan: ' + (t2.data?.message || 'HTTP ' + t2.status));
})();
