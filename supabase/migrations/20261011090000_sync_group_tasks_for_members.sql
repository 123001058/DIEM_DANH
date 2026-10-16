-- Give existing group tasks to members who join a team after a task was created.
-- Backfill first so this also repairs assignments missing for current members.
insert into public.team_task_assignments (task_id, mssv)
select t.id, m.mssv
from public.team_tasks t
join public.team_group_members m on m.team_id = t.team_id
where t.scope = 'group'
on conflict (task_id, mssv) do nothing;

create or replace function public.assign_existing_group_tasks_to_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.team_task_assignments (task_id, mssv)
  select t.id, new.mssv
  from public.team_tasks t
  where t.team_id = new.team_id
    and t.scope = 'group'
  on conflict (task_id, mssv) do nothing;

  return new;
end;
$$;

revoke all on function public.assign_existing_group_tasks_to_member() from public, anon, authenticated;

drop trigger if exists assign_existing_group_tasks_after_member_insert on public.team_group_members;
create trigger assign_existing_group_tasks_after_member_insert
after insert on public.team_group_members
for each row execute function public.assign_existing_group_tasks_to_member();
