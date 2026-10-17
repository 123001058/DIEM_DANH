-- =====================================================================
-- Migration: tighten_students_rls
-- Mục đích: Bịt lỗ hổng cho phép MỌI tài khoản đã đăng nhập (kể cả sinh
--           viên) tự do THÊM/SỬA/XÓA bảng public.students.
--
-- Lỗ hổng cũ: policy "students_write_all" FOR ALL TO authenticated
--             USING (true) WITH CHECK (true), kèm GRANT ALL ON students
--             TO authenticated. Sinh viên đăng nhập checkin.html có thể
--             gọi trực tiếp REST API để xóa/sửa sinh viên bất kỳ.
--
-- Vì sao siết an toàn: toàn bộ thao tác ghi danh sách sinh viên trên ứng
--           dụng đều đi qua RPC SECURITY DEFINER có kiểm tra is_admin():
--             - admin_add_student            (thêm)
--             - admin_set_student_active     (khóa/mở)
--             - admin_delete_student         (xóa)
--           và avatar tự phục vụ qua student_set_my_avatar (definer).
--           Các RPC definer chạy bằng quyền owner nên KHÔNG bị ảnh hưởng
--           bởi việc thu hồi quyền của role authenticated.
--           => Client KHÔNG bao giờ ghi trực tiếp vào bảng students.
--
-- Thay đổi: bỏ policy ghi tự do + thu hồi mọi quyền ghi ở mức bảng khỏi
--           anon và authenticated. Giữ nguyên quyền SELECT.
-- =====================================================================

-- 1. Bỏ policy cho phép ghi tự do
drop policy if exists "students_write_all" on public.students;

-- 2. Thu hồi toàn bộ quyền ở mức bảng khỏi anon/authenticated, rồi cấp lại đúng SELECT
revoke all on table public.students from anon;
revoke all on table public.students from authenticated;
grant select on table public.students to anon, authenticated;

-- 3. Ghi chú: admin/service_role vẫn giữ toàn quyền (RPC definer + seed migration dùng)
grant all on table public.students to service_role;
