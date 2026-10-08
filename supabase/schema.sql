-- =====================================================================
-- LH-NaviX — Schema v2.0
-- Chạy lại nhiều lần an toàn
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  session_name    text not null,
  is_open         boolean not null default true,
  duration_min    int,
  warn_before_min int not null default 5,
  started_at      timestamptz not null default now(),
  qr_token        text,
  qr_born_at      timestamptz default now()
);

alter table public.sessions add column if not exists warn_before_min int not null default 5;
alter table public.sessions add column if not exists qr_token text;
alter table public.sessions add column if not exists qr_born_at timestamptz default now();

update public.sessions
  set qr_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  where qr_token is null;

alter table public.sessions alter column qr_token set not null;

create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  mssv       text not null,
  full_name  text,
  status     text not null default 'có mặt'
              check (status in ('có mặt','đi muộn','vắng có phép','vắng không phép')),
  category   text,
  note       text,
  device_id  text,
  created_at timestamptz not null default now()
);

alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('có mặt','đi muộn','vắng có phép','vắng không phép'));

create unique index if not exists attendance_session_mssv_uq
  on public.attendance (session_id, mssv);
create unique index if not exists attendance_session_device_uq
  on public.attendance (session_id, device_id) where device_id is not null;
create index if not exists attendance_session_idx
  on public.attendance (session_id, created_at desc);

-- Bảng Audit Log ghi nhận lịch sử thay đổi trạng thái điểm danh
create table if not exists public.attendance_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  mssv         text not null,
  student_name text,
  old_status   text,
  new_status   text not null,
  changed_by   text not null default 'Admin',
  reason       text,
  changed_at   timestamptz not null default now()
);

create index if not exists idx_attendance_audit_logs_session
  on public.attendance_audit_logs (session_id, changed_at desc);

create table if not exists public.students (
  mssv text primary key,
  name text not null
);

insert into public.students (mssv, name) values
  ('123000555','Nguyễn Lê Vũ Duy'),('123000078','Trần Hải Nam'),
  ('125001579','Nguyễn Thiện Nhân'),('124000534','Nguyễn Ngọc Bình An'),
  ('125001875','Nguyễn Hoàng Phi Hùng'),('124000737','Phạm Tuấn Phát'),
  ('125001809','Nguyễn Thanh Thái'),('124001238','Nguyễn Đức Huy'),
  ('124001851','Nguyễn Thị Thùy'),('124000354','Phan Công Thịnh'),
  ('124001589','Nguyễn Hồng Hiệp'),('125000568','Phan Quốc Bảo'),
  ('125002381','Cao Thế Phi'),('123000651','Cao Thanh Nghĩa'),
  ('125001648','Nguyễn Thanh Tiến'),('125000372','Nguyễn Huỳnh Minh Thông'),
  ('123000722','Bùi Trần Thanh Sang'),('123001058','Nguyễn Khánh Hoà'),
  ('123000185','Lê Văn Minh'),('123000872','Nguyễn Đình Hậu'),
  ('125000798','Nguyễn Minh Khang'),('123001188','Phạm Anh Tuấn'),
  ('125000550','Nguyễn Duy Tiến'),('123000432','Trần Thành Long'),
  ('123000375','Phạm Đinh Tài Lộc'),('123001394','Đỗ Văn Quyền'),
  ('125000890','Lê Ngô Gia Bảo'),('125001087','Cao Anh Tú'),
  ('124001273','Vũ Tiến Dũng'),('122000426','Nguyễn Văn Hậu'),
  ('125001343','Dương Công Mạnh')
on conflict (mssv) do update set name = excluded.name;

create table if not exists public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  username  text unique,
  full_name text,
  mssv      text unique
);

create table if not exists public.admin_mssv (
  mssv text primary key,
  added_at timestamptz not null default now()
);

-- ⚠️ SỬA MSSV CỦA BẠN
insert into public.admin_mssv (mssv) values ('123001058')
on conflict (mssv) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare v_mssv text; v_name text;
begin
  v_mssv := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'mssv'), ''),
    nullif(btrim(split_part(new.email, '@', 1)), '')
  );
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'name'), ''),
    (select name from public.students where mssv = v_mssv),
    v_mssv
  );
  insert into public.profiles (user_id, username, full_name, mssv)
  values (new.id, v_mssv, v_name, v_mssv)
  on conflict (user_id) do update set
    full_name = coalesce(excluded.full_name, profiles.full_name),
    mssv      = coalesce(profiles.mssv, excluded.mssv);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
declare r record;
begin
  for r in select id, email, raw_user_meta_data from auth.users loop
    insert into public.profiles (user_id, username, full_name, mssv)
    values (
      r.id,
      coalesce(nullif(btrim(r.raw_user_meta_data->>'mssv'), ''), split_part(r.email, '@', 1)),
      coalesce(nullif(btrim(r.raw_user_meta_data->>'name'), ''),
               (select name from public.students
                where mssv = coalesce(nullif(btrim(r.raw_user_meta_data->>'mssv'), ''),
                                      split_part(r.email, '@', 1))),
               split_part(r.email, '@', 1)),
      coalesce(nullif(btrim(r.raw_user_meta_data->>'mssv'), ''), split_part(r.email, '@', 1))
    )
    on conflict (user_id) do update set
      full_name = coalesce(excluded.full_name, profiles.full_name),
      mssv      = coalesce(profiles.mssv, excluded.mssv);
  end loop;
end $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    join public.admin_mssv a on a.mssv = p.mssv
    where p.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.sessions   enable row level security;
alter table public.attendance enable row level security;
alter table public.students   enable row level security;
alter table public.profiles   enable row level security;
alter table public.admin_mssv enable row level security;

drop policy if exists prof_self on public.profiles;
create policy prof_self on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists admin_all_sessions on public.sessions;
create policy admin_all_sessions on public.sessions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_att on public.attendance;
create policy admin_all_att on public.attendance
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists read_students on public.students;
create policy read_students on public.students
  for select using (true);

revoke all on public.sessions, public.attendance, public.students,
              public.admin_mssv, public.profiles from anon, authenticated;
grant select on public.students to authenticated;
grant select on public.profiles to authenticated;
-- ⚠️ BẮT BUỘC: admin.html đọc bảng attendance trực tiếp qua PostgREST.
-- Nếu thiếu GRANT này thì RLS policy vẫn có nhưng Postgres chặn với
-- lỗi 42501 "permission denied for table attendance" -> trang admin
-- luôn hiện 0 điểm danh dù sinh viên quét thành công.
grant select on public.attendance to authenticated;
grant select on public.sessions to authenticated;

alter table public.attendance_audit_logs enable row level security;
drop policy if exists admin_all_audit on public.attendance_audit_logs;
create policy admin_all_audit on public.attendance_audit_logs
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert on public.attendance_audit_logs to authenticated;

create or replace function public.get_open_session()
returns jsonb language sql volatile security definer
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id, 'session_name', s.session_name,
    'duration_min', s.duration_min, 'warn_before_min', s.warn_before_min,
    'started_at', s.started_at, 'qr_token', s.qr_token, 'qr_born_at', s.qr_born_at
  )
  from public.sessions s
  where s.is_open
    and (s.duration_min is null
         or s.started_at + (s.duration_min * interval '1 minute') > now())
  order by s.started_at desc limit 1
$$;

revoke all on function public.get_open_session() from public;
grant execute on function public.get_open_session() to authenticated;

create or replace function public.admin_open_session(
  p_name text, p_duration_min int, p_warn_before_min int default 5
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare v_name text := btrim(coalesce(p_name, '')); v_new_id uuid; v_token text;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'Tên phiên không được để trống.');
  end if;
  update public.sessions set is_open = false where is_open = true;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.sessions (session_name, duration_min, warn_before_min, qr_token, qr_born_at)
  values (v_name, p_duration_min, greatest(1, coalesce(p_warn_before_min, 5)), v_token, now())
  returning id into v_new_id;
  return jsonb_build_object('ok', true, 'session_id', v_new_id, 'qr_token', v_token);
end;
$$;

revoke all on function public.admin_open_session(text, int, int) from public, anon;
grant execute on function public.admin_open_session(text, int, int) to authenticated;

-- Xóa sạch các phiên bản cũ của admin_close_session để tránh lỗi PGRST202 ambiguity overload
drop function if exists public.admin_close_session();
drop function if exists public.admin_close_session(text);

create or replace function public.admin_regenerate_qr()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token text; v_sid uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.sessions set qr_token = v_token, qr_born_at = now()
    where is_open = true returning id into v_sid;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không có phiên nào đang mở.');
  end if;
  return jsonb_build_object('ok', true, 'qr_token', v_token, 'qr_born_at', now());
end;
$$;

revoke all on function public.admin_regenerate_qr() from public, anon;
grant execute on function public.admin_regenerate_qr() to authenticated;

create or replace function public.admin_set_status(
  p_session_id text, p_mssv text, p_status text, p_reason text default null
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text;
  v_sid uuid;
  v_old_status text;
  v_admin_email text := coalesce(auth.jwt() ->> 'email', 'Admin');
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if p_status not in ('có mặt','đi muộn','vắng có phép','vắng không phép') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;
  select name into v_name from public.students where mssv = p_mssv;
  if v_name is null then
    select full_name into v_name from public.attendance where session_id = v_sid and mssv = p_mssv limit 1;
    v_name := coalesce(v_name, p_mssv);
  end if;
  select id into v_sid from public.sessions where id::text = p_session_id;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;

  select status into v_old_status from public.attendance
  where session_id = v_sid and mssv = p_mssv;

  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  values (v_sid, p_mssv, v_name, p_status, 'Admin', coalesce(p_reason, ''))
  on conflict (session_id, mssv) do update set
    status = excluded.status,
    note = case when excluded.note <> '' then excluded.note else public.attendance.note end;

  -- Ghi nhận Audit Log
  insert into public.attendance_audit_logs (
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  ) values (
    v_sid, p_mssv, v_name, coalesce(v_old_status, 'chưa điểm danh'), p_status,
    v_admin_email, nullif(btrim(coalesce(p_reason, '')), ''), now()
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_set_status(text, text, text, text) from public, anon;
grant execute on function public.admin_set_status(text, text, text, text) to authenticated;
drop function if exists public.admin_set_status(text, text, text);

create or replace function public.admin_batch_set_status(
  p_session_id text, p_mssv_list text[], p_status text, p_reason text default null
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_sid uuid;
  v_admin_email text := coalesce(auth.jwt() ->> 'email', 'Admin');
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if p_status not in ('có mặt','đi muộn','vắng có phép','vắng không phép') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;
  select id into v_sid from public.sessions where id::text = btrim(p_session_id);
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;

  -- Ghi nhận Audit Log
  insert into public.attendance_audit_logs (
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  )
  select
    v_sid,
    st.mssv,
    st.name,
    coalesce(a.status, 'chưa điểm danh'),
    p_status,
    v_admin_email,
    coalesce(p_reason, 'Cập nhật hàng loạt'),
    now()
  from public.students st
  left join public.attendance a on a.session_id = v_sid and a.mssv = st.mssv
  where st.mssv = any(p_mssv_list);

  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  select v_sid, st.mssv, st.name, p_status, 'Admin Batch', coalesce(p_reason, '')
  from public.students st where st.mssv = any(p_mssv_list)
  on conflict (session_id, mssv) do update set status = excluded.status;

  return jsonb_build_object('ok', true, 'count', cardinality(p_mssv_list));
end;
$$;

revoke all on function public.admin_batch_set_status(text, text[], text, text) from public, anon;
grant execute on function public.admin_batch_set_status(text, text[], text, text) to authenticated;
drop function if exists public.admin_batch_set_status(text, text[], text);

-- RPC MỞ LẠI PHIÊN ĐIỂM DANH ĐÃ ĐÓNG (closed -> active)
create or replace function public.admin_reopen_session(p_session_id text)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_sid uuid;
  v_token text;
  v_admin_email text := coalesce(auth.jwt() ->> 'email', 'Admin');
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  select id into v_sid from public.sessions where id::text = p_session_id;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;

  update public.sessions set is_open = false where is_open = true and id <> v_sid;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.sessions set
    is_open = true,
    qr_token = v_token,
    qr_born_at = now()
  where id = v_sid;

  insert into public.attendance_audit_logs (
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  ) values (
    v_sid, 'SYSTEM', 'Phiên điểm danh', 'closed', 'active',
    v_admin_email, 'Admin mở lại phiên đã đóng', now()
  );

  return jsonb_build_object('ok', true, 'qr_token', v_token);
end;
$$;

revoke all on function public.admin_reopen_session(text) from public, anon;
grant execute on function public.admin_reopen_session(text) to authenticated;

-- RPC LẤY LỊCH SỬ THAY ĐỔI (AUDIT LOGS) CỦA PHIÊN
create or replace function public.admin_get_audit_logs(p_session_id text)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  return jsonb_build_object('ok', true, 'logs', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'mssv', l.mssv,
      'student_name', l.student_name,
      'old_status', l.old_status,
      'new_status', l.new_status,
      'changed_by', l.changed_by,
      'reason', l.reason,
      'changed_at', l.changed_at
    ) order by l.changed_at desc), '[]'::jsonb)
    from public.attendance_audit_logs l
    where l.session_id::text = btrim(p_session_id)
  ));
end;
$$;

revoke all on function public.admin_get_audit_logs(text) from public, anon;
grant execute on function public.admin_get_audit_logs(text) to authenticated;

create or replace function public.submit_attendance(
  p_session_id text, p_token text, p_mssv text,
  p_category text, p_note text, p_device_id text
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s record; v_mssv text; v_name text; v_existing_status text;
  v_cat text := left(btrim(coalesce(p_category, '')), 60);
  v_note text := left(btrim(coalesce(p_note, '')), 200);
  v_dev text := btrim(coalesce(p_device_id, ''));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTH',
      'message', 'Vui lòng đăng nhập trước khi điểm danh.');
  end if;
  select btrim(mssv) into v_mssv from public.profiles where user_id = v_uid;
  if v_mssv is null or v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_MSSV',
      'message', 'Tài khoản chưa liên kết MSSV.');
  end if;
  if p_token is null or length(p_token) < 20 or v_cat = '' or v_dev = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_INPUT',
      'message', 'Thiếu thông tin điểm danh.');
  end if;
  select * into s from public.sessions where id::text = btrim(p_session_id);
  if not found or not s.is_open
     or (s.duration_min is not null
         and s.started_at + (s.duration_min * interval '1 minute') <= now()) then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED',
      'message', 'Phiên đã đóng hoặc hết giờ.');
  end if;
  if s.qr_token <> p_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_INVALID',
      'message', 'Mã QR không còn hiệu lực. Vui lòng quét mã mới.');
  end if;
  select name into v_name from public.students where mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_CLASS',
      'message', 'MSSV không có trong danh sách lớp.');
  end if;
  select status into v_existing_status from public.attendance
    where session_id = s.id and mssv = v_mssv;
  if found then
    if v_existing_status = 'có mặt' then
      return jsonb_build_object('ok', false, 'code', 'ALREADY',
        'message', 'Bạn đã điểm danh phiên này rồi.');
    else
      update public.attendance
        set status = 'có mặt', category = v_cat, note = v_note,
            device_id = v_dev, created_at = now()
        where session_id = s.id and mssv = v_mssv;
      return jsonb_build_object('ok', true, 'code', 'OK',
        'name', v_name, 'mssv', v_mssv);
    end if;
  end if;
  if exists (
    select 1 from public.attendance
    where session_id = s.id and device_id = v_dev and mssv <> v_mssv
  ) then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_USED',
      'message', 'Thiết bị này đã điểm danh cho sinh viên khác.');
  end if;
  insert into public.attendance (session_id, mssv, full_name, status, category, note, device_id)
  values (s.id, v_mssv, v_name, 'có mặt', v_cat, v_note, v_dev);
  return jsonb_build_object('ok', true, 'code', 'OK',
    'name', v_name, 'mssv', v_mssv, 'session_id', s.id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'ALREADY',
    'message', 'Bạn đã điểm danh phiên này rồi.');
end;
$$;

revoke all on function public.submit_attendance(text,text,text,text,text,text) from public, anon;
grant execute on function public.submit_attendance(text,text,text,text,text,text) to authenticated;

create or replace function public.get_session_summary(p_session_id text)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare v_sid uuid; v_total int; v_present int; v_absent int; v_unmarked int;
begin
  select id into v_sid from public.sessions where id::text = p_session_id;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;
  select count(*) into v_total from public.students;
  select count(*) into v_present from public.attendance
    where session_id = v_sid and status = 'có mặt';
  select count(*) into v_absent from public.attendance
    where session_id = v_sid and status in ('vắng có phép','vắng không phép');
  v_unmarked := v_total - v_present - v_absent;
  return jsonb_build_object('ok', true,
    'total', v_total, 'present', v_present,
    'absent', v_absent, 'unmarked', v_unmarked);
end;
$$;

revoke all on function public.get_session_summary(text) from public, anon;
grant execute on function public.get_session_summary(text) to authenticated;

create or replace function public.get_my_attendance_history(p_mssv text)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_my_mssv text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'Chưa đăng nhập.');
  end if;
  select mssv into v_my_mssv from public.profiles where user_id = v_uid;
  if v_my_mssv is null or v_my_mssv <> btrim(p_mssv) then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  return jsonb_build_object('ok', true, 'records', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'session_name', s.session_name, 'started_at', s.started_at,
      'status', a.status, 'category', a.category,
      'note', a.note, 'checked_at', a.created_at
    ) order by a.created_at desc), '[]'::jsonb)
    from public.attendance a
    join public.sessions s on s.id = a.session_id
    where a.mssv = btrim(p_mssv)
  ));
end;
$$;

revoke all on function public.get_my_attendance_history(text) from public, anon;
grant execute on function public.get_my_attendance_history(text) to authenticated;

create or replace function public.admin_today_sessions()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  return jsonb_build_object('ok', true, 'sessions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'session_name', s.session_name,
      'started_at', s.started_at, 'is_open', s.is_open,
      'present', (select count(*) from public.attendance a
                  where a.session_id = s.id and a.status = 'có mặt'),
      'absent', (select count(*) from public.attendance a
                 where a.session_id = s.id
                 and a.status in ('vắng có phép','vắng không phép')),
      'total', (select count(*) from public.students)
    ) order by s.started_at desc), '[]'::jsonb)
    from public.sessions s
    where s.started_at >= current_date
      and s.started_at < current_date + interval '1 day'
  ));
end;
$$;

revoke all on function public.admin_today_sessions() from public, anon;
grant execute on function public.admin_today_sessions() to authenticated;

create or replace function public.admin_delete_attendance()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as 
declare
  v_att_count int;
  v_sess_count int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  
  -- Xóa hồ sơ điểm danh
  delete from public.attendance;
  get diagnostics v_att_count = row_count;
  
  -- Xóa các phiên đã đóng trong lịch sử hôm nay
  delete from public.sessions where is_open = false;
  get diagnostics v_sess_count = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_att_count, 'sessions_deleted', v_sess_count);
end;
;

revoke all on function public.admin_delete_attendance() from public, anon;
grant execute on function public.admin_delete_attendance() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.attendance;
exception when duplicate_object then null; end $$;


-- ====================================================================
-- MIGRATION: TÍCH HỢP ĐỐI CHIẾU LỊCH HỌC TRƯỜNG & CHỐNG GIAN LẬN ĐIỂM DANH
-- Chạy script này trên Supabase SQL Editor
-- ====================================================================

-- 1. BẢNG LƯU LỊCH HỌC TRƯỜNG CỦA SINH VIÊN
create table if not exists public.student_schedules (
  id           uuid primary key default gen_random_uuid(),
  mssv         text not null references public.students(mssv) on delete cascade,
  subject_name text not null,
  room_name    text,
  teacher_name text,
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  day_of_week  int,
  created_at   timestamptz not null default now()
);

create index if not exists idx_student_schedules_lookup
  on public.student_schedules (mssv, start_time, end_time);

alter table public.student_schedules enable row level security;

drop policy if exists "Allow read student_schedules" on public.student_schedules;
create policy "Allow read student_schedules" on public.student_schedules
  for select to authenticated using (true);

-- Đảm bảo sinh viên 125001343 có trong bảng students nếu chưa có
insert into public.students (mssv, name)
values ('125001343', 'Dương Công Mạnh')
on conflict (mssv) do nothing;

-- RPC ĐỒNG BỘ LỊCH HỌC TỪ ME LÊN SUPABASE
create or replace function public.admin_sync_student_schedules(p_schedules jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  if p_schedules is null or jsonb_array_length(p_schedules) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Danh sách lịch học trống.');
  end if;

  delete from public.student_schedules where id is not null;

  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week
  )
  select
    x.mssv,
    x.subject_name,
    x.room_name,
    x.teacher_name,
    x.start_time,
    x.end_time,
    x.day_of_week
  from jsonb_to_recordset(p_schedules) as x(
    mssv text,
    subject_name text,
    room_name text,
    teacher_name text,
    start_time timestamptz,
    end_time timestamptz,
    day_of_week int
  );

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

revoke all on function public.admin_sync_student_schedules(jsonb) from public, anon;
grant execute on function public.admin_sync_student_schedules(jsonb) to authenticated;


-- 2. CẬP NHẬT admin_open_session:
-- Khi Admin mở phiên xưởng: Tự động ghi nhận "vắng có phép (Học trường)" cho SV có lịch học trùng ca này
create or replace function public.admin_open_session(
  p_name text, p_duration_min int, p_warn_before_min int default 5
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_new_id uuid;
  v_token text;
  v_sess_start timestamptz := now();
  v_sess_end timestamptz;
  v_dur int := coalesce(p_duration_min, 240);
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'Tên phiên không được để trống.');
  end if;

  update public.sessions set is_open = false where is_open = true;

  v_sess_end := v_sess_start + (v_dur * interval '1 minute');
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.sessions (session_name, duration_min, warn_before_min, qr_token, qr_born_at, started_at)
  values (v_name, p_duration_min, greatest(1, coalesce(p_warn_before_min, 5)), v_token, v_sess_start, v_sess_start)
  returning id into v_new_id;

  -- Tự động đánh dấu "vắng có phép" cho các sinh viên có lịch học trường trùng ca này
  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  select distinct on (st.mssv)
    v_new_id,
    st.mssv,
    st.name,
    'vắng có phép',
    'Học trường',
    'Lịch học: ' || sch.subject_name || coalesce(' (' || sch.room_name || ')', '')
  from public.students st
  join public.student_schedules sch on sch.mssv = st.mssv
  where sch.start_time < v_sess_end
    and sch.end_time > v_sess_start
  order by st.mssv, sch.start_time asc
  on conflict (session_id, mssv) do nothing;

  return jsonb_build_object('ok', true, 'session_id', v_new_id, 'qr_token', v_token);
end;
$$;

revoke all on function public.admin_open_session(text, int, int) from public, anon;
grant execute on function public.admin_open_session(text, int, int) to authenticated;

-- 3. CẬP NHẬT submit_attendance:
-- Khi SV quét QR ở xưởng: TỪ CHỐI nếu SV đang có lịch học trên trường trong ca này
create or replace function public.submit_attendance(
  p_session_id text, p_token text, p_mssv text,
  p_category text, p_note text, p_device_id text
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s record;
  v_mssv text;
  v_name text;
  v_existing_status text;
  v_cat text := left(btrim(coalesce(p_category, '')), 60);
  v_note text := left(btrim(coalesce(p_note, '')), 200);
  v_dev text := btrim(coalesce(p_device_id, ''));
  v_sess_end timestamptz;
  v_sch_sub text;
  v_sch_room text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTH',
      'message', 'Vui lòng đăng nhập trước khi điểm danh.');
  end if;

  select btrim(mssv) into v_mssv from public.profiles where user_id = v_uid;
  if v_mssv is null or v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_MSSV',
      'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  if p_token is null or length(p_token) < 20 or v_cat = '' or v_dev = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_INPUT',
      'message', 'Thiếu thông tin điểm danh.');
  end if;

  select * into s from public.sessions where id::text = btrim(p_session_id);
  if not found or not s.is_open
     or (s.duration_min is not null
         and s.started_at + (s.duration_min * interval '1 minute') <= now()) then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED',
      'message', 'Phiên đã đóng hoặc hết giờ.');
  end if;

  if s.qr_token <> p_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_INVALID',
      'message', 'Mã QR không còn hiệu lực. Vui lòng quét mã mới.');
  end if;

  select name into v_name from public.students where mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_CLASS',
      'message', 'MSSV không có trong danh sách lớp.');
  end if;

  -- KIỂM TRA TRÙNG LỊCH HỌC TRƯỜNG:
  -- Nếu sinh viên có lịch học tại thời điểm này nhưng có mặt quét QR ở xưởng thì vẫn cho phép điểm danh và lưu ghi chú
  select subject_name, room_name into v_sch_sub, v_sch_room
  from public.student_schedules
  where mssv = v_mssv
    and now() >= start_time
    and now() <= end_time
  order by start_time asc limit 1;

  if v_sch_sub is not null and (v_note is null or v_note = '') then
    v_note := 'Trùng lịch: ' || v_sch_sub || coalesce(' (' || v_sch_room || ')', '');
  end if;

  select status into v_existing_status from public.attendance
    where session_id = s.id and mssv = v_mssv;
  if found then
    if v_existing_status = 'có mặt' then
      return jsonb_build_object('ok', false, 'code', 'ALREADY',
        'message', 'Bạn đã điểm danh phiên này rồi.');
    else
      update public.attendance
        set status = 'có mặt', category = v_cat, note = v_note,
            device_id = v_dev, created_at = now()
        where session_id = s.id and mssv = v_mssv;
      return jsonb_build_object('ok', true, 'code', 'OK',
        'name', v_name, 'mssv', v_mssv);
    end if;
  end if;

  if exists (
    select 1 from public.attendance
    where session_id = s.id and device_id = v_dev and mssv <> v_mssv
  ) then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_USED',
      'message', 'Thiết bị này đã điểm danh cho sinh viên khác.');
  end if;

  insert into public.attendance (session_id, mssv, full_name, status, category, note, device_id)
  values (s.id, v_mssv, v_name, 'có mặt', v_cat, v_note, v_dev);

  return jsonb_build_object('ok', true, 'code', 'OK',
    'name', v_name, 'mssv', v_mssv, 'session_id', s.id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'ALREADY',
    'message', 'Bạn đã điểm danh phiên này rồi.');
end;
$$;

revoke all on function public.submit_attendance(text,text,text,text,text,text) from public, anon;
grant execute on function public.submit_attendance(text,text,text,text,text,text) to authenticated;

-- 4. CẬP NHẬT admin_close_session:
-- Khi đóng phiên: Tự động đánh "vắng không phép" cho các bạn còn lại chưa quét
create or replace function public.admin_close_session(p_session_id text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_sid uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  if p_session_id is not null and btrim(p_session_id) <> '' then
    select id into v_sid from public.sessions where id::text = btrim(p_session_id);
  else
    select id into v_sid from public.sessions where is_open = true limit 1;
  end if;

  if v_sid is not null then
    -- Tự động đánh "vắng không phép" cho các sinh viên rảnh mà không quét QR
    insert into public.attendance (session_id, mssv, full_name, status, category, note)
    select
      v_sid,
      st.mssv,
      st.name,
      'vắng không phép',
      'Xưởng',
      'Không có lịch trường & không quét QR'
    from public.students st
    where not exists (
      select 1 from public.attendance a
      where a.session_id = v_sid and a.mssv = st.mssv
    )
    on conflict (session_id, mssv) do nothing;

    update public.sessions set is_open = false where id = v_sid;
  end if;

  update public.sessions set is_open = false where is_open = true;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_close_session(text) from public, anon;
grant execute on function public.admin_close_session(text) to authenticated;



-- 5. RPC XÓA LỊCH SỬ CÁC PHIÊN ĐÃ ĐÓNG
create or replace function public.admin_delete_history()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as 
declare
  v_count int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  -- Xóa tất cả các phiên đã đóng -> cascade xóa sạch attendance liên quan
  delete from public.sessions where is_open = false;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_count);
end;
;

revoke all on function public.admin_delete_history() from public, anon;
grant execute on function public.admin_delete_history() to authenticated;

-- 6. RPC LẤY LỊCH SỬ 7 PHIÊN GẦN NHẤT TRONG 7 NGÀY
create or replace function public.admin_today_sessions()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as 
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  return jsonb_build_object('ok', true, 'sessions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'session_name', s.session_name,
      'started_at', s.started_at,
      'duration_min', s.duration_min,
      'is_open', s.is_open,
      'status', case when s.is_open then 'active' else 'closed' end,
      'present', (select count(*) from public.attendance a
                  where a.session_id = s.id and a.status = 'có mặt'),
      'late', (select count(*) from public.attendance a
               where a.session_id = s.id and a.status = 'đi muộn'),
      'absent', (select count(*) from public.attendance a
                 where a.session_id = s.id and a.status = 'vắng không phép'),
      'excused', (select count(*) from public.attendance a
                  where a.session_id = s.id and a.status = 'vắng có phép'),
      'total', (select count(*) from public.students)
    ) order by s.started_at desc), '[]'::jsonb)
    from (
      select * from public.sessions s
      order by s.started_at desc
      limit 50
    ) s
  ));
end;
;

revoke all on function public.admin_today_sessions() from public, anon;
grant execute on function public.admin_today_sessions() to authenticated;

-- 7. RPC XEM LỊCH SỬ ĐIỂM DANH CÁ NHÂN
create or replace function public.get_my_attendance_history(p_mssv text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_res jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'checked_at', a.created_at,
    'session_name', s.session_name,
    'status', a.status
  ) order by a.created_at desc)
  into v_res
  from public.attendance a
  join public.sessions s on a.session_id = s.id
  where a.mssv = p_mssv;

  return jsonb_build_object(
    'ok', true,
    'records', coalesce(v_res, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_attendance_history(text) from public, anon;
grant execute on function public.get_my_attendance_history(text) to authenticated;
