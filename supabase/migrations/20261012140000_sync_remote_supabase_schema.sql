-- =====================================================================
-- Migration: 20261012140000_sync_remote_supabase_schema.sql
-- Description: Đồng bộ các RPC functions & handlers được tạo trực tiếp trên Supabase
-- Giữ nguyên các migration cũ và ghi nhận hồ sơ chính xác từ remote database
-- =====================================================================


-- Function: _qr_sig(p_secret text, p_session text, p_win bigint)
CREATE OR REPLACE FUNCTION public._qr_sig(p_secret text, p_session text, p_win bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select left(
    encode(
      hmac(p_session || ':' || p_win::text, p_secret, 'sha256'),
      'hex'
    ),
    24
  )
$function$;

-- Function: admin_create_team(p_name text, p_description text)
CREATE OR REPLACE FUNCTION public.admin_create_team(p_name text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_team public.teams;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được tạo nhóm.');
  end if;

  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'Tên nhóm không được để trống.');
  end if;

  insert into public.teams (name, description)
  values (v_name, nullif(btrim(coalesce(p_description, '')), ''))
  returning * into v_team;

  return jsonb_build_object('ok', true, 'team', jsonb_build_object(
    'id', v_team.id, 'name', v_team.name, 'description', v_team.description
  ));
end;
$function$;

-- Function: admin_delete_team(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.admin_delete_team(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được xóa nhóm.');
  end if;

  perform 1 from public.teams where id = p_team_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  if exists (select 1 from public.team_members where team_id = p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Nhóm còn thành viên, hãy gỡ hết trước khi xóa.');
  end if;

  if exists (select 1 from public.tasks where team_id = p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Nhóm còn công việc, hãy xử lý công việc trước khi xóa.');
  end if;

  delete from public.teams where id = p_team_id;
  return jsonb_build_object('ok', true, 'message', 'Đã xóa nhóm thành công.');
end;
$function$;

-- Function: admin_list_users()
CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được xem danh sách tài khoản.');
  end if;

  return jsonb_build_object('ok', true, 'users', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'username', p.username,
        'full_name', p.full_name,
        'mssv', p.mssv,
        'role', p.role,
        'team_id', tm.team_id,
        'team_name', t.name,
        'team_role', coalesce(tm.team_role, 'member')
      ) order by p.role, coalesce(p.full_name, p.username)
    ), '[]'::jsonb)
    from public.profiles p
    left join public.team_members tm on tm.user_id = p.user_id
    left join public.teams t on t.id = tm.team_id
  ));
end;
$function$;

-- Function: admin_revoke_leader(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.admin_revoke_leader(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_old uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được thu hồi quyền Đội trưởng.');
  end if;

  select leader_id into v_old from public.teams where id = p_team_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  if v_old is null then
    return jsonb_build_object('ok', false, 'message', 'Nhóm này chưa có Đội trưởng.');
  end if;

  update public.teams set leader_id = null where id = p_team_id;
  update public.team_members set team_role = 'member'
  where team_id = p_team_id and user_id = v_old;
  update public.profiles set role = 'student'
  where user_id = v_old and role = 'leader';

  return jsonb_build_object('ok', true, 'message', 'Đã thu hồi quyền Đội trưởng.');
end;
$function$;

-- Function: admin_set_team_leader(p_team_id uuid, p_user_id uuid)
CREATE OR REPLACE FUNCTION public.admin_set_team_leader(p_team_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_team public.teams;
  v_target public.profiles;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được cấp quyền Đội trưởng.');
  end if;

  if p_team_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'Thiếu thông tin nhóm hoặc người dùng.');
  end if;

  select * into v_team from public.teams where id = p_team_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  select * into v_target from public.profiles where user_id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy hồ sơ người dùng.');
  end if;

  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'message', 'Không thể cấp quyền Đội trưởng cho chính tài khoản Admin.');
  end if;

  if v_team.leader_id is not null and v_team.leader_id <> p_user_id then
    update public.team_members
    set team_role = 'member'
    where team_id = p_team_id and user_id = v_team.leader_id;

    update public.profiles
    set role = 'student'
    where user_id = v_team.leader_id and role = 'leader';
  end if;

  update public.teams set leader_id = p_user_id where id = p_team_id;

  update public.profiles
  set role = 'leader'
  where user_id = p_user_id and role <> 'admin';

  insert into public.team_members (team_id, user_id, team_role)
  values (p_team_id, p_user_id, 'leader')
  on conflict (team_id, user_id)
  do update set team_role = 'leader';

  return jsonb_build_object('ok', true, 'message', 'Đã cấp quyền Đội trưởng thành công.');
end;
$function$;

-- Function: can_manage_assignment(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.can_manage_assignment(p_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id and public.is_team_leader(t.team_id)
  );
$function$;

-- Function: get_team_availability(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.get_team_availability(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_team_member(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không thuộc nhóm này.');
  end if;

  return jsonb_build_object('ok', true, 'members', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'username', p.username,
        'full_name', coalesce(p.full_name, p.username),
        'mssv', p.mssv,
        'role', p.role,
        'team_role', tm.team_role,
        'is_leader', (t.leader_id = p.user_id),
        'is_deputy', (tm.team_role = 'deputy'),
        'blocks', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'slot_thu', ab.slot_thu,
            'slot_buoi', ab.slot_buoi,
            'reason', ab.reason
          )), '[]'::jsonb)
          from public.availability_blocks ab
          where ab.user_id = p.user_id
        )
      ) order by
        case tm.team_role
          when 'leader' then 1
          when 'deputy' then 2
          else 3
        end,
        coalesce(p.full_name, p.username)
    ), '[]'::jsonb)
    from public.team_members tm
    join public.profiles p on p.user_id = tm.user_id
    join public.teams t on t.id = tm.team_id
    where tm.team_id = p_team_id
  ));
end;
$function$;

-- Function: get_team_board(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.get_team_board(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_team_member(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không thuộc nhóm này.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'is_leader', public.is_team_leader(p_team_id),
    'tasks', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'description', t.description,
          'slot_thu', t.slot_thu,
          'slot_buoi', t.slot_buoi,
          'due_at', t.due_at,
          'priority', t.priority,
          'status', t.status,
          'created_at', t.created_at,
          'assignees', coalesce((
            select jsonb_agg(jsonb_build_object(
              'user_id', a.assignee_id,
              'full_name', coalesce(p.full_name, p.username),
              'status', a.status,
              'note', a.note
            ))
            from public.task_assignments a
            left join public.profiles p on p.user_id = a.assignee_id
            where a.task_id = t.id
          ), '[]'::jsonb)
        ) order by t.created_at desc
      ), '[]'::jsonb)
      from public.tasks t
      where t.team_id = p_team_id
        and (
          public.is_team_leader(p_team_id)
          or exists (
            select 1 from public.task_assignments a
            where a.task_id = t.id and a.assignee_id = auth.uid()
          )
        )
    )
  );
end;
$function$;

-- Function: is_assigned_to_task(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.is_assigned_to_task(p_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.task_assignments
    where task_id = p_task_id and assignee_id = auth.uid()
  );
$function$;

-- Function: is_leader()
CREATE OR REPLACE FUNCTION public.is_leader()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('leader', 'deputy')
  );
$function$;

-- Function: is_team_leader(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.is_team_leader(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select public.is_admin()
    or exists (
      select 1 from public.teams
      where id = p_team_id and leader_id = auth.uid()
    )
    or exists (
      select 1 from public.team_members
      where team_id = p_team_id
        and user_id = auth.uid()
        and team_role = 'deputy'
    );
$function$;

-- Function: is_team_member(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select public.is_admin()
    or exists (
      select 1 from public.teams
      where id = p_team_id and leader_id = auth.uid()
    )
    or exists (
      select 1 from public.team_members
      where team_id = p_team_id and user_id = auth.uid()
    );
$function$;

-- Function: issue_qr_token(p_session_id text)
CREATE OR REPLACE FUNCTION public.issue_qr_token(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$;

-- Function: leader_assign_task(p_task_id uuid, p_assignee_id uuid, p_note text, p_force boolean)
CREATE OR REPLACE FUNCTION public.leader_assign_task(p_task_id uuid, p_assignee_id uuid, p_note text DEFAULT NULL::text, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_task public.tasks;
  v_block record;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;

  if not public.is_team_leader(v_task.team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được giao nhiệm vụ.');
  end if;

  -- Thành viên phải thuộc đúng nhóm đó
  if not exists (
    select 1 from public.team_members
    where team_id = v_task.team_id and user_id = p_assignee_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'Người được giao không thuộc nhóm này.');
  end if;

  -- Kiểm tra lịch rảnh (khoảng bận thủ công)
  if v_task.slot_thu is not null and v_task.slot_buoi is not null and not coalesce(p_force, false) then
    select * into v_block
    from public.availability_blocks
    where user_id = p_assignee_id
      and slot_thu = v_task.slot_thu
      and slot_buoi = v_task.slot_buoi;

    if found then
      return jsonb_build_object(
        'ok', false,
        'message', 'Thành viên đã báo bận trong khung giờ này. Hãy chọn người khác hoặc giao cưỡng chế.',
        'conflict', true
      );
    end if;
  end if;

  insert into public.task_assignments (task_id, assignee_id, note, assigned_by)
  values (p_task_id, p_assignee_id, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (task_id, assignee_id) do update
    set note = excluded.note, assigned_at = now(), assigned_by = auth.uid();

  return jsonb_build_object('ok', true, 'message', 'Đã giao nhiệm vụ thành công.');
end;
$function$;

-- Function: leader_create_task(p_team_id uuid, p_title text, p_description text, p_slot_thu integer, p_slot_buoi integer, p_due_at timestamp with time zone, p_priority text)
CREATE OR REPLACE FUNCTION public.leader_create_task(p_team_id uuid, p_title text, p_description text DEFAULT NULL::text, p_slot_thu integer DEFAULT NULL::integer, p_slot_buoi integer DEFAULT NULL::integer, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_priority text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_task public.tasks;
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng của nhóm mới được tạo nhiệm vụ.');
  end if;

  if v_title = '' then
    return jsonb_build_object('ok', false, 'message', 'Tiêu đề nhiệm vụ không được để trống.');
  end if;

  if p_slot_thu is not null and (p_slot_thu < 2 or p_slot_thu > 8) then
    return jsonb_build_object('ok', false, 'message', 'Thứ không hợp lệ (2–8).');
  end if;

  if p_slot_buoi is not null and (p_slot_buoi < 1 or p_slot_buoi > 3) then
    return jsonb_build_object('ok', false, 'message', 'Buổi không hợp lệ (1–3).');
  end if;

  if p_priority is null or p_priority not in ('low', 'normal', 'high') then
    p_priority := 'normal';
  end if;

  insert into public.tasks (
    team_id, title, description, slot_thu, slot_buoi, due_at, priority, created_by
  )
  values (
    p_team_id, v_title, nullif(btrim(coalesce(p_description, '')), ''),
    p_slot_thu, p_slot_buoi, p_due_at, p_priority, auth.uid()
  )
  returning * into v_task;

  return jsonb_build_object('ok', true, 'task', jsonb_build_object(
    'id', v_task.id, 'title', v_task.title, 'team_id', v_task.team_id
  ));
end;
$function$;

-- Function: leader_delete_task(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.leader_delete_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', true, 'message', 'Nhiệm vụ không tồn tại.');
  end if;

  if not public.is_team_leader(v_task.team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được xoá nhiệm vụ.');
  end if;

  delete from public.tasks where id = p_task_id;
  return jsonb_build_object('ok', true, 'message', 'Đã xoá nhiệm vụ.');
end;
$function$;

-- Function: leader_set_member_role(p_team_id uuid, p_user_id uuid, p_new_role text)
CREATE OR REPLACE FUNCTION public.leader_set_member_role(p_team_id uuid, p_user_id uuid, p_new_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_team public.teams;
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không có quyền phân vai trong nhóm này.');
  end if;

  if p_new_role is null or p_new_role not in ('leader', 'deputy', 'member') then
    return jsonb_build_object('ok', false, 'message', 'Vai trò không hợp lệ.');
  end if;

  if p_user_id = auth.uid() and not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không thể thay đổi vai trò của chính mình.');
  end if;

  if not exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = p_user_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'Người dùng này không thuộc nhóm.');
  end if;

  select * into v_team from public.teams where id = p_team_id;

  if p_new_role = 'leader' then
    if not public.is_admin() then
      return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được cấp Đội trưởng chính.');
    end if;

    if v_team.leader_id is not null and v_team.leader_id <> p_user_id then
      update public.team_members set team_role = 'member'
      where team_id = p_team_id and user_id = v_team.leader_id;
      update public.profiles set role = 'student'
      where user_id = v_team.leader_id and role = 'leader';
    end if;

    update public.teams set leader_id = p_user_id where id = p_team_id;
    update public.profiles set role = 'leader'
    where user_id = p_user_id and role <> 'admin';
    update public.team_members set team_role = 'leader'
    where team_id = p_team_id and user_id = p_user_id;

    return jsonb_build_object('ok', true, 'message', 'Đã cấp quyền Đội trưởng chính.');
  end if;

  if v_team.leader_id = p_user_id then
    return jsonb_build_object('ok', false, 'message', 'Hãy chuyển hoặc thu hồi Đội trưởng chính trước khi đổi vai trò.');
  end if;

  if p_new_role = 'deputy' then
    update public.team_members set team_role = 'deputy'
    where team_id = p_team_id and user_id = p_user_id;
    update public.profiles set role = 'deputy'
    where user_id = p_user_id and role not in ('admin', 'leader');
    return jsonb_build_object('ok', true, 'message', 'Đã cấp quyền Đội phó.');
  end if;

  update public.team_members set team_role = 'member'
  where team_id = p_team_id and user_id = p_user_id;
  update public.profiles set role = 'student'
  where user_id = p_user_id and role = 'deputy';

  return jsonb_build_object('ok', true, 'message', 'Đã đặt lại thành Thành viên.');
end;
$function$;

-- Function: leader_unassign_task(p_task_id uuid, p_assignee_id uuid)
CREATE OR REPLACE FUNCTION public.leader_unassign_task(p_task_id uuid, p_assignee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;

  if not public.is_team_leader(v_task.team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được gỡ nhiệm vụ.');
  end if;

  delete from public.task_assignments
  where task_id = p_task_id and assignee_id = p_assignee_id;

  return jsonb_build_object('ok', true, 'message', 'Đã gỡ nhiệm vụ khỏi thành viên.');
end;
$function$;

-- Function: my_teams()
CREATE OR REPLACE FUNCTION public.my_teams()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if public.is_admin() then
    return jsonb_build_object('ok', true, 'is_admin', true, 'teams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'leader_id', t.leader_id
      ) order by t.name), '[]'::jsonb)
      from public.teams t
    ));
  end if;

  return jsonb_build_object('ok', true, 'is_admin', false, 'teams', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'leader_id', t.leader_id
    ) order by t.name), '[]'::jsonb)
    from public.teams t
    where public.is_team_member(t.id)
  ));
end;
$function$;

-- Function: rls_auto_enable()
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Function: server_now_ms()
CREATE OR REPLACE FUNCTION public.server_now_ms()
 RETURNS bigint
 LANGUAGE sql
AS $function$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$function$;

-- Function: set_availability_block(p_slot_thu integer, p_slot_buoi integer, p_busy boolean, p_reason text)
CREATE OR REPLACE FUNCTION public.set_availability_block(p_slot_thu integer, p_slot_buoi integer, p_busy boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if p_slot_thu is null or p_slot_thu < 2 or p_slot_thu > 8 then
    return jsonb_build_object('ok', false, 'message', 'Thứ không hợp lệ (2–8).');
  end if;

  if p_slot_buoi is null or p_slot_buoi < 1 or p_slot_buoi > 3 then
    return jsonb_build_object('ok', false, 'message', 'Buổi không hợp lệ (1–3).');
  end if;

  if coalesce(p_busy, false) then
    insert into public.availability_blocks (user_id, slot_thu, slot_buoi, reason)
    values (auth.uid(), p_slot_thu, p_slot_buoi, nullif(btrim(coalesce(p_reason, '')), ''))
    on conflict (user_id, slot_thu, slot_buoi)
    do update set reason = excluded.reason, created_at = now();
  else
    delete from public.availability_blocks
    where user_id = auth.uid()
      and slot_thu = p_slot_thu
      and slot_buoi = p_slot_buoi;
  end if;

  return jsonb_build_object('ok', true, 'message', 'Đã cập nhật lịch rảnh.');
end;
$function$;

-- Function: shares_team_with(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.shares_team_with(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select public.is_admin() or exists (
    select 1
    from public.team_members me
    join public.team_members other
      on other.team_id = me.team_id
    where me.user_id = auth.uid()
      and other.user_id = p_user_id
  ) or exists (
    -- Đội trưởng xem được thành viên trong nhóm mình quản lý
    select 1
    from public.teams t
    join public.team_members m on m.team_id = t.id
    where t.leader_id = auth.uid() and m.user_id = p_user_id
  );
$function$;

-- Function: submit_attendance_authenticated(p_session_id text, p_category text, p_note text, p_device_id text)
CREATE OR REPLACE FUNCTION public.submit_attendance_authenticated(p_session_id text, p_category text DEFAULT 'Đi học'::text, p_note text DEFAULT ''::text, p_device_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  select mssv into v_mssv
  from public.profiles
  where user_id = v_uid;

  v_mssv := btrim(coalesce(v_mssv, ''));
  if v_mssv = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_MSSV',
      'message', 'Tài khoản chưa được liên kết MSSV. Vui lòng liên hệ Admin.'
    );
  end if;

  select * into s
  from public.sessions
  where id::text = p_session_id;

  if not found or not s.is_open or (
    s.duration_min is not null
    and s.started_at + (s.duration_min * interval '1 minute') <= now()
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'SESSION_CLOSED',
      'message', 'Phiên điểm danh đã đóng hoặc đã hết giờ.'
    );
  end if;

  select name into v_name
  from public.students
  where mssv = v_mssv;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_IN_CLASS',
      'message', 'MSSV không có trong danh sách lớp!'
    );
  end if;

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

      return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv);
    else
      return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
    end if;
  end if;

  if p_device_id is not null and btrim(p_device_id) <> '' then
    if exists (
      select 1 from public.attendance
      where session_id = s.id and device_id = p_device_id
    ) then
      return jsonb_build_object('ok', false, 'code', 'DEVICE_USED', 'message', 'Thiết bị này đã được dùng để điểm danh cho sinh viên khác trong phiên.');
    end if;
  end if;

  insert into public.attendance (
    session_id, mssv, full_name, status, category, note, device_id
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

  return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'MSSV hoặc thiết bị này đã điểm danh phiên này rồi.');
end;
$function$;

-- Function: team_add_member(p_team_id uuid, p_user_id uuid)
CREATE OR REPLACE FUNCTION public.team_add_member(p_team_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được thêm thành viên.');
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy hồ sơ người dùng.');
  end if;

  -- Một tài khoản chỉ thuộc một nhóm
  if exists (select 1 from public.team_members where user_id = p_user_id and team_id <> p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Người dùng này đã thuộc một nhóm khác.');
  end if;

  insert into public.team_members (team_id, user_id)
  values (p_team_id, p_user_id)
  on conflict (team_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'message', 'Đã thêm thành viên vào nhóm.');
end;
$function$;

-- Function: team_remove_member(p_team_id uuid, p_user_id uuid)
CREATE OR REPLACE FUNCTION public.team_remove_member(p_team_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được gỡ thành viên.');
  end if;

  -- Không cho gỡ chính đội trưởng (phải chuyển quyền trước)
  if exists (select 1 from public.teams where id = p_team_id and leader_id = p_user_id) then
    return jsonb_build_object('ok', false, 'message', 'Không thể gỡ Đội trưởng. Hãy cấp lại Đội trưởng trước.');
  end if;

  delete from public.team_members
  where team_id = p_team_id and user_id = p_user_id;

  return jsonb_build_object('ok', true, 'message', 'Đã gỡ thành viên khỏi nhóm.');
end;
$function$;

-- Function: update_task_status(p_task_id uuid, p_status text, p_note text)
CREATE OR REPLACE FUNCTION public.update_task_status(p_task_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if p_status is null or p_status not in ('todo', 'doing', 'done', 'cancelled') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  -- Chỉ được cập nhật nhiệm vụ được giao cho mình (đội trưởng/admin thì đã có quyền ở trên)
  if not exists (
    select 1 from public.task_assignments
    where task_id = p_task_id and assignee_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không được giao nhiệm vụ này.');
  end if;

  update public.task_assignments
  set status = p_status,
      note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
  where task_id = p_task_id and assignee_id = auth.uid();

  return jsonb_build_object('ok', true, 'message', 'Đã cập nhật tiến độ.');
end;
$function$;
