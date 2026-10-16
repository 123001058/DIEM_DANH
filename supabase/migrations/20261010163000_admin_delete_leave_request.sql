-- Migration: Thêm quyền xóa đơn xin nghỉ cho quản trị viên (Admin delete leave request)
-- Cho phép xóa vĩnh viễn đơn, dọn dẹp điểm danh liên quan nếu đơn từng được duyệt, và cấp quyền xóa file minh chứng trên storage.

-- 1. Cấp quyền DELETE trên bảng leave_requests và storage.objects cho admin
grant delete on public.leave_requests to authenticated;

drop policy if exists leave_requests_delete on public.leave_requests;
create policy leave_requests_delete on public.leave_requests
  for delete to authenticated
  using (public.is_admin());

drop policy if exists leave_evidence_admin_delete on storage.objects;
create policy leave_evidence_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'leave-evidence' and public.is_admin());

-- 2. Hàm RPC admin_delete_leave_request
create or replace function public.admin_delete_leave_request(p_request_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_req public.leave_requests%rowtype;
  v_name text;
  v_email text := coalesce(auth.jwt() ->> 'email', 'Admin');
  v_old_status text;
  v_session record;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền thực hiện hành động này.');
  end if;

  select * into v_req from public.leave_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy đơn xin nghỉ.');
  end if;

  select name into v_name from public.students where mssv = v_req.mssv;

  -- Nếu đơn đang ở trạng thái 'approved', hoàn tác trạng thái điểm danh về 'vắng không phép' cho các phiên bị ảnh hưởng
  if v_req.status = 'approved' then
    for v_session in select s.id, s.started_at, s.duration_min from public.sessions s
      where public.leave_request_covers_session(v_req.leave_date, v_req.leave_period, s.started_at, s.duration_min)
    loop
      if not exists (
        select 1 from public.leave_requests r
        where r.id <> v_req.id and r.mssv = v_req.mssv and r.status = 'approved'
          and public.leave_request_covers_session(r.leave_date, r.leave_period, v_session.started_at, v_session.duration_min)
      ) then
        select status into v_old_status from public.attendance
        where session_id = v_session.id and mssv = v_req.mssv and category = 'Xin nghỉ';

        if v_old_status = 'vắng có phép' then
          update public.attendance
          set status = 'vắng không phép', category = 'Xưởng', note = 'Đơn xin nghỉ đã bị xóa'
          where session_id = v_session.id and mssv = v_req.mssv and category = 'Xin nghỉ';

          insert into public.attendance_audit_logs(
            session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
          ) values (
            v_session.id, v_req.mssv, coalesce(v_name, v_req.mssv),
            'vắng có phép', 'vắng không phép', v_email, 'Đơn xin nghỉ đã bị xóa', now()
          );
        end if;
      end if;
    end loop;
  end if;

  -- Xóa bản ghi đơn (lịch sử leave_request_history và in_app_notifications có foreign key ON DELETE CASCADE)
  delete from public.leave_requests where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'evidence_path', v_req.evidence_path,
    'message', 'Đã xóa vĩnh viễn đơn xin nghỉ thành công.'
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$$;

revoke all on function public.admin_delete_leave_request(uuid) from public, anon;
grant execute on function public.admin_delete_leave_request(uuid) to authenticated;
