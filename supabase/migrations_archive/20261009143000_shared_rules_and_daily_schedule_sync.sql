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
