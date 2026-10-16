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
