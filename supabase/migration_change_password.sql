-- 1. Thêm cột trạng thái vào bảng profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- 2. Đánh dấu tất cả tài khoản cũ (Sinh viên và Admin) phải đổi mật khẩu
UPDATE public.profiles SET must_change_password = true;

-- 3. Tạo hàm xử lý tự động khi đổi mật khẩu
CREATE OR REPLACE FUNCTION public.handle_password_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- Chỉ cập nhật nếu encrypted_password thay đổi (không tính lúc tạo user mới)
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    -- Nếu có flag từ Edge Function thì là Admin Reset, bắt đổi pass
    IF (OLD.raw_app_meta_data->>'admin_reset_at') IS DISTINCT FROM (NEW.raw_app_meta_data->>'admin_reset_at') THEN
      UPDATE public.profiles SET must_change_password = true WHERE user_id = NEW.id;
    ELSE
      -- Nếu do user tự đổi hợp lệ, gỡ cờ
      UPDATE public.profiles SET must_change_password = false WHERE user_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Tạo trigger trên bảng auth.users
DROP TRIGGER IF EXISTS on_password_changed ON auth.users;
CREATE TRIGGER on_password_changed
AFTER UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_password_changed();

-- 5. Cấp quyền cần thiết (không cấp quyền UPDATE cho client)
-- Frontend chỉ được đọc (SELECT) thông qua policy prof_self đã có.
