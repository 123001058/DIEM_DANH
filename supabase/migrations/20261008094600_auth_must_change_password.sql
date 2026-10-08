-- Migration: Thêm cột must_change_password và Trigger cho auth.users
-- Schema: public

-- 1. Thêm cột trạng thái
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- 2. Function xử lý trigger
CREATE OR REPLACE FUNCTION public.handle_password_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- Chỉ cập nhật nếu encrypted_password thay đổi (không tính lúc tạo user mới)
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    -- Nếu có marker admin_reset_at vừa bị thêm/đổi thì đây là thao tác của Admin
    IF (OLD.raw_app_meta_data->>'admin_reset_at') IS DISTINCT FROM (NEW.raw_app_meta_data->>'admin_reset_at') THEN
      UPDATE public.profiles SET must_change_password = true WHERE user_id = NEW.id;
    ELSE
      -- Người dùng tự đổi mật khẩu hợp lệ
      UPDATE public.profiles SET must_change_password = false WHERE user_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Gắn Trigger
DROP TRIGGER IF EXISTS on_password_changed ON auth.users;
CREATE TRIGGER on_password_changed
AFTER UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_password_changed();
