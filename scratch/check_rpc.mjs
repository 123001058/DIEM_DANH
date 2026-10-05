// Test quyền thật bằng tài khoản đã đăng nhập.
// Dùng @supabase/supabase-js để signInWithPassword rồi gọi RPC như app thật.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL = 'https://nhjkpknhybenkxwadvzv.supabase.co';
const KEY = 'sb_publishable_h1nRwciz_rOgnD88ZCnkIw_v0Czf1L8';

// ==== ĐIỀN TÀI KHOẢN TEST VÀO ĐÂY ====
const USER = process.env.TEST_USER || '';
const PASS = process.env.TEST_PASS || '';
// ======================================

if (!USER || !PASS) {
  console.log('Thieu TAI KHOAN. Chay nhu sau:');
  console.log('  $env:TEST_USER="tendaikhoan"; $env:TEST_PASS="matkhau"; node scratch/test_flow.mjs');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const log = (label, data, error) => {
  if (error) console.log(`  ✗ ${label}: ${error.message}`);
  else console.log(`  ✓ ${label}: ${JSON.stringify(data).slice(0, 200)}`);
};

(async () => {
  // 1) Đăng nhập
  const { data: auth, error: authErr } = await db.auth.signInWithPassword({
    email: USER.includes('@') ? USER : USER + '@diemdanh.local',
    password: PASS,
  });
  if (authErr) {
    console.log('DANG NHAP THAT BAI:', authErr.message);
    process.exit(1);
  }
  console.log(`\nDang nhap thanh cong: ${auth.user.email}`);
  console.log(`user_id = ${auth.user.id}\n`);

  // 2) Vai tro
  const { data: prof } = await db.from('profiles')
    .select('user_id, username, full_name, mssv, role')
    .eq('user_id', auth.user.id).maybeSingle();
  console.log('=== HO SO ===');
  console.log(`  role: ${prof?.role} | ten: ${prof?.full_name} | mssv: ${prof?.mssv}\n`);

  // 3) Cac ham doc
  console.log('=== HAM DOC ===');
  log('my_teams', (await db.rpc('my_teams')).data);
  log('is_leader', (await db.rpc('is_leader')).data);
  log('is_admin', (await db.rpc('is_admin')).data);

  const teams = (await db.rpc('my_teams')).data?.teams || [];
  if (teams.length) {
    const tid = teams[0].id;
    console.log(`\n=== NHOM "${teams[0].name}" ===`);
    log('get_team_availability', (await db.rpc('get_team_availability', { p_team_id: tid })).data);
    log('get_team_board', (await db.rpc('get_team_board', { p_team_id: tid })).data);
  } else {
    console.log('\n(Chua thuoc nhom nao)');
  }

  // 4) Quyen ghi - thu vien
  console.log('\n=== KIEM TRA QUYEN GHI ===');
  const t0 = Date.now();
  const r = await db.rpc('admin_create_team', { p_name: 'zz-test-' + t0, p_description: 'test' });
  console.log(r.data?.ok
    ? '  ! admin_create_team THANH CONG (bat buoc la Admin)'
    : '  ✓ bi chan dung: ' + (r.data?.message || r.error?.message));

  const r2 = await db.rpc('admin_list_users');
  console.log(r2.data?.ok
    ? '  ! admin_list_users THANH CONG (bat buoc la Admin)'
    : '  ✓ bi chan dung: ' + (r2.data?.message || r2.error?.message));
})();
