create or replace function public.release_my_global_task(p_task_id uuid)
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
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.release_my_global_task(uuid) from public, anon;
grant execute on function public.release_my_global_task(uuid) to authenticated;
