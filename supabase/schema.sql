-- =====================================================================
-- LH-NaviX â€” Schema v2.0
-- Cháº¡y láº¡i nhiá»u láº§n an toÃ n
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
  status     text not null default 'cÃ³ máº·t'
              check (status in ('cÃ³ máº·t','Ä‘i muá»™n','váº¯ng cÃ³ phÃ©p','váº¯ng khÃ´ng phÃ©p')),
  category   text,
  note       text,
  device_id  text,
  created_at timestamptz not null default now()
);

alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('cÃ³ máº·t','Ä‘i muá»™n','váº¯ng cÃ³ phÃ©p','váº¯ng khÃ´ng phÃ©p'));

create unique index if not exists attendance_session_mssv_uq
  on public.attendance (session_id, mssv);
create unique index if not exists attendance_session_device_uq
  on public.attendance (session_id, device_id) where device_id is not null;
create index if not exists attendance_session_idx
  on public.attendance (session_id, created_at desc);

-- Báº£ng Audit Log ghi nháº­n lá»‹ch sá»­ thay Ä‘á»•i tráº¡ng thÃ¡i Ä‘iá»ƒm danh
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
  ('123000555','Nguyá»…n LÃª VÅ© Duy'),('123000078','Tráº§n Háº£i Nam'),
  ('125001579','Nguyá»…n Thiá»‡n NhÃ¢n'),('124000534','Nguyá»…n Ngá»c BÃ¬nh An'),
  ('125001875','Nguyá»…n HoÃ ng Phi HÃ¹ng'),('124000737','Pháº¡m Tuáº¥n PhÃ¡t'),
  ('125001809','Nguyá»…n Thanh ThÃ¡i'),('124001238','Nguyá»…n Äá»©c Huy'),
  ('124001851','Nguyá»…n Thá»‹ ThÃ¹y'),('124000354','Phan CÃ´ng Thá»‹nh'),
  ('124001589','Nguyá»…n Há»“ng Hiá»‡p'),('125000568','Phan Quá»‘c Báº£o'),
  ('125002381','Cao Tháº¿ Phi'),('123000651','Cao Thanh NghÄ©a'),
  ('125001648','Nguyá»…n Thanh Tiáº¿n'),('125000372','Nguyá»…n Huá»³nh Minh ThÃ´ng'),
  ('123000722','BÃ¹i Tráº§n Thanh Sang'),('123001058','Nguyá»…n KhÃ¡nh HoÃ '),
  ('123000185','LÃª VÄƒn Minh'),('123000872','Nguyá»…n ÄÃ¬nh Háº­u'),
  ('125000798','Nguyá»…n Minh Khang'),('123001188','Pháº¡m Anh Tuáº¥n'),
  ('125000550','Nguyá»…n Duy Tiáº¿n'),('123000432','Tráº§n ThÃ nh Long'),
  ('123000375','Pháº¡m Äinh TÃ i Lá»™c'),('123001394','Äá»— VÄƒn Quyá»n'),
  ('125000890','LÃª NgÃ´ Gia Báº£o'),('125001087','Cao Anh TÃº'),
  ('124001273','VÅ© Tiáº¿n DÅ©ng'),('122000426','Nguyá»…n VÄƒn Háº­u'),
  ('125001343','DÆ°Æ¡ng CÃ´ng Máº¡nh')
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

-- âš ï¸ Sá»¬A MSSV Cá»¦A Báº N
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
    full_name = coalesce(excluded.full_name, profiles.name),
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
      full_name = coalesce(excluded.full_name, profiles.name),
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
-- âš ï¸ Báº®T BUá»˜C: admin.html Ä‘á»c báº£ng attendance trá»±c tiáº¿p qua PostgREST.
-- Náº¿u thiáº¿u GRANT nÃ y thÃ¬ RLS policy váº«n cÃ³ nhÆ°ng Postgres cháº·n vá»›i
-- lá»—i 42501 "permission denied for table attendance" -> trang admin
-- luÃ´n hiá»‡n 0 Ä‘iá»ƒm danh dÃ¹ sinh viÃªn quÃ©t thÃ nh cÃ´ng.
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
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'TÃªn phiÃªn khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.');
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

-- XÃ³a sáº¡ch cÃ¡c phiÃªn báº£n cÅ© cá»§a admin_close_session Ä‘á»ƒ trÃ¡nh lá»—i PGRST202 ambiguity overload
drop function if exists public.admin_close_session();
drop function if exists public.admin_close_session(text);

create or replace function public.admin_regenerate_qr()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token text; v_sid uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.sessions set qr_token = v_token, qr_born_at = now()
    where is_open = true returning id into v_sid;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ phiÃªn nÃ o Ä‘ang má»Ÿ.');
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
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;
  if p_status not in ('cÃ³ máº·t','Ä‘i muá»™n','váº¯ng cÃ³ phÃ©p','váº¯ng khÃ´ng phÃ©p') then
    return jsonb_build_object('ok', false, 'message', 'Tráº¡ng thÃ¡i khÃ´ng há»£p lá»‡.');
  end if;
  select name into v_name from public.students where mssv = p_mssv;
  if v_name is null then
    select full_name into v_name from public.attendance where session_id = v_sid and mssv = p_mssv limit 1;
    v_name := coalesce(v_name, p_mssv);
  end if;
  select id into v_sid from public.sessions where id::text = p_session_id;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng tÃ¬m tháº¥y phiÃªn.');
  end if;

  select status into v_old_status from public.attendance
  where session_id = v_sid and mssv = p_mssv;

  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  values (v_sid, p_mssv, v_name, p_status, 'Admin', coalesce(p_reason, ''))
  on conflict (session_id, mssv) do update set
    status = excluded.status,
    note = case when excluded.note <> '' then excluded.note else public.attendance.note end;

  -- Ghi nháº­n Audit Log
  insert into public.attendance_audit_logs (
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  ) values (
    v_sid, p_mssv, v_name, coalesce(v_old_status, 'chÆ°a Ä‘iá»ƒm danh'), p_status,
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
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;
  if p_status not in ('cÃ³ máº·t','Ä‘i muá»™n','váº¯ng cÃ³ phÃ©p','váº¯ng khÃ´ng phÃ©p') then
    return jsonb_build_object('ok', false, 'message', 'Tráº¡ng thÃ¡i khÃ´ng há»£p lá»‡.');
  end if;
  select id into v_sid from public.sessions where id::text = btrim(p_session_id);
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng tÃ¬m tháº¥y phiÃªn.');
  end if;

  -- Ghi nháº­n Audit Log
  insert into public.attendance_audit_logs (
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  )
  select
    v_sid,
    st.mssv,
    st.name,
    coalesce(a.status, 'chÆ°a Ä‘iá»ƒm danh'),
    p_status,
    v_admin_email,
    coalesce(p_reason, 'Cáº­p nháº­t hÃ ng loáº¡t'),
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

-- RPC Má»ž Láº I PHIÃŠN ÄIá»‚M DANH ÄÃƒ ÄÃ“NG (closed -> active)
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
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;

  select id into v_sid from public.sessions where id::text = p_session_id;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng tÃ¬m tháº¥y phiÃªn.');
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
    v_sid, 'SYSTEM', 'PhiÃªn Ä‘iá»ƒm danh', 'closed', 'active',
    v_admin_email, 'Admin má»Ÿ láº¡i phiÃªn Ä‘Ã£ Ä‘Ã³ng', now()
  );

  return jsonb_build_object('ok', true, 'qr_token', v_token);
end;
$$;

revoke all on function public.admin_reopen_session(text) from public, anon;
grant execute on function public.admin_reopen_session(text) to authenticated;

-- RPC Láº¤Y Lá»ŠCH Sá»¬ THAY Äá»”I (AUDIT LOGS) Cá»¦A PHIÃŠN
create or replace function public.admin_get_audit_logs(p_session_id text)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
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
      'message', 'Vui lÃ²ng Ä‘Äƒng nháº­p trÆ°á»›c khi Ä‘iá»ƒm danh.');
  end if;
  select btrim(mssv) into v_mssv from public.profiles where user_id = v_uid;
  if v_mssv is null or v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_MSSV',
      'message', 'TÃ i khoáº£n chÆ°a liÃªn káº¿t MSSV.');
  end if;
  if p_token is null or length(p_token) < 20 or v_cat = '' or v_dev = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_INPUT',
      'message', 'Thiáº¿u thÃ´ng tin Ä‘iá»ƒm danh.');
  end if;
  select * into s from public.sessions where id::text = btrim(p_session_id);
  if not found or not s.is_open
     or (s.duration_min is not null
         and s.started_at + (s.duration_min * interval '1 minute') <= now()) then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED',
      'message', 'PhiÃªn Ä‘Ã£ Ä‘Ã³ng hoáº·c háº¿t giá».');
  end if;
  if s.qr_token <> p_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_INVALID',
      'message', 'MÃ£ QR khÃ´ng cÃ²n hiá»‡u lá»±c. Vui lÃ²ng quÃ©t mÃ£ má»›i.');
  end if;
  select name into v_name from public.students where mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_CLASS',
      'message', 'MSSV khÃ´ng cÃ³ trong danh sÃ¡ch lá»›p.');
  end if;
  select status into v_existing_status from public.attendance
    where session_id = s.id and mssv = v_mssv;
  if found then
    if v_existing_status = 'cÃ³ máº·t' then
      return jsonb_build_object('ok', false, 'code', 'ALREADY',
        'message', 'Báº¡n Ä‘Ã£ Ä‘iá»ƒm danh phiÃªn nÃ y rá»“i.');
    else
      update public.attendance
        set status = 'cÃ³ máº·t', category = v_cat, note = v_note,
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
      'message', 'Thiáº¿t bá»‹ nÃ y Ä‘Ã£ Ä‘iá»ƒm danh cho sinh viÃªn khÃ¡c.');
  end if;
  insert into public.attendance (session_id, mssv, full_name, status, category, note, device_id)
  values (s.id, v_mssv, v_name, 'cÃ³ máº·t', v_cat, v_note, v_dev);
  return jsonb_build_object('ok', true, 'code', 'OK',
    'name', v_name, 'mssv', v_mssv, 'session_id', s.id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'ALREADY',
    'message', 'Báº¡n Ä‘Ã£ Ä‘iá»ƒm danh phiÃªn nÃ y rá»“i.');
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
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng tÃ¬m tháº¥y phiÃªn.');
  end if;
  select count(*) into v_total from public.students;
  select count(*) into v_present from public.attendance
    where session_id = v_sid and status = 'cÃ³ máº·t';
  select count(*) into v_absent from public.attendance
    where session_id = v_sid and status in ('váº¯ng cÃ³ phÃ©p','váº¯ng khÃ´ng phÃ©p');
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
  as $
  declare
    v_uid uuid := auth.uid();
    v_my_mssv text;
  begin
    if v_uid is null then
      return jsonb_build_object('ok', false, 'message', 'Chưa đăng nhập.');
    end if;

    select btrim(mssv) into v_my_mssv from public.profiles where user_id = v_uid;
    if v_my_mssv is null or v_my_mssv <> btrim(p_mssv) then
      return jsonb_build_object('ok', false, 'message', 'Không có quyền xem lịch sử của người khác.');
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
  $;

revoke all on function public.get_my_attendance_history(text) from public, anon;
grant execute on function public.get_my_attendance_history(text) to authenticated;

create or replace function public.admin_today_sessions()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;
  return jsonb_build_object('ok', true, 'sessions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'session_name', s.session_name,
      'started_at', s.started_at, 'is_open', s.is_open,
      'present', (select count(*) from public.attendance a
                  where a.session_id = s.id and a.status = 'cÃ³ máº·t'),
      'absent', (select count(*) from public.attendance a
                 where a.session_id = s.id
                 and a.status in ('váº¯ng cÃ³ phÃ©p','váº¯ng khÃ´ng phÃ©p')),
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
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;
  
  -- XÃ³a há»“ sÆ¡ Ä‘iá»ƒm danh
  delete from public.attendance;
  get diagnostics v_att_count = row_count;
  
  -- XÃ³a cÃ¡c phiÃªn Ä‘Ã£ Ä‘Ã³ng trong lá»‹ch sá»­ hÃ´m nay
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
-- MIGRATION: TÃCH Há»¢P Äá»I CHIáº¾U Lá»ŠCH Há»ŒC TRÆ¯á»œNG & CHá»NG GIAN Láº¬N ÄIá»‚M DANH
-- Cháº¡y script nÃ y trÃªn Supabase SQL Editor
-- ====================================================================

-- 1. Báº¢NG LÆ¯U Lá»ŠCH Há»ŒC TRÆ¯á»œNG Cá»¦A SINH VIÃŠN
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

-- Äáº£m báº£o sinh viÃªn 125001343 cÃ³ trong báº£ng students náº¿u chÆ°a cÃ³
insert into public.students (mssv, name)
values ('125001343', 'DÆ°Æ¡ng CÃ´ng Máº¡nh')
on conflict (mssv) do nothing;

-- RPC Äá»’NG Bá»˜ Lá»ŠCH Há»ŒC Tá»ª ME LÃŠN SUPABASE
create or replace function public.admin_sync_student_schedules(p_schedules jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;

  if p_schedules is null or jsonb_array_length(p_schedules) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Danh sÃ¡ch lá»‹ch há»c trá»‘ng.');
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


-- 2. Cáº¬P NHáº¬T admin_open_session:
-- Khi Admin má»Ÿ phiÃªn xÆ°á»Ÿng: Tá»± Ä‘á»™ng ghi nháº­n "váº¯ng cÃ³ phÃ©p (Há»c trÆ°á»ng)" cho SV cÃ³ lá»‹ch há»c trÃ¹ng ca nÃ y
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
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'TÃªn phiÃªn khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.');
  end if;

  update public.sessions set is_open = false where is_open = true;

  v_sess_end := v_sess_start + (v_dur * interval '1 minute');
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.sessions (session_name, duration_min, warn_before_min, qr_token, qr_born_at, started_at)
  values (v_name, p_duration_min, greatest(1, coalesce(p_warn_before_min, 5)), v_token, v_sess_start, v_sess_start)
  returning id into v_new_id;

  -- Tá»± Ä‘á»™ng Ä‘Ã¡nh dáº¥u "váº¯ng cÃ³ phÃ©p" cho cÃ¡c sinh viÃªn cÃ³ lá»‹ch há»c trÆ°á»ng trÃ¹ng ca nÃ y
  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  select distinct on (st.mssv)
    v_new_id,
    st.mssv,
    st.name,
    'váº¯ng cÃ³ phÃ©p',
    'Há»c trÆ°á»ng',
    'Lá»‹ch há»c: ' || sch.subject_name || coalesce(' (' || sch.room_name || ')', '')
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

-- 3. Cáº¬P NHáº¬T submit_attendance:
-- Khi SV quÃ©t QR á»Ÿ xÆ°á»Ÿng: Tá»ª CHá»I náº¿u SV Ä‘ang cÃ³ lá»‹ch há»c trÃªn trÆ°á»ng trong ca nÃ y
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
      'message', 'Vui lÃ²ng Ä‘Äƒng nháº­p trÆ°á»›c khi Ä‘iá»ƒm danh.');
  end if;

  select btrim(mssv) into v_mssv from public.profiles where user_id = v_uid;
  if v_mssv is null or v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_MSSV',
      'message', 'TÃ i khoáº£n chÆ°a liÃªn káº¿t MSSV.');
  end if;

  if p_token is null or length(p_token) < 20 or v_cat = '' or v_dev = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_INPUT',
      'message', 'Thiáº¿u thÃ´ng tin Ä‘iá»ƒm danh.');
  end if;

  select * into s from public.sessions where id::text = btrim(p_session_id);
  if not found or not s.is_open
     or (s.duration_min is not null
         and s.started_at + (s.duration_min * interval '1 minute') <= now()) then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED',
      'message', 'PhiÃªn Ä‘Ã£ Ä‘Ã³ng hoáº·c háº¿t giá».');
  end if;

  if s.qr_token <> p_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_INVALID',
      'message', 'MÃ£ QR khÃ´ng cÃ²n hiá»‡u lá»±c. Vui lÃ²ng quÃ©t mÃ£ má»›i.');
  end if;

  select name into v_name from public.students where mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_CLASS',
      'message', 'MSSV khÃ´ng cÃ³ trong danh sÃ¡ch lá»›p.');
  end if;

  -- KIá»‚M TRA TRÃ™NG Lá»ŠCH Há»ŒC TRÆ¯á»œNG:
  -- Náº¿u sinh viÃªn cÃ³ lá»‹ch há»c táº¡i thá»i Ä‘iá»ƒm nÃ y nhÆ°ng cÃ³ máº·t quÃ©t QR á»Ÿ xÆ°á»Ÿng thÃ¬ váº«n cho phÃ©p Ä‘iá»ƒm danh vÃ  lÆ°u ghi chÃº
  select subject_name, room_name into v_sch_sub, v_sch_room
  from public.student_schedules
  where mssv = v_mssv
    and now() >= start_time
    and now() <= end_time
  order by start_time asc limit 1;

  if v_sch_sub is not null and (v_note is null or v_note = '') then
    v_note := 'TrÃ¹ng lá»‹ch: ' || v_sch_sub || coalesce(' (' || v_sch_room || ')', '');
  end if;

  select status into v_existing_status from public.attendance
    where session_id = s.id and mssv = v_mssv;
  if found then
    if v_existing_status = 'cÃ³ máº·t' then
      return jsonb_build_object('ok', false, 'code', 'ALREADY',
        'message', 'Báº¡n Ä‘Ã£ Ä‘iá»ƒm danh phiÃªn nÃ y rá»“i.');
    else
      update public.attendance
        set status = 'cÃ³ máº·t', category = v_cat, note = v_note,
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
      'message', 'Thiáº¿t bá»‹ nÃ y Ä‘Ã£ Ä‘iá»ƒm danh cho sinh viÃªn khÃ¡c.');
  end if;

  insert into public.attendance (session_id, mssv, full_name, status, category, note, device_id)
  values (s.id, v_mssv, v_name, 'cÃ³ máº·t', v_cat, v_note, v_dev);

  return jsonb_build_object('ok', true, 'code', 'OK',
    'name', v_name, 'mssv', v_mssv, 'session_id', s.id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'ALREADY',
    'message', 'Báº¡n Ä‘Ã£ Ä‘iá»ƒm danh phiÃªn nÃ y rá»“i.');
end;
$$;

revoke all on function public.submit_attendance(text,text,text,text,text,text) from public, anon;
grant execute on function public.submit_attendance(text,text,text,text,text,text) to authenticated;

-- 4. Cáº¬P NHáº¬T admin_close_session:
-- Khi Ä‘Ã³ng phiÃªn: Tá»± Ä‘á»™ng Ä‘Ã¡nh "váº¯ng khÃ´ng phÃ©p" cho cÃ¡c báº¡n cÃ²n láº¡i chÆ°a quÃ©t
create or replace function public.admin_close_session(p_session_id text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_sid uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;

  if p_session_id is not null and btrim(p_session_id) <> '' then
    select id into v_sid from public.sessions where id::text = btrim(p_session_id);
  else
    select id into v_sid from public.sessions where is_open = true limit 1;
  end if;

  if v_sid is not null then
    -- Tá»± Ä‘á»™ng Ä‘Ã¡nh "váº¯ng khÃ´ng phÃ©p" cho cÃ¡c sinh viÃªn ráº£nh mÃ  khÃ´ng quÃ©t QR
    insert into public.attendance (session_id, mssv, full_name, status, category, note)
    select
      v_sid,
      st.mssv,
      st.name,
      'váº¯ng khÃ´ng phÃ©p',
      'XÆ°á»Ÿng',
      'KhÃ´ng cÃ³ lá»‹ch trÆ°á»ng & khÃ´ng quÃ©t QR'
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



-- 5. RPC XÃ“A Lá»ŠCH Sá»¬ CÃC PHIÃŠN ÄÃƒ ÄÃ“NG
create or replace function public.admin_delete_history()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as 
declare
  v_count int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;

  -- XÃ³a táº¥t cáº£ cÃ¡c phiÃªn Ä‘Ã£ Ä‘Ã³ng -> cascade xÃ³a sáº¡ch attendance liÃªn quan
  delete from public.sessions where is_open = false;
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_count);
end;
;

revoke all on function public.admin_delete_history() from public, anon;
grant execute on function public.admin_delete_history() to authenticated;

-- 6. RPC Láº¤Y Lá»ŠCH Sá»¬ 7 PHIÃŠN Gáº¦N NHáº¤T TRONG 7 NGÃ€Y
create or replace function public.admin_today_sessions()
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as 
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'KhÃ´ng cÃ³ quyá»n.');
  end if;

  return jsonb_build_object('ok', true, 'sessions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'session_name', s.session_name,
      'started_at', s.started_at,
      'duration_min', s.duration_min,
      'is_open', s.is_open,
      'status', case when s.is_open then 'active' else 'closed' end,
      'present', (select count(*) from public.attendance a
                  where a.session_id = s.id and a.status = 'cÃ³ máº·t'),
      'late', (select count(*) from public.attendance a
               where a.session_id = s.id and a.status = 'Ä‘i muá»™n'),
      'absent', (select count(*) from public.attendance a
                 where a.session_id = s.id and a.status = 'váº¯ng khÃ´ng phÃ©p'),
      'excused', (select count(*) from public.attendance a
                  where a.session_id = s.id and a.status = 'váº¯ng cÃ³ phÃ©p'),
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

-- 7. RPC XEM Lá»ŠCH Sá»¬ ÄIá»‚M DANH CÃ NHÃ‚N

-- Preserve attendance edits and add admin-managed teams with schedule visibility.

create table if not exists public.attendance_record_history (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  attendance_id uuid not null,
  mssv        text not null,
  student_name text,
  old_record  jsonb not null,
  new_record  jsonb not null,
  changed_by  text not null default 'Admin',
  changed_at  timestamptz not null default now()
);

create index if not exists idx_attendance_record_history_session
  on public.attendance_record_history (session_id, changed_at desc);

alter table public.attendance_record_history enable row level security;
drop policy if exists admin_read_attendance_record_history on public.attendance_record_history;
create policy admin_read_attendance_record_history on public.attendance_record_history
  for select to authenticated using (public.is_admin());
grant select on public.attendance_record_history to authenticated;

create or replace function public.capture_attendance_record_history()
returns trigger language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_changed_by text;
begin
  if (to_jsonb(old) - 'id') is not distinct from (to_jsonb(new) - 'id') then
    return new;
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), nullif(auth.jwt() ->> 'email', ''), 'Admin')
    into v_changed_by
  from (select auth.uid() as user_id) u
  left join public.profiles p on p.user_id = u.user_id;

  insert into public.attendance_record_history (
    session_id, attendance_id, mssv, student_name, old_record, new_record, changed_by, changed_at
  ) values (
    old.session_id, old.id, old.mssv, coalesce(old.full_name, new.full_name),
    jsonb_build_object('status', old.status, 'category', old.category, 'note', old.note, 'checked_at', old.created_at),
    jsonb_build_object('status', new.status, 'category', new.category, 'note', new.note, 'checked_at', new.created_at),
    coalesce(v_changed_by, 'Admin'), now()
  );
  return new;
end;
$$;

drop trigger if exists attendance_record_history_after_update on public.attendance;
create trigger attendance_record_history_after_update
  after update on public.attendance
  for each row execute function public.capture_attendance_record_history();

create or replace function public.admin_get_attendance_record_history(p_session_id text)
returns jsonb language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  return jsonb_build_object('ok', true, 'records', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id, 'mssv', h.mssv, 'student_name', h.student_name,
      'old_record', h.old_record, 'new_record', h.new_record,
      'changed_by', h.changed_by, 'changed_at', h.changed_at
    ) order by h.changed_at desc), '[]'::jsonb)
    from public.attendance_record_history h
    where h.session_id::text = btrim(p_session_id)
  ));
end;
$$;
revoke all on function public.admin_get_attendance_record_history(text) from public, anon;
grant execute on function public.admin_get_attendance_record_history(text) to authenticated;

create table if not exists public.team_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  field text not null check (length(btrim(field)) between 1 and 120),
  leader_mssv text references public.students(mssv) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_group_members (
  team_id uuid not null references public.team_groups(id) on delete cascade,
  mssv text not null references public.students(mssv) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, mssv)
);

alter table public.team_groups enable row level security;
alter table public.team_group_members enable row level security;
drop policy if exists admin_manage_team_groups on public.team_groups;
create policy admin_manage_team_groups on public.team_groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_manage_team_group_members on public.team_group_members;
create policy admin_manage_team_group_members on public.team_group_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.team_groups, public.team_group_members to authenticated;

create or replace function public.add_team_leader_as_member()
returns trigger language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.leader_mssv is not null then
    insert into public.team_group_members (team_id, mssv)
    values (new.id, new.leader_mssv)
    on conflict (team_id, mssv) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists team_group_leader_is_member on public.team_groups;
create trigger team_group_leader_is_member
  after insert or update of leader_mssv on public.team_groups
  for each row execute function public.add_team_leader_as_member();
-- Persistent tasks, anonymous feedback, and Zalo schedule settings.
create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  description text not null default '',
  scope text not null check (scope in ('group','personal')),
  team_id uuid not null references public.team_groups(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  priority text not null default 'med' check (priority in ('low','med','high')),
  due_date date,
  created_at timestamptz not null default now()
);
create table if not exists public.team_task_assignments (
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  mssv text not null references public.students(mssv) on delete cascade,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  read_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (task_id,mssv)
);
alter table public.team_tasks enable row level security;
alter table public.team_task_assignments enable row level security;
drop policy if exists task_read_policy on public.team_tasks;
create policy task_read_policy on public.team_tasks for select to authenticated using (
  public.is_admin() or exists(select 1 from public.team_groups g join public.team_group_members m on m.team_id=g.id where g.id=public.team_tasks.team_id and m.mssv=(select p.mssv from public.profiles p where p.user_id=auth.uid()))
);
drop policy if exists task_assignment_read_policy on public.team_task_assignments;
create policy task_assignment_read_policy on public.team_task_assignments for select to authenticated using (
  public.is_admin() or mssv=(select p.mssv from public.profiles p where p.user_id=auth.uid())
);
grant select on public.team_tasks,public.team_task_assignments to authenticated;

create or replace function public.create_team_task(p_title text,p_description text,p_scope text,p_team_id uuid,p_assignee_mssv text,p_priority text,p_due_date date)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_mssv text; v_id uuid;
begin
  select mssv into v_mssv from public.profiles where user_id=auth.uid();
  if not public.is_admin() and not exists(select 1 from public.team_groups where id=p_team_id and leader_mssv=v_mssv) then return jsonb_build_object('ok',false,'message','Chỉ quản trị viên hoặc đội trưởng mới được giao nhiệm vụ cho nhóm này.'); end if;
  if p_scope not in ('group','personal') or p_priority not in ('low','med','high') or length(btrim(coalesce(p_title,'')))=0 then return jsonb_build_object('ok',false,'message','Thông tin nhiệm vụ không hợp lệ.'); end if;
  if p_scope='personal' and not exists(select 1 from public.team_group_members where team_id=p_team_id and mssv=p_assignee_mssv) then return jsonb_build_object('ok',false,'message','Sinh viên được giao chưa thuộc nhóm.'); end if;
  insert into public.team_tasks(title,description,scope,team_id,priority,due_date) values(btrim(p_title),coalesce(p_description,''),p_scope,p_team_id,p_priority,p_due_date) returning id into v_id;
  if p_scope='group' then insert into public.team_task_assignments(task_id,mssv) select v_id,mssv from public.team_group_members where team_id=p_team_id;
  else insert into public.team_task_assignments(task_id,mssv) values(v_id,p_assignee_mssv); end if;
  return jsonb_build_object('ok',true,'id',v_id);
end; $$;
revoke all on function public.create_team_task(text,text,text,uuid,text,text,date) from public,anon;
grant execute on function public.create_team_task(text,text,text,uuid,text,text,date) to authenticated;

create or replace function public.get_my_tasks()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ declare v_mssv text; begin
 select mssv into v_mssv from public.profiles where user_id=auth.uid();
 if v_mssv is null then return jsonb_build_object('ok',false,'message','Tài khoản chưa liên kết MSSV.'); end if;
 return jsonb_build_object('ok',true,'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'scope',t.scope,'team_id',t.team_id,'team_name',g.name,'field',g.field,'priority',t.priority,'due_date',t.due_date,'status',a.status,'read_at',a.read_at,'created_at',t.created_at) order by t.created_at desc) from public.team_task_assignments a join public.team_tasks t on t.id=a.task_id join public.team_groups g on g.id=t.team_id where a.mssv=v_mssv),'[]'::jsonb), 'managed_teams',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'field',field)) from public.team_groups where leader_mssv=v_mssv),'[]'::jsonb));
end; $$;
revoke all on function public.get_my_tasks() from public,anon; grant execute on function public.get_my_tasks() to authenticated;

create or replace function public.admin_get_team_tasks(p_team_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ declare v_mssv text; begin
 select mssv into v_mssv from public.profiles where user_id=auth.uid();
 if not public.is_admin() and not exists(select 1 from public.team_groups where id=p_team_id and leader_mssv=v_mssv) then return jsonb_build_object('ok',false,'message','Không có quyền xem nhiệm vụ nhóm này.'); end if;
 return jsonb_build_object('ok',true,'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'scope',t.scope,'team_id',t.team_id,'team_name',g.name,'priority',t.priority,'due_date',t.due_date,'created_at',t.created_at,'assignees',(select coalesce(jsonb_agg(jsonb_build_object('mssv',a.mssv,'name',s.name,'status',a.status,'read_at',a.read_at) order by s.name),'[]'::jsonb) from public.team_task_assignments a join public.students s on s.mssv=a.mssv where a.task_id=t.id)) order by t.created_at desc) from public.team_tasks t join public.team_groups g on g.id=t.team_id where p_team_id is null or t.team_id=p_team_id),'[]'::jsonb));
end; $$;
revoke all on function public.admin_get_team_tasks(uuid) from public,anon; grant execute on function public.admin_get_team_tasks(uuid) to authenticated;

create or replace function public.update_my_task(p_task_id uuid,p_status text default null,p_mark_read boolean default false)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$ declare v_mssv text; begin
 select mssv into v_mssv from public.profiles where user_id=auth.uid();
 if p_status is not null and p_status not in ('todo','doing','done') then return jsonb_build_object('ok',false,'message','Trạng thái không hợp lệ.'); end if;
 update public.team_task_assignments set status=coalesce(p_status,status),read_at=case when p_mark_read then coalesce(read_at,now()) else read_at end,updated_at=now() where task_id=p_task_id and mssv=v_mssv;
 if not found then return jsonb_build_object('ok',false,'message','Không tìm thấy nhiệm vụ của bạn.'); end if;
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.update_my_task(uuid,text,boolean) from public,anon; grant execute on function public.update_my_task(uuid,text,boolean) to authenticated;

-- Anonymous by design: no sender, profile, IP, or device field is stored.
create table if not exists public.anonymous_feedback(
 id uuid primary key default gen_random_uuid(), public_code text not null unique default ('FB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 feedback_type text not null check(feedback_type in ('gopy','suco','muasam','khac')), content text not null check(length(btrim(content)) between 1 and 5000),
 status text not null default 'new' check(status in ('new','seen','resolved')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.anonymous_feedback enable row level security;
drop policy if exists admin_feedback_read on public.anonymous_feedback;
create policy admin_feedback_read on public.anonymous_feedback for select to authenticated using(public.is_admin());
grant select on public.anonymous_feedback to authenticated;
create or replace function public.submit_anonymous_feedback(p_type text,p_content text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$ declare v_code text; begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'message','Vui lòng đăng nhập để gửi phản hồi.'); end if;
 if p_type not in ('gopy','suco','muasam','khac') or length(btrim(coalesce(p_content,''))) not between 1 and 5000 then return jsonb_build_object('ok',false,'message','Nội dung phản hồi không hợp lệ.'); end if;
 insert into public.anonymous_feedback(feedback_type,content) values(p_type,btrim(p_content)) returning public_code into v_code;
 return jsonb_build_object('ok',true,'code',v_code);
end; $$;
revoke all on function public.submit_anonymous_feedback(text,text) from public,anon; grant execute on function public.submit_anonymous_feedback(text,text) to authenticated;
create or replace function public.admin_get_anonymous_feedback()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',public_code,'type',feedback_type,'content',content,'status',status,'created_at',created_at) order by created_at desc) from public.anonymous_feedback),'[]'::jsonb));
end; $$;
revoke all on function public.admin_get_anonymous_feedback() from public,anon; grant execute on function public.admin_get_anonymous_feedback() to authenticated;
create or replace function public.admin_update_anonymous_feedback(p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() or p_status not in ('seen','resolved') then return jsonb_build_object('ok',false,'message','Không có quyền hoặc trạng thái không hợp lệ.'); end if;
 update public.anonymous_feedback set status=p_status,updated_at=now() where id=p_id;
 return jsonb_build_object('ok',found);
end; $$;
revoke all on function public.admin_update_anonymous_feedback(uuid,text) from public,anon; grant execute on function public.admin_update_anonymous_feedback(uuid,text) to authenticated;

create table if not exists public.zalo_schedule_settings(
 id boolean primary key default true check(id), auto_enabled boolean not null default false, send_time time not null default '20:00', group_id text not null default '', group_label text not null default '', updated_at timestamptz not null default now()
);
insert into public.zalo_schedule_settings(id) values(true) on conflict(id) do nothing;
alter table public.zalo_schedule_settings enable row level security;
create table if not exists public.zalo_schedule_logs(
 id uuid primary key default gen_random_uuid(), run_date date not null, trigger_type text not null default 'scheduled', status text not null, group_label text, free_count integer not null default 0, busy_count integer not null default 0, message text, error text, sent_at timestamptz not null default now()
);
alter table public.zalo_schedule_logs enable row level security;
drop policy if exists admin_read_zalo_logs on public.zalo_schedule_logs;
create policy admin_read_zalo_logs on public.zalo_schedule_logs for select to authenticated using(public.is_admin());
grant select on public.zalo_schedule_logs to authenticated;
create or replace function public.admin_get_zalo_settings()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'settings',(select to_jsonb(s) from public.zalo_schedule_settings s where id=true));
end; $$;
revoke all on function public.admin_get_zalo_settings() from public,anon; grant execute on function public.admin_get_zalo_settings() to authenticated;
create or replace function public.admin_save_zalo_settings(p_enabled boolean,p_send_time time,p_group_id text,p_group_label text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 if p_enabled and length(btrim(coalesce(p_group_id,'')))=0 then return jsonb_build_object('ok',false,'message','Cần nhập Zalo group ID trước khi bật gửi tự động.'); end if;
 update public.zalo_schedule_settings set auto_enabled=p_enabled,send_time=p_send_time,group_id=btrim(coalesce(p_group_id,'')),group_label=btrim(coalesce(p_group_label,'')),updated_at=now() where id=true;
 return jsonb_build_object('ok',true,'schedule_ready',false,'message','Đã lưu. Cần cấu hình Supabase Cron và bí mật máy chủ để bật lịch gửi tự động.');
end; $$;
revoke all on function public.admin_save_zalo_settings(boolean,time,text,text) from public,anon; grant execute on function public.admin_save_zalo_settings(boolean,time,text,text) to authenticated;
create or replace function public.admin_get_zalo_logs()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'logs',coalesce((select jsonb_agg(to_jsonb(l) order by sent_at desc) from (select * from public.zalo_schedule_logs order by sent_at desc limit 100) l),'[]'::jsonb));
end; $$;
revoke all on function public.admin_get_zalo_logs() from public,anon; grant execute on function public.admin_get_zalo_logs() to authenticated;
-- Rules are shared between admin and student views; only admins can write.
create table if not exists public.workshop_rules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  content text not null check (length(btrim(content)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workshop_rules enable row level security;
drop policy if exists workshop_rules_read on public.workshop_rules;
create policy workshop_rules_read on public.workshop_rules
  for select to authenticated using (true);
drop policy if exists workshop_rules_admin_insert on public.workshop_rules;
create policy workshop_rules_admin_insert on public.workshop_rules
  for insert to authenticated with check (public.is_admin());
drop policy if exists workshop_rules_admin_update on public.workshop_rules;
create policy workshop_rules_admin_update on public.workshop_rules
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists workshop_rules_admin_delete on public.workshop_rules;
create policy workshop_rules_admin_delete on public.workshop_rules
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.workshop_rules to authenticated;

-- Refresh only the requested Vietnam calendar day, preserving other dates.
create or replace function public.admin_sync_student_schedules_for_date(p_schedules jsonb, p_date date)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if p_date is null or p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Ngày hoặc danh sách lịch không hợp lệ.');
  end if;

  delete from public.student_schedules
  where (start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week
  )
  select x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week
  from jsonb_to_recordset(p_schedules) as x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int
  )
  where (x.start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count, 'date', p_date);
end;
$$;
revoke all on function public.admin_sync_student_schedules_for_date(jsonb, date) from public, anon;
grant execute on function public.admin_sync_student_schedules_for_date(jsonb, date) to authenticated;
