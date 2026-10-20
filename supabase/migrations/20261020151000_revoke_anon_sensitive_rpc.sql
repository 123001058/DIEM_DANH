-- =====================================================================
-- Migration: Thu hồi quyền EXECUTE của anon trên các RPC nhạy cảm
-- Các RPC này đã có kiểm tra quyền bên trong, nhưng vẫn nên chặn từ ACL.
-- =====================================================================

revoke all on function public.kiosk_record_face_checkin(text, text, text) from anon;
revoke all on function public.kiosk_upsert_face_data(text, jsonb, jsonb) from anon;
revoke all on function public.admin_update_avatar(text, text) from anon;
revoke all on function public.admin_set_my_avatar(text) from anon;
revoke all on function public.admin_export_face_data() from anon;
revoke all on function public.student_set_my_avatar(text) from anon;
revoke all on function public.submit_leave_comment(uuid, text) from anon;

-- Đảm bảo người dùng đã đăng nhập vẫn dùng được các RPC hợp lệ
grant execute on function public.kiosk_record_face_checkin(text, text, text) to authenticated;
grant execute on function public.kiosk_upsert_face_data(text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_update_avatar(text, text) to authenticated;
grant execute on function public.admin_set_my_avatar(text) to authenticated;
grant execute on function public.admin_export_face_data() to authenticated;
grant execute on function public.student_set_my_avatar(text) to authenticated;
grant execute on function public.submit_leave_comment(uuid, text) to authenticated;
