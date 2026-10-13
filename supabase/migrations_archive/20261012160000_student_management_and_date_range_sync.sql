-- =====================================================================
-- Migration: 20261012160000_student_management_and_date_range_sync.sql
-- Description: Thêm cột is_active cho bảng students, bảng semester_settings,
--              các RPC quản lý sinh viên (thêm, bật/tắt, kiểm tra tác động, xóa)
--              và RPC đồng bộ lịch ME theo khoảng ngày an toàn (không xóa ngoài khoảng).
-- =====================================================================

-- 1. Thêm cột is_active vào bảng public.students
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Bảng lưu cấu hình khoảng ngày học kỳ
CREATE TABLE IF NOT EXISTS public.semester_settings (
  id boolean DEFAULT true NOT NULL PRIMARY KEY CHECK (id),
  start_date date NOT NULL DEFAULT '2026-10-12',
  end_date date NOT NULL DEFAULT '2027-02-03',
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO public.semester_settings (id, start_date, end_date)
VALUES (true, '2026-10-12', '2027-02-03')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.semester_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "semester_settings_read" ON public.semester_settings;
CREATE POLICY "semester_settings_read" ON public.semester_settings
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "semester_settings_admin_write" ON public.semester_settings;
CREATE POLICY "semester_settings_admin_write" ON public.semester_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. RPC: Lấy cấu hình học kỳ (cho cả client public/authenticated)
CREATE OR REPLACE FUNCTION public.get_semester_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT start_date, end_date, updated_at
  INTO v_rec
  FROM public.semester_settings
  WHERE id = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'start_date', '2026-10-12',
      'end_date', '2027-02-03'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'start_date', v_rec.start_date,
    'end_date', v_rec.end_date,
    'updated_at', v_rec.updated_at
  );
END;
$$;

-- 4. RPC: Admin lưu cấu hình học kỳ
CREATE OR REPLACE FUNCTION public.admin_save_semester_settings(p_start_date date, p_end_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Khoảng ngày không hợp lệ. Ngày bắt đầu phải trước ngày kết thúc.');
  END IF;

  INSERT INTO public.semester_settings (id, start_date, end_date, updated_at)
  VALUES (true, p_start_date, p_end_date, now())
  ON CONFLICT (id) DO UPDATE
    SET start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$;

-- 5. RPC: Thêm sinh viên bằng MSSV
CREATE OR REPLACE FUNCTION public.admin_add_student(p_mssv text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  IF v_mssv = '' OR v_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'MSSV và họ tên sinh viên không được để trống.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.students WHERE mssv = v_mssv) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sinh viên với MSSV ' || v_mssv || ' đã tồn tại trong danh sách.');
  END IF;

  INSERT INTO public.students (mssv, name, is_active)
  VALUES (v_mssv, v_name, true);

  RETURN jsonb_build_object('ok', true, 'mssv', v_mssv, 'name', v_name);
END;
$$;

-- 6. RPC: Bật/tắt trạng thái hoạt động sinh viên (Ngừng hoạt động / Khôi phục)
CREATE OR REPLACE FUNCTION public.admin_set_student_active(p_mssv text, p_is_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  SELECT name INTO v_name FROM public.students WHERE mssv = v_mssv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên có MSSV: ' || v_mssv);
  END IF;

  UPDATE public.students
  SET is_active = coalesce(p_is_active, true)
  WHERE mssv = v_mssv;

  RETURN jsonb_build_object('ok', true, 'mssv', v_mssv, 'name', v_name, 'is_active', p_is_active);
END;
$$;

-- 7. RPC: Đánh giá tác động dữ liệu trước khi xóa sinh viên
CREATE OR REPLACE FUNCTION public.admin_get_student_delete_impact(p_mssv text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_name text;
  v_leave_count int := 0;
  v_sched_count int := 0;
  v_group_member_count int := 0;
  v_task_assign_count int := 0;
  v_attendance_count int := 0;
  v_reset_req_count int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  SELECT name INTO v_name FROM public.students WHERE mssv = v_mssv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên.');
  END IF;

  SELECT count(*) INTO v_leave_count FROM public.leave_requests WHERE mssv = v_mssv;
  SELECT count(*) INTO v_sched_count FROM public.student_schedules WHERE mssv = v_mssv;
  SELECT count(*) INTO v_group_member_count FROM public.team_group_members WHERE mssv = v_mssv;
  SELECT count(*) INTO v_task_assign_count FROM public.team_task_assignments WHERE mssv = v_mssv;
  SELECT count(*) INTO v_attendance_count FROM public.attendance WHERE mssv = v_mssv;
  SELECT count(*) INTO v_reset_req_count FROM public.password_reset_requests WHERE mssv = v_mssv;

  RETURN jsonb_build_object(
    'ok', true,
    'mssv', v_mssv,
    'name', v_name,
    'leave_count', v_leave_count,
    'schedules_count', v_sched_count,
    'group_member_count', v_group_member_count,
    'task_assign_count', v_task_assign_count,
    'attendance_count', v_attendance_count,
    'reset_req_count', v_reset_req_count
  );
END;
$$;

-- 8. RPC: Xóa hẳn sinh viên (khi admin xác nhận sau cảnh báo)
CREATE OR REPLACE FUNCTION public.admin_delete_student(p_mssv text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  SELECT name INTO v_name FROM public.students WHERE mssv = v_mssv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên để xóa.');
  END IF;

  DELETE FROM public.students WHERE mssv = v_mssv;

  RETURN jsonb_build_object('ok', true, 'mssv', v_mssv, 'name', v_name);
END;
$$;

-- 9. RPC: Đồng bộ lịch theo khoảng ngày (cho cả lớp hoặc riêng 1 sinh viên)
-- Giữ nguyên lịch ngoài khoảng [p_from_date, p_to_date]
CREATE OR REPLACE FUNCTION public.admin_sync_student_schedules_for_range(
  p_schedules jsonb,
  p_from_date date,
  p_to_date date,
  p_mssv text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_count int := 0;
  v_deleted int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  IF p_from_date IS NULL OR p_to_date IS NULL OR p_from_date > p_to_date THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Khoảng ngày không hợp lệ. Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
  END IF;

  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Danh sách lịch học gửi lên không hợp lệ.');
  END IF;

  -- Xóa lịch cũ CHỈ TRONG khoảng [p_from_date, p_to_date]
  IF v_mssv <> '' THEN
    DELETE FROM public.student_schedules
    WHERE mssv = v_mssv
      AND (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_from_date
      AND (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_to_date;
  ELSE
    DELETE FROM public.student_schedules
    WHERE (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_from_date
      AND (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_to_date;
  END IF;
  GET DIAGNOSTICS v_deleted = row_count;

  -- Chèn lịch mới vào bảng (khử trùng theo mssv, môn, phòng, thời gian)
  INSERT INTO public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week, buoi
  )
  SELECT DISTINCT ON (x.mssv, x.subject_name, x.start_time, x.end_time)
         x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week, x.buoi
  FROM jsonb_to_recordset(p_schedules) AS x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int, buoi smallint
  )
  WHERE (x.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_from_date
    AND (x.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_to_date
    AND (v_mssv = '' OR x.mssv = v_mssv);

  GET DIAGNOSTICS v_count = row_count;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'deleted', v_deleted,
    'from_date', p_from_date,
    'to_date', p_to_date,
    'mssv', CASE WHEN v_mssv = '' THEN NULL ELSE v_mssv END
  );
END;
$$;

-- Phân quyền thực thi
REVOKE ALL ON FUNCTION public.get_semester_settings() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_semester_settings() TO authenticated, anon;

REVOKE ALL ON FUNCTION public.admin_save_semester_settings(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_semester_settings(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_add_student(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_student(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_student_active(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_student_active(text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_student_delete_impact(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_student_delete_impact(text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_student(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_student(text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_sync_student_schedules_for_range(jsonb, date, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_sync_student_schedules_for_range(jsonb, date, date, text) TO authenticated;
