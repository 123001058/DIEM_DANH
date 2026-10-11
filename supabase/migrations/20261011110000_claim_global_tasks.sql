alter table public.team_tasks
  add column if not exists claimed_by_mssv text references public.students(mssv) on delete set null,
  add column if not exists claimed_at timestamptz;

create or replace function public.claim_my_global_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_mssv text;
  v_scope text;
  v_completed_at timestamptz;
  v_claimed_by text;
  v_claimed_name text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  select scope, completed_at, claimed_by_mssv
  into v_scope, v_completed_at, v_claimed_by
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
  return jsonb_build_object('ok', true, 'claimed_by_mssv', v_mssv);
end;
$$;
revoke all on function public.claim_my_global_task(uuid) from public, anon;
grant execute on function public.claim_my_global_task(uuid) to authenticated;

create or replace function public.get_my_tasks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare v_mssv text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'description', t.description, 'scope', t.scope,
        'team_id', t.team_id, 'team_name', coalesce(g.name, 'Toàn xưởng'), 'field', g.field,
        'priority', t.priority, 'due_date', t.due_date, 'status', a.status,
        'read_at', a.read_at, 'created_at', t.created_at,
        'completed_by_mssv', t.completed_by_mssv,
        'completed_by_name', (select s.name from public.students s where s.mssv = t.completed_by_mssv),
        'completed_at', t.completed_at,
        'claimed_by_mssv', t.claimed_by_mssv,
        'claimed_by_name', (select s.name from public.students s where s.mssv = t.claimed_by_mssv),
        'claimed_at', t.claimed_at
      ) order by t.created_at desc)
      from public.team_task_assignments a
      join public.team_tasks t on t.id = a.task_id
      left join public.team_groups g on g.id = t.team_id
      where a.mssv = v_mssv
    ), '[]'::jsonb),
    'managed_teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'field', field))
      from public.team_groups where leader_mssv = v_mssv
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_my_tasks() from public, anon;
grant execute on function public.get_my_tasks() to authenticated;

create or replace function public.admin_get_team_tasks(p_team_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare v_mssv text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if not public.is_admin() and (
    p_team_id is null or not exists (
      select 1 from public.team_groups where id = p_team_id and leader_mssv = v_mssv
    )
  ) then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền xem nhiệm vụ nhóm này.');
  end if;

  return jsonb_build_object('ok', true, 'tasks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'description', t.description, 'scope', t.scope,
      'team_id', t.team_id, 'team_name', coalesce(g.name, 'Toàn xưởng'),
      'priority', t.priority, 'due_date', t.due_date, 'created_at', t.created_at,
      'completed_by_mssv', t.completed_by_mssv,
      'completed_by_name', (select s.name from public.students s where s.mssv = t.completed_by_mssv),
      'completed_at', t.completed_at,
      'claimed_by_mssv', t.claimed_by_mssv,
      'claimed_by_name', (select s.name from public.students s where s.mssv = t.claimed_by_mssv),
      'claimed_at', t.claimed_at,
      'assignees', (select coalesce(jsonb_agg(jsonb_build_object(
        'mssv', a.mssv, 'name', s.name, 'status', a.status, 'read_at', a.read_at
      ) order by s.name), '[]'::jsonb)
      from public.team_task_assignments a join public.students s on s.mssv = a.mssv where a.task_id = t.id)
    ) order by t.created_at desc)
    from public.team_tasks t
    left join public.team_groups g on g.id = t.team_id
    where p_team_id is null or t.team_id = p_team_id
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_get_team_tasks(uuid) from public, anon;
grant execute on function public.admin_get_team_tasks(uuid) to authenticated;

create or replace function public.update_my_task(p_task_id uuid, p_status text default null, p_mark_read boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_mssv text;
  v_scope text;
  v_completed_at timestamptz;
  v_completed_by text;
  v_claimed_by text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if p_status is not null and p_status not in ('todo', 'doing', 'done') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  select t.scope, t.completed_at, t.completed_by_mssv, t.claimed_by_mssv
  into v_scope, v_completed_at, v_completed_by, v_claimed_by
  from public.team_tasks t
  join public.team_task_assignments a on a.task_id = t.id
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

  update public.team_task_assignments
  set status = coalesce(p_status, status),
      read_at = case when p_mark_read then coalesce(read_at, now()) else read_at end,
      updated_at = now()
  where task_id = p_task_id and mssv = v_mssv;
  return jsonb_build_object('ok', true, 'completed_by_me', v_scope = 'personal' and p_status = 'done');
end;
$$;
revoke all on function public.update_my_task(uuid, text, boolean) from public, anon;
grant execute on function public.update_my_task(uuid, text, boolean) to authenticated;
