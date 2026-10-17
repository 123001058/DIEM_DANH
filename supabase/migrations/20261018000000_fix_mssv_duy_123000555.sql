-- =====================================================================
-- FIX MSSV: Đổi MSSV sai 12300555 thành 123000555 (Admin Nguyễn Lê Vũ Duy)
-- =====================================================================

DO $$
BEGIN
  -- 1. Cập nhật bảng students
  IF EXISTS (SELECT 1 FROM public.students WHERE mssv = '12300555') THEN
    DELETE FROM public.students WHERE mssv = '123000555';
    UPDATE public.students 
    SET mssv = '123000555', avatar = 'images/faces/123000555.png' 
    WHERE mssv = '12300555';
  ELSE
    INSERT INTO public.students (mssv, name, class, phone, avatar, is_active)
    VALUES ('123000555', 'Nguyễn Lê Vũ Duy', '23TD111', '0888189218', 'images/faces/123000555.png', true)
    ON CONFLICT (mssv) DO UPDATE 
    SET name = EXCLUDED.name, avatar = EXCLUDED.avatar, is_active = true;
  END IF;

  -- 2. Cập nhật bảng student_face_data (dữ liệu vector nhận diện khuôn mặt)
  IF EXISTS (SELECT 1 FROM public.student_face_data WHERE mssv = '12300555') THEN
    DELETE FROM public.student_face_data WHERE mssv = '123000555';
    UPDATE public.student_face_data 
    SET mssv = '123000555' 
    WHERE mssv = '12300555';
  END IF;

  -- 3. Cập nhật bảng admin_mssv nếu có
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_mssv') THEN
    UPDATE public.admin_mssv SET mssv = '123000555' WHERE mssv = '12300555';
    INSERT INTO public.admin_mssv (mssv) VALUES ('123000555') ON CONFLICT DO NOTHING;
  END IF;

  -- 4. Cập nhật bảng profiles nếu có
  UPDATE public.profiles SET mssv = '123000555' WHERE mssv = '12300555';
END $$;
