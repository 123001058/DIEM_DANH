-- Limit timetable reads to the signed-in student's own MSSV. Admins retain class-wide access.
-- The previous public read policies exposed every student's name and timetable to all visitors.

DROP POLICY IF EXISTS "Allow read student_schedules" ON public.student_schedules;
DROP POLICY IF EXISTS student_schedules_read_own_or_admin ON public.student_schedules;
CREATE POLICY student_schedules_read_own_or_admin ON public.student_schedules
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR mssv = (SELECT p.mssv FROM public.profiles p WHERE p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "read_students" ON public.students;
DROP POLICY IF EXISTS students_read_own_or_admin ON public.students;
CREATE POLICY students_read_own_or_admin ON public.students
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR mssv = (SELECT p.mssv FROM public.profiles p WHERE p.user_id = auth.uid())
  );
