-- Migration: ONE-TIME DATA MIGRATION
-- Chú ý: Script này có mục đích đánh dấu toàn bộ tài khoản hiện tại (bao gồm sinh viên và admin)
-- sang trạng thái phải đổi mật khẩu (must_change_password = true).
-- Không nên chạy lại script này sau khi hệ thống đã đi vào hoạt động trừ khi có ý định force reset toàn bộ.

UPDATE public.profiles 
SET must_change_password = true 
WHERE must_change_password = false OR must_change_password IS NULL;
