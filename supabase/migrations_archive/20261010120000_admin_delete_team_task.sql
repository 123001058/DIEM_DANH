create or replace function public.admin_delete_team_task(p_task_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok',false,'message','Chỉ admin mới được xóa nhiệm vụ.');
  end if;
  delete from public.team_tasks where id=p_task_id;
  if not found then
    return jsonb_build_object('ok',false,'message','Không tìm thấy nhiệm vụ cần xóa.');
  end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.admin_delete_team_task(uuid) from public,anon;
grant execute on function public.admin_delete_team_task(uuid) to authenticated;
