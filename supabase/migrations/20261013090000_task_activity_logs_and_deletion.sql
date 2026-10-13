-- =====================================================================
-- Migration: 20261013090000_task_activity_logs_and_deletion.sql
-- Description: Bảng lưu lịch sử hoạt động nhiệm vụ (Activity Log Drawer),
--              tự động ghi log khi tạo, cập nhật trạng thái, nhận việc, xóa;
--              bảo toàn lịch sử khi xóa nhiệm vụ.
-- =====================================================================

-- 1. Bảng lưu trữ lịch sử hoạt động nhiệm vụ
create table if not exists public.team_task_activity_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.team_tasks(id) on delete set null,
  task_title text not null,
  team_id uuid references public.team_groups(id) on delete set null,
  team_name text,
  scope text default 'group',
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_mssv text,
  actor_name text not null default 'Thành viên',
  action_type text not null, -- 'created', 'status_changed', 'reassigned', 'completed', 'deleted', 'updated', 'claimed', 'released'
  assignee_mssv text,
  assignee_name text,
  old_value text,
  new_value text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_task_activity_logs_created_at on public.team_task_activity_logs (created_at desc);
create index if not exists idx_team_task_activity_logs_task_id on public.team_task_activity_logs (task_id);
create index if not exists idx_team_task_activity_logs_team_id on public.team_task_activity_logs (team_id);

alter table public.team_task_activity_logs enable row level security;

-- Policy đọc log: Admin và người dùng đăng nhập xem được lịch sử nhiệm vụ
drop policy if exists "task_activity_logs_read" on public.team_task_activity_logs;
create policy "task_activity_logs_read" on public.team_task_activity_logs
  for select to authenticated
  using (
    public.is_admin()
    or team_id is null
    or exists (
      select 1 from public.team_group_members m
      where m.team_id = team_task_activity_logs.team_id
        and m.mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
    or exists (
      select 1 from public.team_groups g
      where g.id = team_task_activity_logs.team_id
        and g.leader_mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
    or actor_user_id = auth.uid()
  );

-- 2. Hàm đọc lịch sử hoạt động
create or replace function public.admin_get_task_activity_logs(
  p_team_id uuid default null,
  p_task_id uuid default null,
  p_action_type text default null,
  p_limit int default 100
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_mssv text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if not public.is_admin() and (
    p_team_id is not null and not exists (
      select 1 from public.team_groups where id = p_team_id and leader_mssv = v_mssv
    )
  ) then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền xem lịch sử hoạt động.');
  end if;

  return jsonb_build_object('ok', true, 'logs', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'task_id', l.task_id,
      'task_title', l.task_title,
      'team_id', l.team_id,
      'team_name', l.team_name,
      'scope', l.scope,
      'actor_user_id', l.actor_user_id,
      'actor_mssv', l.actor_mssv,
      'actor_name', l.actor_name,
      'action_type', l.action_type,
      'assignee_mssv', l.assignee_mssv,
      'assignee_name', l.assignee_name,
      'old_value', l.old_value,
      'new_value', l.new_value,
      'metadata', l.metadata,
      'created_at', l.created_at
    ) order by l.created_at desc)
    from (
      select * from public.team_task_activity_logs
      where (p_task_id is null or task_id = p_task_id)
        and (p_team_id is null or team_id = p_team_id)
        and (p_action_type is null or action_type = p_action_type)
      order by created_at desc
      limit coalesce(p_limit, 100)
    ) l
  ), '[]'::jsonb));
end;
$function$;

-- 3. Cập nhật create_team_task: tự động ghi log 'created'
create or replace function public.create_team_task(
  p_title text,
  p_description text,
  p_scope text,
  p_team_id uuid,
  p_assignee_mssv text,
  p_priority text,
  p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_mssv text;
  v_actor_name text;
  v_team_name text;
  v_assignee_name text;
  v_id uuid;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Quản trị viên')
  into v_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_actor_name is null then
    v_actor_name := case when public.is_admin() then 'Quản trị viên' else 'Thành viên' end;
  end if;

  if p_scope is null or p_scope not in ('group', 'personal', 'global')
     or p_priority is null or p_priority not in ('low', 'med', 'high')
     or length(btrim(coalesce(p_title, ''))) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Thông tin nhiệm vụ không hợp lệ.');
  end if;

  if p_scope = 'global' then
    if not public.is_admin() then
      return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên mới được giao nhiệm vụ toàn xưởng.');
    end if;
    v_team_name := 'Toàn xưởng';
    v_assignee_name := 'Tất cả sinh viên xưởng';
  else
    if p_team_id is null then
      return jsonb_build_object('ok', false, 'message', 'Vui lòng chọn nhóm.');
    end if;
    if not public.is_admin() and not exists (
      select 1 from public.team_groups where id = p_team_id and leader_mssv = v_mssv
    ) then
      return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên hoặc đội trưởng mới được giao nhiệm vụ cho nhóm này.');
    end if;
    select name into v_team_name from public.team_groups where id = p_team_id;
  end if;

  if p_scope = 'personal' then
    if not exists (
      select 1 from public.team_group_members where team_id = p_team_id and mssv = p_assignee_mssv
    ) then
      return jsonb_build_object('ok', false, 'message', 'Sinh viên được giao chưa thuộc nhóm.');
    end if;
    select name into v_assignee_name from public.students where mssv = p_assignee_mssv;
    if v_assignee_name is null then
      v_assignee_name := p_assignee_mssv;
    end if;
  elsif p_scope = 'group' then
    v_assignee_name := 'Cả nhóm ' || coalesce(v_team_name, '');
  end if;

  insert into public.team_tasks (title, description, scope, team_id, priority, due_date)
  values (btrim(p_title), coalesce(p_description, ''), p_scope,
          case when p_scope = 'global' then null else p_team_id end,
          p_priority, p_due_date)
  returning id into v_id;

  if p_scope = 'global' then
    insert into public.team_task_assignments (task_id, mssv)
    select v_id, mssv from public.students
    on conflict (task_id, mssv) do nothing;
  elsif p_scope = 'group' then
    insert into public.team_task_assignments (task_id, mssv)
    select v_id, mssv from public.team_group_members where team_id = p_team_id
    on conflict (task_id, mssv) do nothing;
  else
    insert into public.team_task_assignments (task_id, mssv) values (v_id, p_assignee_mssv);
  end if;

  -- Ghi log lịch sử hoạt động
  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    v_id, btrim(p_title), case when p_scope = 'global' then null else p_team_id end, v_team_name, p_scope,
    auth.uid(), v_mssv, v_actor_name,
    'created', p_assignee_mssv, v_assignee_name,
    null, p_priority,
    jsonb_build_object('priority', p_priority, 'due_date', p_due_date, 'description', coalesce(p_description, ''))
  );

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

-- 4. Cập nhật update_my_task: tự động ghi log 'status_changed' hoặc 'completed'
create or replace function public.update_my_task(
  p_task_id uuid,
  p_status text default null,
  p_mark_read boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_mssv text;
  v_actor_name text;
  v_scope text;
  v_task_title text;
  v_team_id uuid;
  v_team_name text;
  v_completed_at timestamptz;
  v_completed_by text;
  v_claimed_by text;
  v_old_status text;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Thành viên')
  into v_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  if p_status is not null and p_status not in ('todo', 'doing', 'done') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  select t.scope, t.title, t.team_id, coalesce(g.name, 'Toàn xưởng'), t.completed_at, t.completed_by_mssv, t.claimed_by_mssv, a.status
  into v_scope, v_task_title, v_team_id, v_team_name, v_completed_at, v_completed_by, v_claimed_by, v_old_status
  from public.team_tasks t
  join public.team_task_assignments a on a.task_id = t.id
  left join public.team_groups g on g.id = t.team_id
  where t.id = p_task_id and a.mssv = v_mssv;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ của bạn.');
  end if;

  if v_scope = 'global' and p_status = 'done' and v_completed_at is null
     and v_claimed_by is distinct from v_mssv then
    return jsonb_build_object('ok', false, 'message', 'Bạn cần nhận làm nhiệm vụ này trước khi hoàn thành.');
  end if;

  if v_scope in ('group', 'global') then
    if p_status = 'done' and v_completed_at is null then
      update public.team_tasks set completed_by_mssv = v_mssv, completed_at = now()
      where id = p_task_id and completed_at is null
      returning completed_by_mssv, completed_at into v_completed_by, v_completed_at;
      if found then
        update public.team_task_assignments
        set status = case when v_scope = 'global' or mssv = v_mssv then 'done' else status end,
            read_at = case when mssv = v_mssv and p_mark_read then coalesce(read_at, now()) else read_at end,
            updated_at = case when v_scope = 'global' or mssv = v_mssv then now() else updated_at end
        where task_id = p_task_id;

        -- Ghi log hoàn thành nhiệm vụ chung
        insert into public.team_task_activity_logs (
          task_id, task_title, team_id, team_name, scope,
          actor_user_id, actor_mssv, actor_name,
          action_type, assignee_mssv, assignee_name,
          old_value, new_value, metadata
        ) values (
          p_task_id, v_task_title, v_team_id, v_team_name, v_scope,
          auth.uid(), v_mssv, v_actor_name,
          'completed', v_mssv, v_actor_name,
          coalesce(v_old_status, 'todo'), 'done',
          jsonb_build_object('scope', v_scope)
        );

        return jsonb_build_object('ok', true, 'completed_by_me', true,
          'completed_by_mssv', v_completed_by, 'completed_at', v_completed_at);
      end if;
      select completed_by_mssv, completed_at into v_completed_by, v_completed_at
      from public.team_tasks where id = p_task_id;
      return jsonb_build_object('ok', true, 'already_completed', true,
        'completed_by_mssv', v_completed_by, 'completed_at', v_completed_at);
    elsif v_completed_at is not null then
      if p_mark_read then
        update public.team_task_assignments set read_at = coalesce(read_at, now())
        where task_id = p_task_id and mssv = v_mssv;
      end if;
      return jsonb_build_object('ok', true, 'already_completed', true,
        'completed_by_mssv', v_completed_by, 'completed_at', v_completed_at);
    end if;
  end if;

  -- Cập nhật nhiệm vụ cá nhân hoặc tiến độ thường
  update public.team_task_assignments
  set status = coalesce(p_status, status),
      read_at = case when p_mark_read then coalesce(read_at, now()) else read_at end,
      updated_at = now()
  where task_id = p_task_id and mssv = v_mssv;

  -- Ghi log nếu trạng thái thay đổi
  if p_status is not null and p_status is distinct from v_old_status then
    insert into public.team_task_activity_logs (
      task_id, task_title, team_id, team_name, scope,
      actor_user_id, actor_mssv, actor_name,
      action_type, assignee_mssv, assignee_name,
      old_value, new_value, metadata
    ) values (
      p_task_id, v_task_title, v_team_id, v_team_name, v_scope,
      auth.uid(), v_mssv, v_actor_name,
      case when p_status = 'done' then 'completed' else 'status_changed' end,
      v_mssv, v_actor_name,
      coalesce(v_old_status, 'todo'), p_status,
      jsonb_build_object('scope', v_scope)
    );
  end if;

  return jsonb_build_object('ok', true, 'completed_by_me', v_scope = 'personal' and p_status = 'done');
end;
$function$;

-- 5. Cập nhật claim_my_global_task & release_my_global_task: tự động ghi log
create or replace function public.claim_my_global_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_mssv text;
  v_actor_name text;
  v_scope text;
  v_task_title text;
  v_completed_at timestamptz;
  v_claimed_by text;
  v_claimed_name text;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Thành viên')
  into v_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  select scope, title, completed_at, claimed_by_mssv
  into v_scope, v_task_title, v_completed_at, v_claimed_by
  from public.team_tasks
  where id = p_task_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;
  if v_scope <> 'global' then
    return jsonb_build_object('ok', false, 'message', 'Chỉ nhiệm vụ toàn xưởng mới có thể nhận làm.');
  end if;
  if v_completed_at is not null then
    return jsonb_build_object('ok', false, 'already_completed', true, 'message', 'Nhiệm vụ này đã hoàn thành.');
  end if;

  if v_claimed_by = v_mssv then
    return jsonb_build_object('ok', true, 'already_claimed', true, 'claimed_by_mssv', v_claimed_by);
  end if;
  if v_claimed_by is not null then
    select name into v_claimed_name from public.students where mssv = v_claimed_by;
    return jsonb_build_object('ok', false, 'claimed', true, 'claimed_by_mssv', v_claimed_by,
      'claimed_by_name', v_claimed_name, 'message', 'Nhiệm vụ đã có người nhận làm.');
  end if;

  update public.team_tasks
  set claimed_by_mssv = v_mssv, claimed_at = now()
  where id = p_task_id;

  -- Ghi log nhận việc
  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    p_task_id, v_task_title, null, 'Toàn xưởng', 'global',
    auth.uid(), v_mssv, v_actor_name,
    'claimed', v_mssv, v_actor_name,
    'Chưa ai nhận', 'Đã nhận làm',
    jsonb_build_object('claimed_at', now())
  );

  return jsonb_build_object('ok', true, 'claimed_by_mssv', v_mssv);
end;
$function$;

create or replace function public.release_my_global_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_mssv text;
  v_actor_name text;
  v_scope text;
  v_task_title text;
  v_completed_at timestamptz;
  v_claimed_by text;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Thành viên')
  into v_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  select scope, title, completed_at, claimed_by_mssv
  into v_scope, v_task_title, v_completed_at, v_claimed_by
  from public.team_tasks
  where id = p_task_id
  for update;
  if not found or v_scope <> 'global' then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ toàn xưởng.');
  end if;
  if v_completed_at is not null then
    return jsonb_build_object('ok', false, 'already_completed', true, 'message', 'Nhiệm vụ đã hoàn thành nên không thể hủy nhận.');
  end if;
  if v_claimed_by is distinct from v_mssv then
    return jsonb_build_object('ok', false, 'message', 'Bạn không phải người đang nhận nhiệm vụ này.');
  end if;

  update public.team_tasks
  set claimed_by_mssv = null, claimed_at = null
  where id = p_task_id;

  -- Ghi log hủy nhận việc
  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    p_task_id, v_task_title, null, 'Toàn xưởng', 'global',
    auth.uid(), v_mssv, v_actor_name,
    'released', v_mssv, v_actor_name,
    'Đang nhận làm', 'Đã hủy nhận',
    jsonb_build_object('released_at', now())
  );

  return jsonb_build_object('ok', true);
end;
$function$;

-- 6. Cập nhật admin_delete_team_task: kiểm tra quyền, ghi log 'deleted' trước khi xóa
create or replace function public.admin_delete_team_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_user_mssv text;
  v_actor_name text;
  v_task_title text;
  v_team_id uuid;
  v_scope text;
  v_team_name text;
  v_is_leader boolean := false;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Quản trị viên')
  into v_user_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_actor_name is null then
    v_actor_name := 'Quản trị viên';
  end if;

  select t.title, t.team_id, t.scope, coalesce(g.name, 'Toàn xưởng')
  into v_task_title, v_team_id, v_scope, v_team_name
  from public.team_tasks t
  left join public.team_groups g on g.id = t.team_id
  where t.id = p_task_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ cần xóa.');
  end if;

  if v_team_id is not null and v_user_mssv is not null then
    select exists (
      select 1 from public.team_groups where id = v_team_id and leader_mssv = v_user_mssv
    ) into v_is_leader;
  end if;

  if not public.is_admin() and not v_is_leader then
    return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên hoặc đội trưởng mới được xóa nhiệm vụ.');
  end if;

  -- Ghi log lịch sử hoạt động TRƯỚC KHI XÓA (bảo toàn dữ liệu vĩnh viễn)
  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    p_task_id, v_task_title, v_team_id, v_team_name, v_scope,
    auth.uid(), v_user_mssv, v_actor_name,
    'deleted', null, null,
    v_task_title, null,
    jsonb_build_object('deleted_at', now(), 'deleted_by', v_actor_name, 'scope', v_scope)
  );

  delete from public.team_tasks where id = p_task_id;

  return jsonb_build_object('ok', true, 'deleted_title', v_task_title);
end;
$function$;

-- 7. Thêm hàm admin_update_team_task: Sửa nhiệm vụ và ghi log 'updated' / 'reassigned'
create or replace function public.admin_update_team_task(
  p_task_id uuid,
  p_title text,
  p_description text default null,
  p_priority text default null,
  p_due_date date default null,
  p_assignee_mssv text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_user_mssv text;
  v_actor_name text;
  v_old_title text;
  v_old_desc text;
  v_old_pri text;
  v_old_due date;
  v_team_id uuid;
  v_scope text;
  v_team_name text;
  v_old_assignee text;
  v_old_assignee_name text;
  v_new_assignee_name text;
  v_is_leader boolean := false;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Quản trị viên')
  into v_user_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_actor_name is null then
    v_actor_name := 'Quản trị viên';
  end if;

  select t.title, t.description, t.priority, t.due_date, t.team_id, t.scope, coalesce(g.name, 'Toàn xưởng')
  into v_old_title, v_old_desc, v_old_pri, v_old_due, v_team_id, v_scope, v_team_name
  from public.team_tasks t
  left join public.team_groups g on g.id = t.team_id
  where t.id = p_task_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;

  if v_team_id is not null and v_user_mssv is not null then
    select exists (
      select 1 from public.team_groups where id = v_team_id and leader_mssv = v_user_mssv
    ) into v_is_leader;
  end if;

  if not public.is_admin() and not v_is_leader then
    return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên hoặc đội trưởng mới được cập nhật nhiệm vụ.');
  end if;

  update public.team_tasks
  set title = coalesce(btrim(p_title), title),
      description = coalesce(p_description, description),
      priority = coalesce(p_priority, priority),
      due_date = p_due_date
  where id = p_task_id;

  -- Nếu là nhiệm vụ cá nhân và có thay đổi assignee
  if v_scope = 'personal' and p_assignee_mssv is not null then
    select a.mssv, s.name into v_old_assignee, v_old_assignee_name
    from public.team_task_assignments a
    left join public.students s on s.mssv = a.mssv
    where a.task_id = p_task_id limit 1;

    if v_old_assignee is distinct from p_assignee_mssv then
      select name into v_new_assignee_name from public.students where mssv = p_assignee_mssv;
      delete from public.team_task_assignments where task_id = p_task_id;
      insert into public.team_task_assignments (task_id, mssv) values (p_task_id, p_assignee_mssv);

      insert into public.team_task_activity_logs (
        task_id, task_title, team_id, team_name, scope,
        actor_user_id, actor_mssv, actor_name,
        action_type, assignee_mssv, assignee_name,
        old_value, new_value, metadata
      ) values (
        p_task_id, coalesce(btrim(p_title), v_old_title), v_team_id, v_team_name, v_scope,
        auth.uid(), v_user_mssv, v_actor_name,
        'reassigned', p_assignee_mssv, coalesce(v_new_assignee_name, p_assignee_mssv),
        coalesce(v_old_assignee_name, v_old_assignee, 'Chưa giao'),
        coalesce(v_new_assignee_name, p_assignee_mssv),
        jsonb_build_object('reassigned_at', now())
      );
    end if;
  end if;

  -- Ghi log updated chung
  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    p_task_id, coalesce(btrim(p_title), v_old_title), v_team_id, v_team_name, v_scope,
    auth.uid(), v_user_mssv, v_actor_name,
    'updated', null, null,
    v_old_title, coalesce(btrim(p_title), v_old_title),
    jsonb_build_object('priority', coalesce(p_priority, v_old_pri), 'due_date', p_due_date)
  );

  return jsonb_build_object('ok', true);
end;
$function$;

-- 8. Cấp quyền thực thi các hàm
revoke all on function public.admin_get_task_activity_logs(uuid, uuid, text, int) from public, anon;
grant execute on function public.admin_get_task_activity_logs(uuid, uuid, text, int) to authenticated;

revoke all on function public.admin_delete_team_task(uuid) from public, anon;
grant execute on function public.admin_delete_team_task(uuid) to authenticated;

revoke all on function public.admin_update_team_task(uuid, text, text, text, date, text) from public, anon;
grant execute on function public.admin_update_team_task(uuid, text, text, text, date, text) to authenticated;

revoke all on function public.create_team_task(text, text, text, uuid, text, text, date) from public, anon;
grant execute on function public.create_team_task(text, text, text, uuid, text, text, date) to authenticated;

revoke all on function public.update_my_task(uuid, text, boolean) from public, anon;
grant execute on function public.update_my_task(uuid, text, boolean) to authenticated;

revoke all on function public.claim_my_global_task(uuid) from public, anon;
grant execute on function public.claim_my_global_task(uuid) to authenticated;

revoke all on function public.release_my_global_task(uuid) from public, anon;
grant execute on function public.release_my_global_task(uuid) to authenticated;
