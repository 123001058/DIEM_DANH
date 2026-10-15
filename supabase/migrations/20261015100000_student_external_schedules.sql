-- Migration: Bảng quản lý Lịch học ngoài (External Schedules) cho sinh viên
-- Giúp lưu các khóa học ngoài (TOEIC, IELTS, thực tập...) không có trên cổng ME trường,
-- hỗ trợ lặp theo thứ và linh hoạt từ ngày đến ngày mà không bao giờ bị ghi đè khi sync ME.

CREATE TABLE IF NOT EXISTS public.student_external_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mssv text NOT NULL REFERENCES public.students(mssv) ON DELETE CASCADE,
  subject_name text NOT NULL,
  room_name text DEFAULT 'Ngoài trường',
  teacher_name text DEFAULT '',
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_of_week integer[] NOT NULL, -- 2: Thứ Hai, 3: Thứ Ba, ..., 7: Thứ Bảy, 8: Chủ Nhật
  start_time time NOT NULL,
  end_time time NOT NULL,
  buoi smallint NOT NULL DEFAULT 1, -- 1: Sáng, 2: Chiều, 3: Tối
  note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_student_ext_sched_mssv ON public.student_external_schedules(mssv);
CREATE INDEX IF NOT EXISTS idx_student_ext_sched_dates ON public.student_external_schedules(start_date, end_date);

-- Bật RLS
ALTER TABLE public.student_external_schedules ENABLE ROW LEVEL SECURITY;

-- Cấp quyền bảng cho authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_external_schedules TO authenticated;

-- Policies
DROP POLICY IF EXISTS "ext_sched_select_policy" ON public.student_external_schedules;
CREATE POLICY "ext_sched_select_policy" ON public.student_external_schedules
FOR SELECT TO authenticated
USING (
  public.is_admin() = true
  OR mssv = (SELECT mssv FROM public.profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "ext_sched_insert_policy" ON public.student_external_schedules;
CREATE POLICY "ext_sched_insert_policy" ON public.student_external_schedules
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin() = true
  OR mssv = (SELECT mssv FROM public.profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "ext_sched_update_policy" ON public.student_external_schedules;
CREATE POLICY "ext_sched_update_policy" ON public.student_external_schedules
FOR UPDATE TO authenticated
USING (
  public.is_admin() = true
  OR mssv = (SELECT mssv FROM public.profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "ext_sched_delete_policy" ON public.student_external_schedules;
CREATE POLICY "ext_sched_delete_policy" ON public.student_external_schedules
FOR DELETE TO authenticated
USING (
  public.is_admin() = true
  OR mssv = (SELECT mssv FROM public.profiles WHERE user_id = auth.uid())
);
