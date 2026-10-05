-- =====================================================================
-- DIEM_DANH — bảo mật phía server
-- Chạy trong Supabase > SQL Editor.
-- Có thể chạy lại; không DROP bảng hoặc dữ liệu.
--
-- Sinh viên (anon) chỉ gọi:
--   get_open_session(), submit_attendance(...), server_now_ms()
-- Admin còn có thể gọi issue_qr_token(...) và admin_set_status(...).
--
-- Giả định các cột hiện có:
--   sessions  : id, session_name, is_open, refresh_time, duration_min, started_at
--   attendance: id, session_id, mssv, full_name, category, note, device_id, created_at
-- =====================================================================

-- 0) Tạo bảng nếu chưa có ---------------------------------------------

create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  session_name text not null,
  is_open      boolean not null default true,
  refresh_time int not null default 20,
  duration_min int default 5, -- NULL = không giới hạn thời gian
  started_at   timestamptz not null default now()
);

-- Cho phép NULL cả trên bảng đã tồn tại.
alter table public.sessions
  alter column duration_min drop not null;

-- Dùng đúng kiểu public.sessions.id cho attendance.session_id.
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

-- Bật Realtime cho attendance.
do $$
begin
  alter publication supabase_realtime add table public.attendance;
exception
  when duplicate_object then null;
end $$;

-- 0b) Allowlist admin + secret ký token QR -----------------------------

create extension if not exists pgcrypto with schema extensions;

-- Mỗi phiên có secret riêng; không trả secret ra client.
alter table public.sessions
  add column if not exists qr_secret text not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

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
  )
$$;

-- Thêm UUID admin vào allowlist bằng thao tác quản trị riêng.
-- Ví dụ:
-- insert into public.admins (user_id)
-- values ('uuid-cua-ban')
-- on conflict (user_id) do nothing;

-- 1) Danh sách lớp -----------------------------------------------------

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
  ('123001394', 'Đỗ Văn Quyền'),
  ('125000890', 'Lê Ngô Gia Bảo'),
  ('125001087', 'Cao Anh Tú')
on conflict (mssv) do update
set name = excluded.name;

-- Chống trùng MSSV trong một phiên.
create unique index if not exists attendance_session_mssv_uq
  on public.attendance (session_id, mssv);

-- 2) RLS và các constraint --------------------------------------------

alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.students enable row level security;

-- Chỉ thêm refresh_time constraint nếu chưa có.
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

-- duration_min có thể NULL. Nâng cấp constraint cũ nếu nó cấm NULL;
-- nếu constraint đúng đã được validate, trạng thái đó được giữ nguyên.
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

-- Xóa policy cũ trên các bảng này rồi tạo lại policy chặt chẽ bên dưới.
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('sessions', 'attendance', 'students')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      p.policyname,
      p.tablename
    );
  end loop;
end $$;

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

-- 3) RPC ---------------------------------------------------------------

create or replace function public.server_now_ms()
returns bigint
language sql
volatile
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

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

  v_win := v_now / (coalesce(s.refresh_time, 20) * 1000);

  return jsonb_build_object(
    'token',
    v_win::text || '.' || public._qr_sig(s.qr_secret, s.id::text, v_win),
    'server_now_ms',
    v_now
  );
end;
$$;

-- Gỡ RPC cũ nhận token số.
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
  s record;
  v_name text;
  v_existing_status text;
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_cycle bigint;
  v_start bigint;
  v_win bigint;
  v_tol constant bigint := 3000; -- dung sai 3 giây
begin
  if v_mssv = ''
     or coalesce(btrim(p_category), '') = ''
     or coalesce(btrim(p_device_id), '') = ''
     or p_token is null
     or p_token !~ '^[0-9]{1,12}\.[0-9a-f]{24}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'BAD_INPUT',
      'message', 'Thiếu thông tin điểm danh.'
    );
  end if;

  select *
    into s
  from public.sessions
  where id::text = p_session_id;

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

  v_win := split_part(p_token, '.', 1)::bigint;

  if split_part(p_token, '.', 2)
     <> public._qr_sig(s.qr_secret, s.id::text, v_win) then
    return jsonb_build_object(
      'ok', false,
      'code', 'TOKEN_INVALID',
      'message', 'Mã QR không hợp lệ, vui lòng quét lại mã trên màn hình.'
    );
  end if;

  v_cycle := coalesce(s.refresh_time, 20) * 1000;
  v_start := v_win * v_cycle;

  if v_now < v_start - v_tol
     or v_now > v_start + v_cycle + v_tol then
    return jsonb_build_object(
      'ok', false,
      'code', 'TOKEN_EXPIRED',
      'message', 'Mã QR đã hết hạn, vui lòng quét lại mã mới nhất.'
    );
  end if;

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

  select status
    into v_existing_status
  from public.attendance a
  where a.session_id = s.id
    and a.mssv = v_mssv;

  if found then
    if v_existing_status in ('vắng có phép', 'vắng không phép') then
      -- Sinh viên trước đó bị đánh dấu vắng nay quét QR hợp lệ -> cập nhật lại có mặt
      update public.attendance
      set status = 'có mặt',
          category = left(btrim(p_category), 60),
          note = left(btrim(coalesce(p_note, '')), 200),
          device_id = p_device_id,
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

  if exists (
    select 1
    from public.attendance a
    where a.session_id = s.id
      and a.device_id = p_device_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'DEVICE_USED',
      'message', 'Thiết bị này đã được dùng để điểm danh cho MSSV khác.'
    );
  end if;

  insert into public.attendance (
    session_id,
    mssv,
    full_name,
    category,
    note,
    device_id
  )
  values (
    s.id,
    v_mssv,
    v_name,
    left(btrim(p_category), 60),
    left(btrim(coalesce(p_note, '')), 200),
    p_device_id
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

revoke all on function public.server_now_ms() from public;
revoke all on function public.get_open_session() from public;
revoke all on function public.submit_attendance(text, text, text, text, text, text) from public;
revoke all on function public.issue_qr_token(text) from public;
revoke all on function public.is_admin() from public;

grant execute on function public.server_now_ms() to anon, authenticated;
grant execute on function public.get_open_session() to anon, authenticated;
grant execute on function public.submit_attendance(text, text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.issue_qr_token(text) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- =====================================================================
-- TÀI KHOẢN SINH VIÊN, ĐỘI TRƯỞNG & TRẠNG THÁI ĐIỂM DANH
-- =====================================================================

-- 1) Profiles ----------------------------------------------------------

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

create policy profiles_read_self
  on public.profiles
  for select to authenticated
  using (auth.uid() = user_id);

create policy profiles_admin_all
  on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 2) Trạng thái điểm danh ---------------------------------------------

alter table public.attendance
  add column if not exists status text not null default 'có mặt';

-- Nâng cấp constraint cũ nếu nó chưa cấm NULL.
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

-- Chuyển index cũ sang partial index một lần.
-- Các lần chạy sau giữ nguyên index partial hiện có.
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

-- 3) RPC cập nhật trạng thái: chỉ admin -------------------------------

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

revoke all on function public.admin_set_status(text, text, text) from public;
grant execute on function public.admin_set_status(text, text, text) to authenticated;

-- 4) RPC cập nhật trạng thái hàng loạt (Batch update - hiệu năng cao) ---
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

revoke all on function public.admin_batch_set_status(text, text[], text) from public;
grant execute on function public.admin_batch_set_status(text, text[], text) to authenticated;

-- 5) Cập nhật kiểm tra Admin mở rộng (public.admins, profiles, và metadata)
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
    where user_id = auth.uid() and role = 'admin'
  ) or exists (
    select 1
    from auth.users
    where id = auth.uid() and raw_user_meta_data->>'app_role' = 'admin'
  );
$$;

-- 6) RPC đóng phiên an toàn cho Admin
create or replace function public.admin_close_session(p_session_id text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ admin mới được phép đóng phiên.');
  end if;

  if p_session_id is not null and btrim(p_session_id) <> '' then
    update public.sessions
    set is_open = false
    where id::text = p_session_id;
  end if;

  -- Luôn đảm bảo tất cả phiên đang mở đều được đóng
  update public.sessions
  set is_open = false
  where is_open = true;

  return jsonb_build_object('ok', true, 'message', 'Đã đóng phiên thành công.');
end;
$$;

revoke all on function public.admin_close_session(text) from public;
grant execute on function public.admin_close_session(text) to authenticated;

-- 7) Tự động đồng bộ tài khoản mới đăng ký vào bảng profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_username text;
  v_role     text;
  v_name     text;
  v_mssv     text;
begin
  v_username := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'username'), ''),
    nullif(btrim(split_part(new.email, '@', 1)), ''),
    'user_' || substr(replace(new.id::text, '-', ''), 1, 8)
  );

  v_role := coalesce(nullif(btrim(new.raw_user_meta_data->>'app_role'), ''), 'student');
  if v_role not in ('admin', 'leader', 'student') then
    v_role := 'student';
  end if;

  v_mssv := nullif(btrim(new.raw_user_meta_data->>'mssv'), '');
  v_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'name'), ''), v_username);

  -- Tự lấy họ tên từ danh sách lớp nếu có MSSV
  if v_mssv is not null and (v_name = v_username or v_name is null) then
    select name into v_name from public.students where mssv = v_mssv;
    if v_name is null then v_name := v_username; end if;
  end if;

  insert into public.profiles (user_id, username, role, full_name, mssv)
  values (new.id, v_username, v_role, v_name, v_mssv)
  on conflict (user_id) do update set
    username  = excluded.username,
    role      = excluded.role,
    full_name = excluded.full_name,
    mssv      = coalesce(excluded.mssv, public.profiles.mssv);

  -- Nếu là admin, tự động đưa vào bảng public.admins
  if v_role = 'admin' then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8) RPC điểm danh cho Sinh viên đã đăng nhập (không cần quét QR)
create or replace function public.submit_attendance_authenticated(
  p_session_id text,
  p_category text default 'Đi học',
  p_note text default '',
  p_device_id text default null
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
  v_mssv text;
  v_name text;
  v_existing_status text;
begin
  if v_uid is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHORIZED',
      'message', 'Bạn chưa đăng nhập.'
    );
  end if;

  -- Lấy MSSV từ profiles hoặc auth metadata
  select mssv into v_mssv from public.profiles where user_id = v_uid;
  if v_mssv is null or btrim(v_mssv) = '' then
    select raw_user_meta_data->>'mssv' into v_mssv from auth.users where id = v_uid;
  end if;

  v_mssv := btrim(coalesce(v_mssv, ''));
  if v_mssv = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_MSSV',
      'message', 'Tài khoản chưa được liên kết MSSV. Vui lòng liên hệ Admin.'
    );
  end if;

  -- Kiểm tra phiên
  select * into s from public.sessions where id::text = p_session_id;
  if not found or not s.is_open or (
    s.duration_min is not null and s.started_at + (s.duration_min * interval '1 minute') <= now()
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'SESSION_CLOSED',
      'message', 'Phiên điểm danh đã đóng hoặc đã hết giờ.'
    );
  end if;

  -- Lấy tên sinh viên từ danh sách lớp
  select name into v_name from public.students where mssv = v_mssv;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_IN_CLASS',
      'message', 'MSSV không có trong danh sách lớp!'
    );
  end if;

  -- Kiểm tra đã điểm danh chưa
  select status into v_existing_status
  from public.attendance
  where session_id = s.id and mssv = v_mssv;

  if found then
    if v_existing_status in ('vắng có phép', 'vắng không phép') then
      update public.attendance
      set status = 'có mặt',
          category = left(btrim(coalesce(p_category, 'Đi học')), 60),
          note = left(btrim(coalesce(p_note, '')), 200),
          device_id = p_device_id,
          created_at = now()
      where session_id = s.id and mssv = v_mssv;

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

  -- Kiểm tra thiết bị nếu có device_id
  if p_device_id is not null and btrim(p_device_id) <> '' then
    if exists (
      select 1 from public.attendance
      where session_id = s.id and device_id = p_device_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'DEVICE_USED',
        'message', 'Thiết bị này đã được dùng để điểm danh cho MSSV khác trong phiên.'
      );
    end if;
  end if;

  -- Thêm bản ghi điểm danh
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
    left(btrim(coalesce(p_category, 'Đi học')), 60),
    left(btrim(coalesce(p_note, '')), 200),
    p_device_id
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

revoke all on function public.submit_attendance_authenticated(text, text, text, text) from public;
grant execute on function public.submit_attendance_authenticated(text, text, text, text) to authenticated;


