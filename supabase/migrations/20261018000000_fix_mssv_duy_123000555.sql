-- =====================================================================
-- FIX MSSV: Đổi MSSV sai 12300555 thành 123000555 (Admin Nguyễn Lê Vũ Duy)
-- & CẤU HÌNH BUCKET AVATAR + RPC ĐỔI AVATAR ADMIN CHẠY 100%
-- =====================================================================

DO $$
BEGIN
  -- 1. Đảm bảo dòng MSSV chuẩn 123000555 tồn tại trong bảng students trước
  -- để các bảng con có thể trỏ sang mà không vi phạm Foreign Key
  IF EXISTS (SELECT 1 FROM public.students WHERE mssv = '12300555') THEN
    INSERT INTO public.students (mssv, name, class, phone, avatar, is_active)
    SELECT '123000555', coalesce(name, 'Nguyễn Lê Vũ Duy'), coalesce(class, '23TD111'), phone, 'images/faces/123000555.png', true
    FROM public.students WHERE mssv = '12300555'
    ON CONFLICT (mssv) DO UPDATE 
    SET name = EXCLUDED.name, avatar = EXCLUDED.avatar, is_active = true;
  ELSE
    INSERT INTO public.students (mssv, name, class, phone, avatar, is_active)
    VALUES ('123000555', 'Nguyễn Lê Vũ Duy', '23TD111', '0888189218', 'images/faces/123000555.png', true)
    ON CONFLICT (mssv) DO UPDATE 
    SET name = EXCLUDED.name, avatar = EXCLUDED.avatar, is_active = true;
  END IF;

  -- 2. Chuyển các bảng con từ 12300555 sang 123000555:

  -- 2.1 student_face_data
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_face_data') THEN
    DELETE FROM public.student_face_data WHERE mssv = '123000555';
    UPDATE public.student_face_data SET mssv = '123000555' WHERE mssv = '12300555';
  END IF;

  -- 2.2 student_schedules
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_schedules') THEN
    DELETE FROM public.student_schedules WHERE mssv = '123000555';
    UPDATE public.student_schedules SET mssv = '123000555' WHERE mssv = '12300555';
  END IF;

  -- 2.3 password_reset_requests
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'password_reset_requests') THEN
    UPDATE public.password_reset_requests SET mssv = '123000555' WHERE mssv = '12300555';
  END IF;

  -- 2.4 team_groups & members & tasks & assignments
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_groups') THEN
    UPDATE public.team_groups SET leader_mssv = '123000555' WHERE leader_mssv = '12300555';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_group_members') THEN
    DELETE FROM public.team_group_members WHERE mssv = '123000555';
    UPDATE public.team_group_members SET mssv = '123000555' WHERE mssv = '12300555';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_tasks') THEN
    UPDATE public.team_tasks SET claimed_by_mssv = '123000555' WHERE claimed_by_mssv = '12300555';
    UPDATE public.team_tasks SET completed_by_mssv = '123000555' WHERE completed_by_mssv = '12300555';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_task_assignments') THEN
    DELETE FROM public.team_task_assignments WHERE mssv = '123000555';
    UPDATE public.team_task_assignments SET mssv = '123000555' WHERE mssv = '12300555';
  END IF;

  -- 2.5 leave_requests
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leave_requests') THEN
    UPDATE public.leave_requests SET mssv = '123000555' WHERE mssv = '12300555';
  END IF;

  -- 2.6 attendance_records
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attendance_records') THEN
    UPDATE public.attendance_records SET mssv = '123000555' WHERE mssv = '12300555';
  END IF;

  -- 2.7 admin_mssv
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_mssv') THEN
    DELETE FROM public.admin_mssv WHERE mssv = '12300555';
    INSERT INTO public.admin_mssv (mssv) VALUES ('123000555') ON CONFLICT DO NOTHING;
  END IF;

  -- 2.8 profiles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    UPDATE public.profiles SET mssv = '123000555' WHERE mssv = '12300555';
  END IF;

  -- 3. Bây giờ đã an toàn để xóa dòng sai 12300555 khỏi students
  DELETE FROM public.students WHERE mssv = '12300555';

END $$;

-- 4. BUCKET STORAGE 'avatars': Đảm bảo tồn tại và mở quyền public đọc + ghi
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "avatars_read_public" ON storage.objects;
CREATE POLICY "avatars_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_auth" ON storage.objects;
CREATE POLICY "avatars_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_update_auth" ON storage.objects;
CREATE POLICY "avatars_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

-- 5. NÂNG CẤP RPC: student_set_my_avatar hỗ trợ cả DataURL Base64 và Admin
CREATE OR REPLACE FUNCTION public.student_set_my_avatar(p_avatar text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_mssv text;
  v_avatar text := nullif(btrim(coalesce(p_avatar, '')), '');
BEGIN
  -- Lấy MSSV từ profiles
  SELECT p.mssv INTO v_mssv FROM public.profiles p WHERE p.user_id = auth.uid();
  
  -- Nếu profiles chưa có nhưng là Admin thì fallback sang admin_mssv
  IF v_mssv IS NULL OR v_mssv = '' THEN
    IF public.is_admin() THEN
      SELECT mssv INTO v_mssv FROM public.admin_mssv LIMIT 1;
      IF v_mssv IS NULL THEN
        v_mssv := '123000555';
      END IF;
    ELSE
      RETURN jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV. Vui lòng liên hệ Admin.');
    END IF;
  END IF;

  -- Cho phép URL http(s), images/, /, và DataURL data:image/
  IF v_avatar IS NOT NULL AND v_avatar !~* '^(https?://|images/|/|data:image/)' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Định dạng ảnh đại diện không hợp lệ.');
  END IF;

  -- Đảm bảo sinh viên tồn tại
  INSERT INTO public.students (mssv, name, class, phone, avatar, is_active)
  VALUES (v_mssv, 'Nguyễn Lê Vũ Duy', '23TD111', '0888189218', v_avatar, true)
  ON CONFLICT (mssv) DO UPDATE SET avatar = EXCLUDED.avatar;

  UPDATE public.students SET avatar = v_avatar WHERE mssv = v_mssv;

  RETURN jsonb_build_object('ok', true, 'avatar', v_avatar, 'mssv', v_mssv);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.student_set_my_avatar(text) TO authenticated;

-- 6. RPC RIÊNG: admin_set_my_avatar dành riêng cho Admin đổi avatar trực tiếp
CREATE OR REPLACE FUNCTION public.admin_set_my_avatar(p_avatar text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_mssv text;
  v_avatar text := nullif(btrim(coalesce(p_avatar, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên mới có quyền thực hiện.');
  END IF;

  SELECT p.mssv INTO v_mssv FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_mssv IS NULL OR v_mssv = '' THEN
    v_mssv := '123000555';
  END IF;

  INSERT INTO public.students (mssv, name, class, phone, avatar, is_active)
  VALUES (v_mssv, 'Nguyễn Lê Vũ Duy', '23TD111', '0888189218', v_avatar, true)
  ON CONFLICT (mssv) DO UPDATE SET avatar = EXCLUDED.avatar;

  UPDATE public.students SET avatar = v_avatar WHERE mssv = v_mssv;

  RETURN jsonb_build_object('ok', true, 'avatar', v_avatar, 'mssv', v_mssv);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_my_avatar(text) TO authenticated;
