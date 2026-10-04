-- =====================================================================
-- DIEM_DANH — bảo mật phía server (chạy 1 lần trong Supabase > SQL Editor)
-- Idempotent: chạy lại nhiều lần không sao. Không DROP bảng/dữ liệu.
--
-- Sau khi chạy:
--   * Sinh viên (anon) KHÔNG còn đọc/ghi trực tiếp bảng nào. Chỉ gọi 3 RPC:
--       get_open_session(), submit_attendance(...), server_now_ms()
--   * Token QR / phiên mở / hết giờ / MSSV hợp lệ / trùng MSSV / trùng thiết bị
--     đều được kiểm tra Ở SERVER bằng giờ server (không lệ thuộc đồng hồ điện thoại).
--   * Token QR được KÝ HMAC bằng secret riêng của từng phiên (chỉ server biết).
--     Chỉ admin (RPC issue_qr_token) mới lấy được token hợp lệ => không thể tự
--     tính token từ id phiên + giờ server mà không quét QR.
--   * Admin = user nằm trong bảng allowlist public.admins (KHÔNG phải mọi user
--     đăng nhập). Vẫn nên TẮT "Allow new users to sign up" ở Authentication >
--     Providers > Email như một lớp bảo vệ bổ sung.
--
-- Giả định cột hiện có:
--   sessions  : id, session_name, is_open(bool), refresh_time(int), duration_min(int), started_at(timestamptz)
--   attendance: id, session_id, mssv, full_name, category, note, device_id, created_at(default now())
-- =====================================================================

-- 0) Tạo bảng nếu chưa có (không đụng tới bảng/dữ liệu đã tồn tại) -------
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  session_name text not null,
  is_open      boolean not null default true,
  refresh_time int not null default 20,
  duration_min int not null default 5,
  started_at   timestamptz not null default now()
);

-- session_id lấy đúng kiểu của sessions.id (uuid hoặc bigint) để FK luôn khớp
do $$
declare v_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_type
  from pg_attribute a
  where a.attrelid = 'public.sessions'::regclass and a.attname = 'id';

  execute format($f$
    create table if not exists public.attendance (
      id         uuid primary key default gen_random_uuid(),
      session_id %s not null references public.sessions(id) on delete cascade,
      mssv       text not null,
      full_name  text,
      category   text,
      note       text,
      device_id  text,
      created_at timestamptz not null default now()
    )$f$, v_type);
end $$;

create index if not exists attendance_session_idx on public.attendance (session_id, created_at desc);

-- Bật realtime cho bảng attendance (admin tự cập nhật khi có người điểm danh)
do $$
begin
  alter publication supabase_realtime add table public.attendance;
exception when duplicate_object then null;
end $$;

-- 0b) Allowlist admin + secret ký token QR cho mỗi phiên ----------------
create extension if not exists pgcrypto with schema extensions;

-- Mỗi phiên có 1 secret ngẫu nhiên; không bao giờ trả ra cho sinh viên.
alter table public.sessions
  add column if not exists qr_secret text not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;  -- không policy => chỉ hàm security definer đọc được
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- >>> BOOTSTRAP ADMIN <<<
-- ĐỂ AN TOÀN: Bạn NÊN chủ động chèn UUID của admin bằng tay vào bảng public.admins.
-- Vd: insert into public.admins (user_id) values ('uuid-cua-ban') on conflict (user_id) do nothing;
-- (Đoạn mã tự động quét %diemdanh.admin dưới đây đã bị comment lại để tránh add nhầm user)
-- insert into public.admins (user_id)
--   select id from auth.users where email like '%@diemdanh.admin'
--   on conflict do nothing;

-- 1) Bảng danh sách lớp (nguồn sự thật cho MSSV hợp lệ) ----------------
create table if not exists public.students (
  mssv text primary key,
  name text not null
);

insert into public.students (mssv, name) values
  ('123000555', 'Nguyễn Lê Vũ Duy'),
  ('123000078', 'Trần Hải Nam'),
  ('125001579', 'Nguyễn Thiện Nhân'),
  ('124000534', 'Nguyễn Ngọc Bình An'),
  ('125001875', 'Nguyễn Hoàng Phi Hùng'),
  ('124000737', 'Phạm tuấn phát'),
  ('125001809', 'Nguyễn Thanh Thái'),
  ('124001238', 'Nguyễn Đức Huy'),
  ('124001851', 'Nguyễn Thị Thùy'),
  ('124000354', 'Phan Công Thịnh'),
  ('124001589', 'Nguyễn Hồng Hiệp'),
  ('125000568', 'Phan Quốc Bảo'),
  ('125002381', 'Cao thế phi'),
  ('123000651', 'Cao Thanh Nghĩa'),
  ('125001648', 'Nguyễn Thanh Tiến'),
  ('125000372', 'Nguyễn Huỳnh Minh Thông'),
  ('123000722', 'Bùi Trần Thanh Sang'),
  ('125000287', 'Nguyễn Duy Phúc'),
  ('123001058', 'Nguyễn Khánh Hoà'),
  ('123000185', 'Lê Văn Minh'),
  ('123000872', 'Nguyễn Đình Hậu'),
  ('125000798', 'Nguyễn Minh Khang'),
  ('123001188', 'Phạm Anh Tuấn'),
  ('125000550', 'Nguyễn Duy Tiến'),
  ('123000432', 'Trần Thành Long'),
  ('123000375', 'Phạm Đinh Tài Lộc'),
  ('123001394', 'Đỗ Văn Quyền')
on conflict (mssv) do update set name = excluded.name;

-- 2) Ràng buộc chống trùng ngay tại DB ---------------------------------
-- (Nếu lệnh lỗi vì đã có dữ liệu trùng, xoá bản ghi trùng rồi chạy lại.)
create unique index if not exists attendance_session_mssv_uq
  on public.attendance (session_id, mssv);
create unique index if not exists attendance_session_device_uq
  on public.attendance (session_id, device_id);

-- 3) RLS: xoá policy cũ rồi tạo lại chặt chẽ ----------------------------
alter table public.sessions   enable row level security;
alter table public.attendance enable row level security;
alter table public.students   enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_refresh_time_check' and conrelid = 'public.sessions'::regclass) then
    alter table public.sessions add constraint sessions_refresh_time_check check (refresh_time is not null and refresh_time > 0 and refresh_time <= 86400) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_duration_min_check' and conrelid = 'public.sessions'::regclass) then
    -- duration_min có thể NULL (không giới hạn thời gian)
    alter table public.sessions add constraint sessions_duration_min_check check (duration_min > 0 and duration_min <= 10080) not valid;
  end if;
end $$;

do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('sessions', 'attendance', 'students')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy sessions_admin_all   on public.sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy attendance_admin_all on public.attendance
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy students_admin_read  on public.students
  for select to authenticated using (public.is_admin());

revoke all on public.sessions, public.attendance, public.students from anon;

-- 4) RPC ---------------------------------------------------------------

-- Giờ server (ms). Admin dùng để đồng bộ đồng hồ khi sinh token QR.
create or replace function public.server_now_ms()
returns bigint
language sql volatile
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- Phiên đang mở và CHƯA hết giờ (mới nhất). Trả null nếu không có.
create or replace function public.get_open_session()
returns jsonb
language sql volatile security definer
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id',            s.id,
    'session_name',  s.session_name,
    'refresh_time',  coalesce(s.refresh_time, 20),
    'duration_min',  s.duration_min,
    'started_at',    s.started_at,
    'server_now_ms', (extract(epoch from clock_timestamp()) * 1000)::bigint
  )
  from public.sessions s
  where s.is_open
    and (s.duration_min is null
         or s.started_at + (s.duration_min * interval '1 minute') > now())
  order by s.started_at desc
  limit 1
$$;

-- Chữ ký HMAC của (phiên, cửa sổ thời gian). Hàm nội bộ, không cấp quyền gọi.
create or replace function public._qr_sig(p_secret text, p_session text, p_win bigint)
returns text
language sql immutable
as $$
  select left(encode(hmac(p_session || ':' || p_win::text, p_secret, 'sha256'), 'hex'), 24)
$$;
revoke all on function public._qr_sig(text, text, bigint) from public, anon, authenticated;

-- Admin xin token QR hiện tại. Token = "<cửa_sổ>.<chữ_ký>"
create or replace function public.issue_qr_token(p_session_id text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s     record;
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_win bigint;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into s from public.sessions where id::text = p_session_id and is_open;
  if not found then
    raise exception 'session not open' using errcode = 'P0002';
  end if;
  if coalesce(s.refresh_time, 20) <= 0 or coalesce(s.refresh_time, 20) > 86400 then
    raise exception 'invalid refresh_time' using errcode = 'P0003';
  end if;
  if s.duration_min is not null and s.started_at + (s.duration_min * interval '1 minute') <= now() then
    raise exception 'session expired' using errcode = 'P0004';
  end if;
  v_win := v_now / (coalesce(s.refresh_time, 20) * 1000);
  return jsonb_build_object(
    'token', v_win::text || '.' || public._qr_sig(s.qr_secret, s.id::text, v_win),
    'server_now_ms', v_now
  );
end;
$$;

-- Bản cũ nhận token số (có thể tự tính) => gỡ bỏ
drop function if exists public.submit_attendance(text, bigint, text, text, text, text);

-- Điểm danh: toàn bộ kiểm tra nằm ở đây.
create or replace function public.submit_attendance(
  p_session_id text,
  p_token      text,
  p_mssv       text,
  p_category   text,
  p_note       text,
  p_device_id  text
)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s       record;
  v_name  text;
  v_mssv  text := btrim(coalesce(p_mssv, ''));
  v_now   bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_cycle bigint;
  v_start bigint;
  v_win   bigint;
  v_tol   constant bigint := 3000; -- dung sai 3s (vẫn có khe hở nhỏ cho replay attack nội trong 3s)
begin
  if v_mssv = '' or coalesce(btrim(p_category), '') = ''
     or coalesce(btrim(p_device_id), '') = '' or p_token is null
     or p_token !~ '^[0-9]{1,12}\.[0-9a-f]{24}$' then
    return jsonb_build_object('ok', false, 'code', 'BAD_INPUT', 'message', 'Thiếu thông tin điểm danh.');
  end if;

  select * into s from public.sessions where id::text = p_session_id;
  if not found or not s.is_open
     or (s.duration_min is not null
         and s.started_at + (s.duration_min * interval '1 minute') <= now()) then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED',
                              'message', 'Phiên điểm danh đã đóng hoặc đã hết giờ.');
  end if;

  -- 1) Chữ ký phải khớp secret của phiên (không giả được nếu không có secret)
  v_win := split_part(p_token, '.', 1)::bigint;
  if split_part(p_token, '.', 2) <> public._qr_sig(s.qr_secret, s.id::text, v_win) then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_INVALID',
                              'message', 'Mã QR không hợp lệ, vui lòng quét lại mã trên màn hình.');
  end if;

  -- 2) Cửa sổ thời gian còn hạn (giờ server, dung sai 3s)
  v_cycle := coalesce(s.refresh_time, 20) * 1000;
  v_start := v_win * v_cycle;
  if v_now < v_start - v_tol or v_now > v_start + v_cycle + v_tol then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_EXPIRED',
                              'message', 'Mã QR đã hết hạn, vui lòng quét lại mã mới nhất.');
  end if;

  select name into v_name from public.students where mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_CLASS',
                              'message', 'MSSV không có trong danh sách lớp!');
  end if;

  if exists (select 1 from public.attendance a where a.session_id = s.id and a.mssv = v_mssv) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY',
                              'message', 'Bạn đã điểm danh phiên này rồi.');
  end if;

  if exists (select 1 from public.attendance a where a.session_id = s.id and a.device_id = p_device_id) then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_USED',
                              'message', 'Thiết bị này đã được dùng để điểm danh cho MSSV khác.');
  end if;

  insert into public.attendance (session_id, mssv, full_name, category, note, device_id)
  values (s.id, v_mssv, v_name, left(btrim(p_category), 60), left(btrim(coalesce(p_note, '')), 200), p_device_id);

  return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'ALREADY',
                            'message', 'MSSV hoặc thiết bị này đã điểm danh phiên này rồi.');
end;
$$;

revoke all on function public.server_now_ms()      from public;
revoke all on function public.get_open_session()   from public;
revoke all on function public.submit_attendance(text, text, text, text, text, text) from public;
revoke all on function public.issue_qr_token(text) from public;
revoke all on function public.is_admin()           from public;
grant execute on function public.server_now_ms()      to anon, authenticated;
grant execute on function public.get_open_session()   to anon, authenticated;
grant execute on function public.submit_attendance(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.issue_qr_token(text) to authenticated;
grant execute on function public.is_admin()           to authenticated;

-- =====================================================================
-- PHẦN CẬP NHẬT: TÀI KHOẢN SINH VIÊN, ĐỘI TRƯỞNG & TRẠNG THÁI ĐIỂM DANH
-- =====================================================================

-- 1) Bảng Profiles lưu trữ thông tin role và username (ánh xạ với auth.users)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null check (role in ('admin', 'leader', 'student')),
  full_name text,
  mssv text
);
alter table public.profiles enable row level security;

do $$
begin
  drop policy if exists profiles_read_self on public.profiles;
  drop policy if exists profiles_admin_all on public.profiles;
  drop policy if exists profiles_read_all on public.profiles;
end $$;

-- Fix bảo mật: Chỉ cho phép tự đọc hồ sơ của mình, hoặc admin đọc toàn bộ
create policy profiles_read_self on public.profiles for select to authenticated using (auth.uid() = user_id);
create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) Cập nhật bảng attendance cho phép chỉnh sửa trạng thái
-- Trạng thái hợp lệ: 'có mặt', 'vắng có phép', 'vắng không phép'
do $$
begin
  alter table public.attendance add column if not exists status text not null default 'có mặt';
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_status_check' and conrelid = 'public.attendance'::regclass) then
    -- Bắt buộc status phải NOT NULL ở cấp constraint nếu cột cũ chưa set NOT NULL
    alter table public.attendance add constraint attendance_status_check check (status is not null and status in ('có mặt', 'vắng có phép', 'vắng không phép')) not valid;
  end if;
end $$;

alter table public.attendance alter column device_id drop not null;

do $$
begin
  alter table public.attendance drop constraint if exists attendance_session_device_uq;
  drop index if exists attendance_session_device_uq;
end $$;
-- Tạo lại index unique device_id nhưng bỏ qua null
create unique index if not exists attendance_session_device_uq on public.attendance (session_id, device_id) where device_id is not null;

-- 3) Hàm RPC cho phép Admin set trạng thái sinh viên
create or replace function public.admin_set_status(
  p_session_id text,
  p_mssv text,
  p_status text
) returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s record;
  v_name text;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ admin mới được phép cập nhật trạng thái.');
  end if;

  if p_status is null or p_status not in ('có mặt', 'vắng có phép', 'vắng không phép') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  select * into s from public.sessions where id::text = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;

  select name into v_name from public.students where mssv = p_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên.');
  end if;

  insert into public.attendance (session_id, mssv, full_name, status, category, note, device_id)
  values (s.id, p_mssv, v_name, p_status, 'Admin Update', '', null)
  on conflict (session_id, mssv) do update set status = p_status;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_set_status(text, text, text) from public;
grant execute on function public.admin_set_status(text, text, text) to authenticated;
-- (Hàm admin_create_account bằng RPC đã bị xoá theo nguyên tắc an toàn, thay vào đó sử dụng Supabase Edge Functions / Auth Admin API)
