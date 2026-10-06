-- =====================================================================
-- LH-NaviX — Schema gọn v2.0
-- Chạy lại nhiều lần an toàn
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Bảng sessions
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

-- Bảng attendance
create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  mssv       text not null,
  full_name  text,
  status     text not null default 'có mặt'
              check (status in ('có mặt','vắng có phép','vắng không phép')),
  category   text,
  note       text,
  device_id  text,
  created_at timestamptz not null default now()
);

create unique index if not exists attendance_session_mssv_uq
  on public.attendance (session_id, mssv);
create unique index if not exists attendance_session_device_uq
  on public.attendance (session_id, device_id) where device_id is not null;
create index if not exists attendance_session_idx
  on public.attendance (session_id, created_at desc);

-- Bảng students
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
  ('125000890','Lê Ngô Gia Bảo'),('125001087','Cao Anh Tú')
on conflict (mssv) do update set name = excluded.name;

-- Bảng profiles
create table if not exists public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  username  text unique,
  full_name text,
  mssv      text unique
);

-- Bảng admin whitelist
create table if not exists public.admin_mssv (
  mssv text primary key,
  added_at timestamptz not null default now()
);

-- ⚠️ SỬA THÀNH MSSV CỦA BẠN
insert into public.admin_mssv (mssv) values ('123001058')
on conflict (mssv) do nothing;

-- Trigger tạo profile khi có user mới
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_mssv text;
  v_name text;
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

-- Đồng bộ profile cho user đã có
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

-- Hàm kiểm tra admin
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    join public.admin_mssv a on a.mssv = p.mssv
    where p.user_id = auth.uid()
  );
$$;

revoke all   on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- RLS
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
  for select to authenticated using (true);

revoke all on public.sessions, public.attendance, public.students,
              public.admin_mssv, public.profiles from anon, authenticated;
grant select on public.students to authenticated;
grant select on public.profiles to authenticated;

-- RPC: lấy phiên đang mở
create or replace function public.get_open_session()
returns jsonb
language sql volatile security definer
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

-- RPC: admin mở phiên
create or replace function public.admin_open_session(
  p_name text, p_duration_min int, p_warn_before_min int default 5
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_new_id uuid; v_token text;
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

-- RPC: admin đóng phiên
create or replace function public.admin_close_session()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  update public.sessions set is_open = false where is_open = true;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_close_session() from public, anon;
grant execute on function public.admin_close_session() to authenticated;

-- RPC: admin đổi QR
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

-- RPC: admin đổi trạng thái 1 SV
create or replace function public.admin_set_status(
  p_session_id text, p_mssv text, p_status text
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare v_name text; v_sid uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if p_status not in ('có mặt','vắng có phép','vắng không phép') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;
  select name into v_name from public.students where mssv = p_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên.');
  end if;
  select id into v_sid from public.sessions where id::text = p_session_id;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;
  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  values (v_sid, p_mssv, v_name, p_status, 'Admin', '')
  on conflict (session_id, mssv) do update set status = excluded.status;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_set_status(text, text, text) from public, anon;
grant execute on function public.admin_set_status(text, text, text) to authenticated;

-- RPC: admin đổi trạng thái nhiều SV
create or replace function public.admin_batch_set_status(
  p_session_id text, p_mssv_list text[], p_status text
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare v_sid uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if p_status not in ('có mặt','vắng có phép','vắng không phép') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;
  select id into v_sid from public.sessions where id::text = p_session_id;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;
  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  select v_sid, st.mssv, st.name, p_status, 'Admin Batch', ''
  from public.students st where st.mssv = any(p_mssv_list)
  on conflict (session_id, mssv) do update set status = excluded.status;
  return jsonb_build_object('ok', true, 'count', cardinality(p_mssv_list));
end;
$$;

revoke all on function public.admin_batch_set_status(text, text[], text) from public, anon;
grant execute on function public.admin_batch_set_status(text, text[], text) to authenticated;

-- RPC: SV điểm danh
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

-- RPC: tổng kết phiên
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

-- RPC: lịch sử điểm danh của SV
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

-- RPC: lịch sử phiên hôm nay (admin)
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

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.attendance;
exception when duplicate_object then null; end $$;
