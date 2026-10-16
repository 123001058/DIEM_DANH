-- Migration để thêm hàm RPC cho phép admin xóa một phiên cụ thể
create or replace function public.admin_delete_session(p_session_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_is_admin boolean;
begin
  -- Kiểm tra quyền admin
  select public.is_admin() into v_is_admin;
  if not v_is_admin then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền thực hiện hành động này.');
  end if;

  -- Xóa phiên (các record trong bảng attendance có foreign key cascade hoặc sẽ tự bị xóa nếu đã set cascade, 
  -- nếu không cascade thì cần xóa attendance trước)
  -- Tốt nhất nên xóa attendance trước cho an toàn nếu schema chưa thiết lập ON DELETE CASCADE
  delete from public.attendance where session_id = p_session_id;
  delete from public.sessions where id = p_session_id;

  return jsonb_build_object('ok', true, 'message', 'Đã xóa phiên thành công.');
exception
  when others then
    return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$$;

revoke all on function public.admin_delete_session(uuid) from public, anon;
grant execute on function public.admin_delete_session(uuid) to authenticated;
