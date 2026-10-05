-- =====================================================================
-- DIEM_DANH — Migration bảo mật & hoàn thiện hệ thống điểm danh
-- Chạy trong Supabase > SQL Editor.
-- Tự động liên kết MSSV từ tài khoản đăng ký (không cần liên hệ Admin).
-- TUYỆT ĐỐI KHÔNG DROP bảng hoặc xóa dữ liệu lịch sử điểm danh.
-- =====================================================================

-- 0) Tạo bảng cơ sở nếu chưa có ---------------------------------------

create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  session_name text not null,
  is_open      boolean not null default true,
  refresh_time int not null default 20,
  duration_min int default 5, -- NULL = không giới hạn thời gian
  started_at   timestamptz not null default now()
);

-- Cho phép NULL cả trên bảng đã tồn tại
alter table public.sessions
  alter column duration_min drop not null;

-- Dùng đúng kiểu public.sessions.id cho attendance.session_id
do $$
declare
  v_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into v_type
  from pg_attribute a
  where a.attrelid = 'public.sessions'::regclass
    and a.attname = 'id'
    and not a.attisdropped;

  if v_type is null then
    raise exception 'Không tìm thấy cột public.sessions.id';
  end if;

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
    )
  $f$, v_type);
end $$;

create index if not exists attendance_session_idx
  on public.attendance (session_id, created_at desc);

-- Bật Realtime cho attendance
do $$
begin
  alter publication supabase_realtime add table public.attendance;
exception
  when duplicate_object then null;
end $$;

-- 0b) Bảng Allowlist admin + secret ký token QR -----------------------

create extension if not exists pgcrypto with schema extensions;

-- Mỗi phiên có secret riêng dùng cho HMAC token QR; không trả secret ra client
alter table public.sessions
  add column if not exists qr_secret text not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column if not exists is_paused boolean not null default false,
  add column if not exists paused_at timestamptz;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- 1) Bảng Profiles người dùng & RLS -----------------------------------

create table if not exists public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  username  text unique not null,
  role      text not null default 'student' check (role in ('admin', 'leader', 'student')),
  full_name text,
  mssv      text
);

alter table public.profiles enable row level security;

-- Hàm kiểm tra quyền Admin: kiểm tra public.admins hoặc role admin trong profiles
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) or exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Xử lý làm sạch nếu dữ liệu cũ có trùng MSSV trước khi tạo Unique Index:
-- Giữ lại profile đầu tiên, gán NULL cho các profile trùng sau
update public.profiles p
set mssv = null
where p.mssv is not null
  and btrim(p.mssv) <> ''
  and p.user_id in (
    select user_id
    from (
      select user_id,
             row_number() over (partition by btrim(mssv) order by user_id) as rn
      from public.profiles
      where mssv is not null and btrim(mssv) <> ''
    ) t
    where t.rn > 1
  );

-- Đảm bảo không MSSV nào bị gán cho nhiều hơn 1 profile
create unique index if not exists profiles_mssv_unique_idx
  on public.profiles (mssv)
  where mssv is not null and btrim(mssv) <> '';

-- Drop và tạo lại các policy cụ thể cho profiles do migration quản lý
drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_read_all on public.profiles;

-- Mỗi sinh viên chỉ đọc được profile của chính mình
create policy profiles_read_self
  on public.profiles
  for select to authenticated
  using (auth.uid() = user_id);

-- Admin toàn quyền xem, thêm, sửa, xóa profiles
create policy profiles_admin_all
  on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Phân quyền bảng profiles: anon bị thu hồi, authenticated có quyền qua RLS
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

-- 2) Danh sách lớp sinh viên -------------------------------------------

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
  ('123001058', 'Nguyễn Khánh Hoà'),
  ('123000185', 'Lê Văn Minh'),
  ('123000872', 'Nguyễn Đình Hậu'),
  ('125000798', 'Nguyễn Minh Khang'),
  ('123001188', 'Phạm Anh Tuấn'),
  ('125000550', 'Nguyễn Duy Tiến'),
  ('123000432', 'Trần Thành Long'),
  ('123000375', 'Phạm Đinh Tài Lộc'),
  ('123001394', 'Đỗ Văn Quyền'),
  ('125000890', 'Lê Ngô Gia Bảo'),
  ('125001087', 'Cao Anh Tú')
on conflict (mssv) do update
set name = excluded.name;

-- Xóa sinh viên đã nghỉ (Nguyễn Duy Phúc - 125000287)
delete from public.students where mssv = '125000287';
update public.profiles set mssv = null where mssv = '125000287';

-- Chống trùng MSSV trong một phiên
create unique index if not exists attendance_session_mssv_uq
  on public.attendance (session_id, mssv);

-- 3) RLS và Constraints bảng sessions, attendance, students ------------

alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.students enable row level security;

-- Cột status cho attendance
alter table public.attendance
  add column if not exists status text not null default 'có mặt';

do $$
declare
  v_def text;
begin
  select upper(pg_get_constraintdef(oid))
    into v_def
  from pg_constraint
  where conrelid = 'public.attendance'::regclass
    and conname = 'attendance_status_check';

  if not found then
    alter table public.attendance
      add constraint attendance_status_check
      check (
        status is not null
        and status in ('có mặt', 'vắng có phép', 'vắng không phép')
      ) not valid;
  elsif position('STATUS IS NOT NULL' in v_def) = 0 then
    alter table public.attendance
      drop constraint attendance_status_check;

    alter table public.attendance
      add constraint attendance_status_check
      check (
        status is not null
        and status in ('có mặt', 'vắng có phép', 'vắng không phép')
      ) not valid;
  end if;
end $$;

alter table public.attendance
  alter column device_id drop not null;

-- Partial unique index cho device_id: mỗi thiết bị chỉ được điểm danh 1 MSSV trong 1 phiên
do $$
declare
  v_index_oid oid;
  v_is_partial boolean;
  v_constraint_name text;
begin
  select i.indexrelid, i.indpred is not null
    into v_index_oid, v_is_partial
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  join pg_namespace ns on ns.oid = ic.relnamespace
  where ns.nspname = 'public'
    and ic.relname = 'attendance_session_device_uq'
    and i.indrelid = 'public.attendance'::regclass;

  if v_index_oid is null then
    create unique index attendance_session_device_uq
      on public.attendance (session_id, device_id)
      where device_id is not null;
  elsif not v_is_partial then
    select conname
      into v_constraint_name
    from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conindid = v_index_oid
      and contype = 'u';

    if v_constraint_name is not null then
      execute format(
        'alter table public.attendance drop constraint %I',
        v_constraint_name
      );
    else
      drop index public.attendance_session_device_uq;
    end if;

    create unique index attendance_session_device_uq
      on public.attendance (session_id, device_id)
      where device_id is not null;
  end if;
end $$;

-- Ràng buộc refresh_time
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_refresh_time_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_refresh_time_check
      check (
        refresh_time is not null
        and refresh_time > 0
        and refresh_time <= 86400
      ) not valid;
  end if;
end $$;

-- Ràng buộc duration_min
do $$
declare
  v_def text;
begin
  select upper(pg_get_constraintdef(oid))
    into v_def
  from pg_constraint
  where conrelid = 'public.sessions'::regclass
    and conname = 'sessions_duration_min_check';

  if not found then
    alter table public.sessions
      add constraint sessions_duration_min_check
      check (
        duration_min is null
        or (duration_min > 0 and duration_min <= 10080)
      ) not valid;
  elsif position('DURATION_MIN IS NOT NULL' in v_def) > 0 then
    alter table public.sessions
      drop constraint sessions_duration_min_check;

    alter table public.sessions
      add constraint sessions_duration_min_check
      check (
        duration_min is null
        or (duration_min > 0 and duration_min <= 10080)
      ) not valid;
  end if;
end $$;

-- Xóa các policy cụ thể của migration này (không lặp qua pg_policies)
drop policy if exists sessions_admin_all on public.sessions;
drop policy if exists attendance_admin_all on public.attendance;
drop policy if exists students_admin_read on public.students;

create policy sessions_admin_all
  on public.sessions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy attendance_admin_all
  on public.attendance
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy students_admin_read
  on public.students
  for select to authenticated
  using (public.is_admin());

revoke all on public.sessions, public.attendance, public.students from anon;
grant select, insert, update, delete on public.sessions, public.attendance, public.students to authenticated;

-- 4) RPC tiện ích & QR Token ------------------------------------------

create or replace function public.server_now_ms()
returns bigint
language sql
volatile
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

revoke all on function public.server_now_ms() from public;
grant execute on function public.server_now_ms() to anon, authenticated;

create or replace function public.get_open_session()
returns jsonb
language sql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id,
    'session_name', s.session_name,
    'refresh_time', coalesce(s.refresh_time, 20),
    'duration_min', s.duration_min,
    'started_at', s.started_at,
    'is_paused', coalesce(s.is_paused, false),
    'paused_at', s.paused_at,
    'server_now_ms', (extract(epoch from clock_timestamp()) * 1000)::bigint
  )
  from public.sessions s
  where s.is_open
    and (
      s.duration_min is null
      or s.started_at + (s.duration_min * interval '1 minute') > now()
    )
  order by s.started_at desc
  limit 1
$$;

revoke all on function public.get_open_session() from public;
grant execute on function public.get_open_session() to anon, authenticated;

create or replace function public._qr_sig(
  p_secret text,
  p_session text,
  p_win bigint
)
returns text
language sql
immutable
as $$
  select left(
    encode(
      hmac(p_session || ':' || p_win::text, p_secret, 'sha256'),
      'hex'
    ),
    24
  )
$$;

revoke all on function public._qr_sig(text, text, bigint)
  from public, anon, authenticated;

create or replace function public.issue_qr_token(p_session_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s record;
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_started_ms bigint;
  v_cycle bigint;
  v_win bigint;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
    into s
  from public.sessions
  where id::text = p_session_id
    and is_open;

  if not found then
    raise exception 'session not open' using errcode = 'P0002';
  end if;

  if coalesce(s.refresh_time, 20) <= 0
     or coalesce(s.refresh_time, 20) > 86400 then
    raise exception 'invalid refresh_time' using errcode = 'P0003';
  end if;

  if s.duration_min is not null
     and s.started_at + (s.duration_min * interval '1 minute') <= now() then
    raise exception 'session expired' using errcode = 'P0004';
  end if;

  -- Nếu phiên đang tạm dừng, lấy thời gian lúc tạm dừng
  if coalesce(s.is_paused, false) and s.paused_at is not null then
    v_now := (extract(epoch from s.paused_at) * 1000)::bigint;
  end if;

  v_started_ms := (extract(epoch from s.started_at) * 1000)::bigint;
  v_cycle := coalesce(s.refresh_time, 20) * 1000;
  v_win := greatest(0::bigint, (v_now - v_started_ms) / v_cycle);

  return jsonb_build_object(
    'token',
    v_win::text || '.' || public._qr_sig(s.qr_secret, s.id::text, v_win),
    'is_paused', coalesce(s.is_paused, false),
    'server_now_ms',
    v_now
  );
end;
$$;

revoke all on function public.issue_qr_token(text) from public, anon;
grant execute on function public.issue_qr_token(text) to authenticated;

-- 4b) RPC admin_toggle_pause: Tạm dừng / Tiếp tục đếm ngược QR
create or replace function public.admin_toggle_pause(p_session_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s record;
  v_is_paused boolean;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
    into s
  from public.sessions
  where id::text = p_session_id
    and is_open;

  if not found then
    raise exception 'session not open' using errcode = 'P0002';
  end if;

  if coalesce(s.is_paused, false) then
    -- Đang tạm dừng -> TIẾP TỤC (RESUME)
    -- Đẩy lùi started_at theo khoảng thời gian đã pause để giữ nguyên chu kỳ countdown
    update public.sessions
    set is_paused = false,
        started_at = started_at + (v_now - s.paused_at),
        paused_at = null
    where id = s.id;
    v_is_paused := false;
  else
    -- Đang chạy -> TẠM DỪNG (PAUSE)
    update public.sessions
    set is_paused = true,
        paused_at = v_now
    where id = s.id;
    v_is_paused := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'is_paused', v_is_paused
  );
end;
$$;

revoke all on function public.admin_toggle_pause(text) from public, anon;
grant execute on function public.admin_toggle_pause(text) to authenticated;


-- 5) RPC submit_attendance (Đăng nhập + Quét QR) -----------------------
drop function if exists public.submit_attendance(text, bigint, text, text, text, text);

create or replace function public.submit_attendance(
  p_session_id text,
  p_token text,
  p_mssv text,
  p_category text,
  p_note text,
  p_device_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s record;
  v_profile_mssv text;
  v_mssv text;
  v_name text;
  v_existing_status text;
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_cycle bigint;
  v_start bigint;
  v_win bigint;
  v_started_ms bigint;
  v_tol bigint;
  v_clean_device text := btrim(coalesce(p_device_id, ''));
  v_clean_cat text := btrim(coalesce(p_category, ''));
  v_clean_session text := btrim(coalesce(p_session_id, ''));
  v_raw_meta_mssv text;
begin
  -- 1. XÁC THỰC MSSV (Ưu tiên tài khoản đăng nhập, hoặc MSSV sinh viên cung cấp)
  if v_uid is not null then
    -- 1a. Người dùng có phiên đăng nhập
    select p.mssv into v_profile_mssv
    from public.profiles p
    where p.user_id = v_uid;

    v_profile_mssv := btrim(coalesce(v_profile_mssv, ''));

    -- TỰ ĐỘNG LIÊN KẾT NẾU PROFILES CHƯA CÓ NHƯNG METADATA ĐĂNG KÝ CÓ MSSV TRONG DANH SÁCH LỚP
    if v_profile_mssv = '' then
      select coalesce(
        nullif(btrim(u.raw_user_meta_data->>'mssv'), ''),
        nullif(btrim(u.raw_user_meta_data->>'username'), '')
      ) into v_raw_meta_mssv
      from auth.users u
      where u.id = v_uid;

      if v_raw_meta_mssv is not null and exists (
        select 1 from public.students where mssv = v_raw_meta_mssv
      ) and not exists (
        select 1 from public.profiles where mssv = v_raw_meta_mssv and user_id <> v_uid
      ) then
        v_profile_mssv := v_raw_meta_mssv;
        update public.profiles
        set mssv = v_profile_mssv
        where user_id = v_uid;
      end if;
    end if;

    -- Nếu vẫn chưa có MSSV thì dùng p_mssv nếu p_mssv hợp lệ trong danh sách lớp và chưa ai nhận
    if v_profile_mssv = '' and p_mssv is not null and btrim(p_mssv) <> '' then
      if exists (
        select 1 from public.students where mssv = btrim(p_mssv)
      ) and not exists (
        select 1 from public.profiles where mssv = btrim(p_mssv) and user_id <> v_uid
      ) then
        v_profile_mssv := btrim(p_mssv);
        update public.profiles
        set mssv = v_profile_mssv
        where user_id = v_uid;
      end if;
    end if;

    if v_profile_mssv = '' then
      return jsonb_build_object(
        'ok', false,
        'code', 'NO_MSSV',
        'message', 'Tài khoản chưa có MSSV hợp lệ trong danh sách lớp.'
      );
    end if;

    v_mssv := v_profile_mssv;
  else
    -- 1b. Sinh viên đã đăng nhập lần trước trên máy / quét qua app ngoài, không bắt đăng nhập lại
    if p_mssv is null or btrim(p_mssv) = '' then
      return jsonb_build_object(
        'ok', false,
        'code', 'NO_MSSV',
        'message', 'Vui lòng cung cấp MSSV của bạn để điểm danh.'
      );
    end if;
    v_mssv := btrim(p_mssv);
  end if;

  -- 2. KIỂM TRA THÔNG TIN ĐẦU VÀO & REGEX TOKEN QR
  if v_clean_session = ''
     or v_clean_cat = ''
     or v_clean_device = ''
     or p_token is null
     or p_token !~ '^[0-9]{1,12}[.][0-9a-f]{24}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'BAD_INPUT',
      'message', 'Thiếu hoặc sai định dạng thông tin điểm danh.'
    );
  end if;

  -- 3. KIỂM TRA PHIÊN ĐIỂM DANH
  select *
    into s
  from public.sessions
  where id::text = v_clean_session;

  if not found
     or not s.is_open
     or (
       s.duration_min is not null
       and s.started_at + (s.duration_min * interval '1 minute') <= now()
     ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'SESSION_CLOSED',
      'message', 'Phiên điểm danh đã đóng hoặc đã hết giờ.'
    );
  end if;

  -- 4. XÁC THỰC CHỮ KÝ TOKEN QR
  v_win := split_part(p_token, '.', 1)::bigint;

  if split_part(p_token, '.', 2)
     <> public._qr_sig(s.qr_secret, s.id::text, v_win) then
    return jsonb_build_object(
      'ok', false,
      'code', 'TOKEN_INVALID',
      'message', 'Mã QR không hợp lệ, vui lòng quét lại mã trên màn hình.'
    );
  end if;

  -- 5. KIỂM TRA THỜI GIAN HIỆU LỰC TOKEN QR (Hỗ trợ tạm dừng)
  if coalesce(s.is_paused, false) and s.paused_at is not null then
    v_now := (extract(epoch from s.paused_at) * 1000)::bigint;
  end if;

  v_started_ms := (extract(epoch from s.started_at) * 1000)::bigint;
  v_cycle := coalesce(s.refresh_time, 20) * 1000;
  v_start := v_started_ms + (v_win * v_cycle);
  -- Cho phép dung sai ít nhất 30 giây (hoặc 1 chu kỳ) để học sinh quét không bị trễ hạn
  v_tol := greatest(30000::bigint, v_cycle);

  if v_now < v_start - 5000
     or v_now > v_start + v_cycle + v_tol then
    return jsonb_build_object(
      'ok', false,
      'code', 'TOKEN_EXPIRED',
      'message', 'Mã QR đã hết hạn, vui lòng quét lại mã mới nhất.'
    );
  end if;

  -- 7. KIỂM TRA MSSV TRONG DANH SÁCH LỚP
  select name
    into v_name
  from public.students
  where mssv = v_mssv;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_IN_CLASS',
      'message', 'MSSV không có trong danh sách lớp!'
    );
  end if;

  -- 8. KIỂM TRA TRẠNG THÁI ĐIỂM DANH
  select status
    into v_existing_status
  from public.attendance a
  where a.session_id = s.id
    and a.mssv = v_mssv;

  if found then
    if v_existing_status in ('vắng có phép', 'vắng không phép') then
      -- Sinh viên trước đó bị đánh dấu vắng, nay quét QR hợp lệ -> cập nhật có mặt
      update public.attendance
      set status = 'có mặt',
          category = left(v_clean_cat, 60),
          note = left(btrim(coalesce(p_note, '')), 200),
          device_id = v_clean_device,
          created_at = now()
      where session_id = s.id
        and mssv = v_mssv;

      return jsonb_build_object(
        'ok', true,
        'code', 'OK',
        'name', v_name,
        'mssv', v_mssv
      );
    else
      return jsonb_build_object(
        'ok', false,
        'code', 'ALREADY',
        'message', 'Bạn đã điểm danh phiên này rồi.'
      );
    end if;
  end if;

  -- 9. KIỂM TRA THIẾT BỊ: Không cho 1 thiết bị điểm danh cho 2 MSSV khác nhau
  if exists (
    select 1
    from public.attendance a
    where a.session_id = s.id
      and a.device_id = v_clean_device
      and a.mssv <> v_mssv
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'DEVICE_USED',
      'message', 'Thiết bị này đã được dùng để điểm danh cho MSSV khác trong phiên.'
    );
  end if;

  -- 10. GHI NHẬN ĐIỂM DANH
  insert into public.attendance (
    session_id,
    mssv,
    full_name,
    status,
    category,
    note,
    device_id
  )
  values (
    s.id,
    v_mssv,
    v_name,
    'có mặt',
    left(v_clean_cat, 60),
    left(btrim(coalesce(p_note, '')), 200),
    v_clean_device
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'name', v_name,
    'mssv', v_mssv
  );

exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'code', 'ALREADY',
      'message', 'MSSV hoặc thiết bị này đã điểm danh phiên này rồi.'
    );
end;
$$;

-- Cấp quyền gọi submit_attendance cho authenticated và anon (học sinh quét link ngoài không cần đăng nhập lại)
revoke all on function public.submit_attendance(text, text, text, text, text, text) from public;
grant execute on function public.submit_attendance(text, text, text, text, text, text) to anon, authenticated;

-- XÓA RPC CŨ KHÔNG DÙNG QR ĐỂ TRÁNH GIAN LẬN
drop function if exists public.submit_attendance_authenticated(text, text, text, text);

-- 6) RPC Quản trị viên (Chỉ Admin) ------------------------------------

create or replace function public.admin_set_status(
  p_session_id text,
  p_mssv text,
  p_status text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s record;
  v_name text;
begin
  if not public.is_admin() then
    return jsonb_build_object(
      'ok', false,
      'message', 'Chỉ admin mới được phép cập nhật trạng thái.'
    );
  end if;

  if p_status is null
     or p_status not in ('có mặt', 'vắng có phép', 'vắng không phép') then
    return jsonb_build_object(
      'ok', false,
      'message', 'Trạng thái không hợp lệ.'
    );
  end if;

  select *
    into s
  from public.sessions
  where id::text = p_session_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Không tìm thấy phiên.'
    );
  end if;

  select name
    into v_name
  from public.students
  where mssv = p_mssv;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Không tìm thấy sinh viên.'
    );
  end if;

  insert into public.attendance (
    session_id,
    mssv,
    full_name,
    status,
    category,
    note,
    device_id
  )
  values (
    s.id,
    p_mssv,
    v_name,
    p_status,
    'Admin Update',
    '',
    null
  )
  on conflict (session_id, mssv)
  do update set status = excluded.status;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_set_status(text, text, text) from public, anon;
grant execute on function public.admin_set_status(text, text, text) to authenticated;

create or replace function public.admin_batch_set_status(
  p_session_id text,
  p_mssv_list text[],
  p_status text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s record;
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

  insert into public.attendance (session_id, mssv, full_name, status, category, note, device_id)
  select s.id, st.mssv, st.name, p_status, 'Admin Batch Update', '', null
  from public.students st
  where st.mssv = any(p_mssv_list)
  on conflict (session_id, mssv)
  do update set status = excluded.status;

  return jsonb_build_object('ok', true, 'count', cardinality(p_mssv_list));
end;
$$;

revoke all on function public.admin_batch_set_status(text, text[], text) from public, anon;
grant execute on function public.admin_batch_set_status(text, text[], text) to authenticated;

-- RPC Đóng phiên: Chỉ đóng đúng phiên có p_session_id, không đóng toàn bộ phiên
create or replace function public.admin_close_session(p_session_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_count int;
  v_sid text := btrim(coalesce(p_session_id, ''));
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ admin mới được phép đóng phiên.');
  end if;

  if v_sid = '' then
    return jsonb_build_object('ok', false, 'message', 'Mã phiên không được để trống.');
  end if;

  update public.sessions
  set is_open = false
  where id::text = v_sid
    and is_open = true;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    if not exists (select 1 from public.sessions where id::text = v_sid) then
      return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên với ID đã cung cấp.');
    else
      return jsonb_build_object('ok', true, 'message', 'Phiên này đã ở trạng thái đóng trước đó.');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'message', 'Đã đóng phiên thành công.');
end;
$$;

revoke all on function public.admin_close_session(text) from public, anon;
grant execute on function public.admin_close_session(text) to authenticated;

-- RPC Liên kết MSSV cho sinh viên (Chỉ Admin nếu muốn gán lại thủ công)
create or replace function public.admin_link_student_mssv(
  p_target_user_id uuid,
  p_mssv text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_clean_mssv text := btrim(coalesce(p_mssv, ''));
  v_student_name text;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ admin mới được phép liên kết MSSV.');
  end if;

  if v_clean_mssv = '' then
    update public.profiles
    set mssv = null
    where user_id = p_target_user_id;

    return jsonb_build_object('ok', true, 'message', 'Đã gỡ liên kết MSSV của tài khoản.');
  end if;

  -- Kiểm tra MSSV trong danh sách sinh viên
  select name into v_student_name
  from public.students
  where mssv = v_clean_mssv;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'MSSV không có trong danh sách lớp.');
  end if;

  -- Kiểm tra xem MSSV đã được gắn cho profile khác chưa
  if exists (
    select 1 from public.profiles
    where mssv = v_clean_mssv and user_id <> p_target_user_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'MSSV này đã được liên kết với một tài khoản khác.');
  end if;

  update public.profiles
  set mssv = v_clean_mssv,
      full_name = coalesce(v_student_name, full_name)
  where user_id = p_target_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy hồ sơ người dùng.');
  end if;

  return jsonb_build_object('ok', true, 'message', 'Đã liên kết MSSV thành công.', 'name', v_student_name);
end;
$$;

revoke all on function public.admin_link_student_mssv(uuid, text) from public, anon;
grant execute on function public.admin_link_student_mssv(uuid, text) to authenticated;

-- 7) Trigger tự động đồng bộ & LIÊN KẾT MSSV khi đăng ký tài khoản mới ----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_base_username text;
  v_username      text;
  v_role          text;
  v_name          text;
  v_raw_mssv      text;
  v_mssv          text := null;
  v_student_name  text;
begin
  -- 1. Base username an toàn từ metadata hoặc email
  v_base_username := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'username'), ''),
    nullif(btrim(split_part(new.email, '@', 1)), ''),
    'user'
  );
  v_username := v_base_username;

  -- Xử lý trùng username: nếu v_username đã tồn tại cho tài khoản khác, thêm hậu tố phân biệt
  if exists (
    select 1 from public.profiles
    where username = v_username and user_id <> new.id
  ) then
    v_username := v_base_username || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
    if exists (
      select 1 from public.profiles
      where username = v_username and user_id <> new.id
    ) then
      v_username := v_base_username || '_' || substr(replace(new.id::text, '-', ''), 1, 12);
    end if;
  end if;

  v_role := 'student';

  -- 2. Tự động lấy MSSV từ lúc đăng ký (metadata mssv hoặc username)
  v_raw_mssv := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'mssv'), ''),
    nullif(btrim(new.raw_user_meta_data->>'username'), '')
  );

  -- Nếu MSSV nằm trong danh sách lớp students và chưa bị tài khoản khác liên kết: TỰ ĐỘNG LIÊN KẾT LUÔN!
  if v_raw_mssv is not null and exists (
    select 1 from public.students where mssv = v_raw_mssv
  ) and not exists (
    select 1 from public.profiles where mssv = v_raw_mssv and user_id <> new.id
  ) then
    v_mssv := v_raw_mssv;
    select name into v_student_name from public.students where mssv = v_mssv;
  end if;

  v_name := coalesce(
    v_student_name,
    nullif(btrim(new.raw_user_meta_data->>'name'), ''),
    nullif(btrim(new.raw_user_meta_data->>'username'), ''),
    v_base_username
  );

  -- 3. Ghi vào public.profiles
  insert into public.profiles (user_id, username, role, full_name, mssv)
  values (new.id, v_username, v_role, v_name, v_mssv)
  on conflict (user_id) do update set
    username  = excluded.username,
    role      = case when public.profiles.role = 'admin' then 'admin' else public.profiles.role end,
    full_name = coalesce(v_student_name, excluded.full_name, public.profiles.full_name),
    mssv      = coalesce(public.profiles.mssv, excluded.mssv);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8) TỰ ĐỘNG ĐỒNG BỘ VÀ LIÊN KẾT MSSV CHO CÁC TÀI KHOẢN ĐÃ CÓ TRƯỚC ĐÓ ----
-- Quét các user trong auth.users: tạo profile nếu thiếu và tự động liên kết MSSV
do $$
declare
  r record;
  v_base text;
  v_uname text;
  v_raw_mssv text;
  v_mssv text;
  v_student_name text;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
  loop
    v_base := coalesce(
      nullif(btrim(r.raw_user_meta_data->>'username'), ''),
      nullif(btrim(split_part(r.email, '@', 1)), ''),
      'user'
    );
    v_uname := v_base;

    if exists (
      select 1 from public.profiles
      where username = v_uname and user_id <> r.id
    ) then
      v_uname := v_base || '_' || substr(replace(r.id::text, '-', ''), 1, 6);
      if exists (
        select 1 from public.profiles
        where username = v_uname and user_id <> r.id
      ) then
        v_uname := v_base || '_' || substr(replace(r.id::text, '-', ''), 1, 12);
      end if;
    end if;

    -- Tìm MSSV từ metadata hoặc username
    v_raw_mssv := coalesce(
      nullif(btrim(r.raw_user_meta_data->>'mssv'), ''),
      nullif(btrim(r.raw_user_meta_data->>'username'), '')
    );
    v_mssv := null;
    v_student_name := null;

    if v_raw_mssv is not null and exists (
      select 1 from public.students where mssv = v_raw_mssv
    ) and not exists (
      select 1 from public.profiles where mssv = v_raw_mssv and user_id <> r.id
    ) then
      v_mssv := v_raw_mssv;
      select name into v_student_name from public.students where mssv = v_mssv;
    end if;

    insert into public.profiles (user_id, username, role, full_name, mssv)
    values (
      r.id,
      v_uname,
      'student',
      coalesce(
        v_student_name,
        nullif(btrim(r.raw_user_meta_data->>'name'), ''),
        nullif(btrim(r.raw_user_meta_data->>'username'), ''),
        v_uname
      ),
      v_mssv
    )
    on conflict (user_id) do update set
      mssv = coalesce(public.profiles.mssv, excluded.mssv),
      full_name = coalesce(v_student_name, public.profiles.full_name, excluded.full_name);
  end loop;
end $$;

-- Cập nhật trực tiếp cho tất cả profile hiện có nếu đang thiếu mssv mà metadata có mssv hợp lệ
update public.profiles p
set mssv = btrim(u.raw_user_meta_data->>'mssv'),
    full_name = coalesce(st.name, p.full_name)
from auth.users u
join public.students st on st.mssv = btrim(u.raw_user_meta_data->>'mssv')
where p.user_id = u.id
  and (p.mssv is null or btrim(p.mssv) = '')
  and u.raw_user_meta_data->>'mssv' is not null
  and not exists (
    select 1 from public.profiles p2
    where p2.mssv = btrim(u.raw_user_meta_data->>'mssv')
      and p2.user_id <> p.user_id
  );
