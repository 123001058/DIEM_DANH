-- Migration: 20261031110000_sync_me_schedule_status_baonghi.sql
-- Mô tả:
--   1. Thêm cột tinh_trang (smallint, default 0) vào bảng public.student_schedules
--      để lưu trạng thái lịch học từ cổng ME Lạc Hồng:
--        0 = Học bình thường
--        1 = Báo nghỉ
--        6 = Lịch thi
--   2. Cập nhật cả 4 RPC đồng bộ lịch (admin_sync_student_schedules,
--      admin_sync_student_schedules_for_date, server_replace_student_schedules_for_date,
--      admin_sync_student_schedules_for_range) để lưu trường tinh_trang.
--   3. Cập nhật admin_open_session, admin_close_session, submit_attendance:
--      Chỉ miễn điểm danh ('vắng có phép' - 'Học trường') hoặc báo trùng lịch khi
--      môn học không phải là môn Báo nghỉ (coalesce(tinh_trang, 0) <> 1).
--   4. Cập nhật trigger reconcile_schedule_with_attendance:
--      - Khi tiết học hoạt động (tinh_trang <> 1): tự động chuyển vắng không phép -> vắng có phép (Học trường).
--      - Khi tiết học cập nhật Báo nghỉ (tinh_trang = 1): tự động thu hồi trạng thái miễn 'Học trường'
--        nếu sinh viên không còn tiết học hoạt động nào khác trùng giờ phiên điểm danh.

-- =====================================================================
-- 1. Thêm cột tinh_trang vào public.student_schedules
-- =====================================================================
ALTER TABLE public.student_schedules
  ADD COLUMN IF NOT EXISTS tinh_trang smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_student_schedules_mssv_tinhtrang_start
  ON public.student_schedules (mssv, tinh_trang, start_time);

-- =====================================================================
-- 2. Cập nhật các RPC đồng bộ lịch học từ ME
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_sync_student_schedules_for_date(p_schedules jsonb, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_count int := 0;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  end if;

  if p_date is null then
    return jsonb_build_object('ok', false, 'message', 'Thiếu ngày cần đồng bộ.');
  end if;

  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Danh sách lịch học không hợp lệ.');
  end if;

  delete from public.student_schedules
  where (start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week, buoi, tinh_trang
  )
  select distinct on (x.mssv, x.subject_name, x.start_time, x.end_time)
         x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week, x.buoi, coalesce(x.tinh_trang, 0)
  from jsonb_to_recordset(p_schedules) as x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int, buoi smallint, tinh_trang smallint
  )
  where (x.start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date
  order by x.mssv, x.subject_name, x.start_time, x.end_time, coalesce(x.tinh_trang, 0) desc;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count, 'date', p_date);
end;
$function$;

CREATE OR REPLACE FUNCTION public.server_replace_student_schedules_for_date(p_schedules jsonb, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_count int := 0;
begin
  if p_date is null then
    return jsonb_build_object('ok', false, 'message', 'Thiếu ngày cần đồng bộ.');
  end if;

  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Danh sách lịch học không hợp lệ.');
  end if;

  delete from public.student_schedules
  where (start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week, buoi, tinh_trang
  )
  select distinct on (x.mssv, x.subject_name, x.start_time, x.end_time)
         x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week, x.buoi, coalesce(x.tinh_trang, 0)
  from jsonb_to_recordset(p_schedules) as x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int, buoi smallint, tinh_trang smallint
  )
  where (x.start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date
  order by x.mssv, x.subject_name, x.start_time, x.end_time, coalesce(x.tinh_trang, 0) desc;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count, 'date', p_date);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_sync_student_schedules(p_schedules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_count int := 0;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  end if;

  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' or jsonb_array_length(p_schedules) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Danh sách lịch học trống, giữ nguyên dữ liệu cũ.');
  end if;

  delete from public.student_schedules where true;
  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week, buoi, tinh_trang
  )
  select distinct on (x.mssv, x.subject_name, x.start_time, x.end_time)
         x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week, x.buoi, coalesce(x.tinh_trang, 0)
  from jsonb_to_recordset(p_schedules) as x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int, buoi smallint, tinh_trang smallint
  )
  order by x.mssv, x.subject_name, x.start_time, x.end_time, coalesce(x.tinh_trang, 0) desc;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$function$;

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
AS $function$
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

  INSERT INTO public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week, buoi, tinh_trang
  )
  SELECT DISTINCT ON (x.mssv, x.subject_name, x.start_time, x.end_time)
         x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week, x.buoi, coalesce(x.tinh_trang, 0)
  FROM jsonb_to_recordset(p_schedules) AS x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int, buoi smallint, tinh_trang smallint
  )
  WHERE (x.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_from_date
    AND (x.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_to_date
    AND (v_mssv = '' OR x.mssv = v_mssv)
  ORDER BY x.mssv, x.subject_name, x.start_time, x.end_time, coalesce(x.tinh_trang, 0) DESC;

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
$function$;

-- =====================================================================
-- 3. Cập nhật admin_open_session & admin_close_session & submit_attendance
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_open_session(p_name text, p_duration_min integer, p_warn_before_min integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_new_id uuid;
  v_token text;
  v_start timestamptz := now();
  v_end timestamptz;
  v_dur int := coalesce(p_duration_min, 240);
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'Tên phiên không được để trống.');
  end if;

  update public.sessions set is_open = false where is_open;
  v_end := v_start + (v_dur * interval '1 minute');
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.sessions(session_name, duration_min, warn_before_min, qr_token, qr_born_at, started_at)
  values (v_name, p_duration_min, greatest(1, coalesce(p_warn_before_min, 5)), v_token, v_start, v_start)
  returning id into v_new_id;

  -- 1. Tự động ghi nhận vắng có phép: Học trường (trùng lịch học/thi trường ME, BỎ QUA môn đã Báo nghỉ tinh_trang = 1)
  insert into public.attendance(session_id, mssv, full_name, status, category, note)
  select distinct on(st.mssv) v_new_id, st.mssv, st.name, 'vắng có phép', 'Học trường',
    (case when coalesce(sch.tinh_trang, 0) = 6 then 'Lịch thi: ' else 'Lịch học: ' end) || sch.subject_name || coalesce(' (' || sch.room_name || ')', '')
  from public.students st
  join public.student_schedules sch on sch.mssv = st.mssv
  where sch.start_time < v_end and sch.end_time > v_start
    and coalesce(sch.tinh_trang, 0) <> 1
  order by st.mssv, sch.start_time asc
  on conflict(session_id, mssv) do nothing;

  -- 2. Tự động ghi nhận vắng có phép: Lịch ngoài (khóa học ngoài: tiếng Nhật, IELTS...)
  insert into public.attendance(session_id, mssv, full_name, status, category, note)
  select distinct on(st.mssv) v_new_id, st.mssv, st.name, 'vắng có phép', 'Lịch ngoài',
    'Lịch ngoài: ' || ext.subject_name || coalesce(' (' || ext.room_name || ')', '')
  from public.students st
  join public.student_external_schedules ext on ext.mssv = st.mssv
  where public.external_schedule_covers_session(
    ext.start_date, ext.end_date, ext.days_of_week, ext.start_time, ext.end_time, v_start, v_dur
  )
  order by st.mssv, ext.start_time asc
  on conflict(session_id, mssv) do nothing;

  -- 3. Tự động ghi nhận vắng có phép: Đơn xin nghỉ phép ĐÃ DUYỆT bao phủ đúng phiên này
  insert into public.attendance(session_id, mssv, full_name, status, category, note)
  select distinct on(r.mssv) v_new_id, r.mssv, coalesce(st.name, r.mssv), 'vắng có phép', 'Xin nghỉ',
    coalesce('Nghỉ phép (' || case r.leave_period when 'morning' then 'Buổi sáng' when 'afternoon' then 'Buổi chiều' when 'evening' then 'Buổi tối' else 'Cả ngày' end || '): ' || r.reason, 'Nghỉ phép (đã duyệt)')
  from public.leave_requests r
  left join public.students st on st.mssv = r.mssv
  where r.status = 'approved'
    and public.leave_request_covers_session(r.leave_date, r.leave_period, v_start, v_dur)
  order by r.mssv, r.created_at desc
  on conflict(session_id, mssv) do update set
    status = 'vắng có phép',
    category = 'Xin nghỉ',
    note = excluded.note;

  return jsonb_build_object('ok', true, 'session_id', v_new_id, 'qr_token', v_token);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_close_session(p_session_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_sid uuid;
  v_session public.sessions%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
  if p_session_id is not null and btrim(p_session_id)<>'' then
    select * into v_session from public.sessions where id::text=btrim(p_session_id);
  else
    select * into v_session from public.sessions where is_open=true limit 1;
  end if;
  v_sid:=v_session.id;
  if v_sid is not null then
    v_start := v_session.started_at;
    v_end := v_session.started_at + (coalesce(v_session.duration_min, 240) * interval '1 minute');
    insert into public.attendance(session_id,mssv,full_name,status,category,note)
    select v_sid,st.mssv,st.name,
      case
        when exists(select 1 from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
          and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min)) then 'vắng có phép'
        when exists(select 1 from public.student_schedules sch where sch.mssv=st.mssv
          and sch.start_time < v_end and sch.end_time > v_start and coalesce(sch.tinh_trang, 0) <> 1) then 'vắng có phép'
        when exists(select 1 from public.student_external_schedules ext where ext.mssv=st.mssv
          and public.external_schedule_covers_session(ext.start_date,ext.end_date,ext.days_of_week,ext.start_time,ext.end_time,v_session.started_at,v_session.duration_min)) then 'vắng có phép'
        else 'vắng không phép' end,
      case
        when exists(select 1 from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
          and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min)) then 'Xin nghỉ'
        when exists(select 1 from public.student_schedules sch where sch.mssv=st.mssv
          and sch.start_time < v_end and sch.end_time > v_start and coalesce(sch.tinh_trang, 0) <> 1) then 'Học trường'
        when exists(select 1 from public.student_external_schedules ext where ext.mssv=st.mssv
          and public.external_schedule_covers_session(ext.start_date,ext.end_date,ext.days_of_week,ext.start_time,ext.end_time,v_session.started_at,v_session.duration_min)) then 'Lịch ngoài'
        else 'Xưởng' end,
      case
        when exists(select 1 from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
          and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min))
          then (select string_agg(r.reason,'; ') from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
            and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min))
        when exists(select 1 from public.student_schedules sch where sch.mssv=st.mssv
          and sch.start_time < v_end and sch.end_time > v_start and coalesce(sch.tinh_trang, 0) <> 1)
          then (select (case when coalesce(sch.tinh_trang, 0) = 6 then 'Lịch thi: ' else 'Lịch học: ' end) || sch.subject_name || coalesce(' (' || sch.room_name || ')','')
            from public.student_schedules sch where sch.mssv=st.mssv
            and sch.start_time < v_end and sch.end_time > v_start and coalesce(sch.tinh_trang, 0) <> 1
            order by sch.start_time limit 1)
        when exists(select 1 from public.student_external_schedules ext where ext.mssv=st.mssv
          and public.external_schedule_covers_session(ext.start_date,ext.end_date,ext.days_of_week,ext.start_time,ext.end_time,v_session.started_at,v_session.duration_min))
          then (select 'Lịch ngoài: ' || ext.subject_name || coalesce(' (' || ext.room_name || ')','')
            from public.student_external_schedules ext where ext.mssv=st.mssv
            and public.external_schedule_covers_session(ext.start_date,ext.end_date,ext.days_of_week,ext.start_time,ext.end_time,v_session.started_at,v_session.duration_min)
            order by ext.start_time limit 1)
        else '' end
    from public.students st
    where not exists(select 1 from public.attendance a where a.session_id=v_sid and a.mssv=st.mssv)
    on conflict(session_id,mssv) do nothing;
    update public.sessions set is_open=false where id=v_sid;
  end if;
  update public.sessions set is_open=false where is_open=true;
  return jsonb_build_object('ok',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_attendance(
  p_session_id text,
  p_token text,
  p_mssv text,
  p_category text,
  p_note text,
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  s record;
  v_mssv text;
  v_name text;
  v_status text;
  v_cat text := left(btrim(coalesce(p_category, '')), 60);
  v_note text := left(btrim(coalesce(p_note, '')), 200);
  v_dev text := btrim(coalesce(p_device_id, ''));
  v_sub text;
  v_room text;
  v_late_min int := 15;
  v_final_status text := 'có mặt';
  v_elapsed_min int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTH', 'message', 'Vui lòng đăng nhập trước khi điểm danh.');
  end if;

  select btrim(mssv) into v_mssv from public.profiles where user_id = v_uid;
  if v_mssv is null or v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_MSSV', 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  if p_token is null or length(p_token) < 20 or v_cat = '' or v_dev = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_INPUT', 'message', 'Thiếu thông tin điểm danh.');
  end if;

  select * into s from public.sessions where id::text = btrim(p_session_id);
  if not found or not s.is_open or (s.duration_min is not null and s.started_at + s.duration_min * interval '1 minute' <= now()) then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED', 'message', 'Phiên đã đóng hoặc hết giờ.');
  end if;

  if s.qr_token <> p_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_INVALID', 'message', 'Mã QR không còn hiệu lực. Vui lòng quét mã mới.');
  end if;

  select name into v_name from public.students where mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_CLASS', 'message', 'MSSV không có trong danh sách lớp.');
  end if;

  select subject_name, room_name into v_sub, v_room
  from public.student_schedules
  where mssv = v_mssv
    and now() >= start_time and now() <= end_time
    and coalesce(tinh_trang, 0) <> 1
  order by start_time limit 1;

  if v_sub is not null and v_note = '' then
    v_note := 'Trùng lịch: ' || v_sub || coalesce(' (' || v_room || ')', '');
  end if;

  if s.warn_before_min is not null and s.warn_before_min > 5 then
    v_late_min := s.warn_before_min;
  else
    v_late_min := 15;
  end if;

  if now() > (s.started_at + (v_late_min * interval '1 minute')) then
    v_final_status := 'đi muộn';
    v_elapsed_min := round(extract(epoch from (now() - s.started_at)) / 60);
    if v_note = '' then
      v_note := 'Quét trễ (+' || v_elapsed_min::text || ' phút)';
    end if;
  else
    v_final_status := 'có mặt';
  end if;

  select status into v_status from public.attendance where session_id = s.id and mssv = v_mssv;
  if found then
    if v_status in ('có mặt', 'đi muộn') then
      perform public.emit_kiosk_checkin_display_event(s.id, v_mssv);
      return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
    end if;
    update public.attendance
    set status = v_final_status,
        category = v_cat,
        note = v_note,
        device_id = v_dev,
        created_at = now()
    where session_id = s.id and mssv = v_mssv;

    perform public.emit_kiosk_checkin_display_event(s.id, v_mssv);
    return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'status', v_final_status);
  end if;

  if exists(select 1 from public.attendance where session_id = s.id and device_id = v_dev and mssv <> v_mssv) then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_USED', 'message', 'Thiết bị này đã điểm danh cho sinh viên khác.');
  end if;

  insert into public.attendance(session_id, mssv, full_name, status, category, note, device_id)
  values(s.id, v_mssv, v_name, v_final_status, v_cat, v_note, v_dev);

  perform public.emit_kiosk_checkin_display_event(s.id, v_mssv);
  return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'session_id', s.id, 'status', v_final_status);
exception when unique_violation then
  if s.id is not null and v_mssv is not null and exists (
    select 1 from public.attendance
    where session_id = s.id and mssv = v_mssv and status in ('có mặt', 'đi muộn')
  ) then
    perform public.emit_kiosk_checkin_display_event(s.id, v_mssv);
  end if;
  return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
end;
$function$;

-- =====================================================================
-- 4. Cập nhật trigger đối soát tự động reconcile_schedule_with_attendance
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reconcile_schedule_with_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_prefix text := case when coalesce(new.tinh_trang, 0) = 6 then 'Lịch thi: ' else 'Lịch học: ' end;
  v_student_name text;
begin
  if coalesce(new.tinh_trang, 0) <> 1 then
    -- Trường hợp 1: Tiết học/thi đang hoạt động (không phải Báo nghỉ)
    -- 1a. Chuyển 'vắng không phép' (Xưởng) trong 7 ngày gần nhất thành 'vắng có phép' (Học trường)
    with flipped as (
      update public.attendance a
      set status = 'vắng có phép',
          category = 'Học trường',
          note = v_prefix || new.subject_name || coalesce(' (' || new.room_name || ')', '')
      from public.sessions s
      where a.session_id = s.id
        and a.mssv = new.mssv
        and a.status = 'vắng không phép'
        and a.category = 'Xưởng'
        and new.start_time < (s.started_at + (coalesce(s.duration_min, 240) * interval '1 minute'))
        and new.end_time > s.started_at
        and (s.started_at at time zone 'Asia/Ho_Chi_Minh')::date >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 7)
      returning a.session_id, a.mssv, a.full_name
    )
    insert into public.attendance_audit_logs
      (session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at)
    select f.session_id, f.mssv, f.full_name, 'vắng không phép', 'vắng có phép',
           'Hệ thống (Đồng bộ lịch ME)',
           'Tự động đối chiếu ' || lower(v_prefix) || new.subject_name || coalesce(' (' || new.room_name || ')', ''),
           now()
    from flipped f;

    -- 1b. Nếu đang có phiên mở trùng giờ mà sinh viên chưa có bản ghi điểm danh, tự động thêm 'vắng có phép' (Học trường)
    select name into v_student_name from public.students where mssv = new.mssv;
    if v_student_name is not null then
      insert into public.attendance(session_id, mssv, full_name, status, category, note)
      select s.id, new.mssv, v_student_name, 'vắng có phép', 'Học trường',
             v_prefix || new.subject_name || coalesce(' (' || new.room_name || ')', '')
      from public.sessions s
      where s.is_open = true
        and new.start_time < (s.started_at + (coalesce(s.duration_min, 240) * interval '1 minute'))
        and new.end_time > s.started_at
      on conflict (session_id, mssv) do nothing;
    end if;

  else
    -- Trường hợp 2: Tiết học trên ME vừa cập nhật sang BÁO NGHỈ (tinh_trang = 1)
    -- 2a. Đối với phiên ĐANG MỞ: Nếu sinh viên đang được miễn tự động ('vắng có phép' + 'Học trường')
    --     và không còn tiết học hoạt động nào khác trùng giờ phiên, thu hồi bản ghi miễn để SV điểm danh tại xưởng
    with revoked_open as (
      delete from public.attendance a
      using public.sessions s
      where a.session_id = s.id
        and s.is_open = true
        and a.mssv = new.mssv
        and a.status = 'vắng có phép'
        and a.category = 'Học trường'
        and new.start_time < (s.started_at + (coalesce(s.duration_min, 240) * interval '1 minute'))
        and new.end_time > s.started_at
        and not exists (
          select 1 from public.student_schedules sch2
          where sch2.mssv = new.mssv
            and sch2.id <> new.id
            and coalesce(sch2.tinh_trang, 0) <> 1
            and sch2.start_time < (s.started_at + (coalesce(s.duration_min, 240) * interval '1 minute'))
            and sch2.end_time > s.started_at
        )
      returning a.session_id, a.mssv, a.full_name
    )
    insert into public.attendance_audit_logs
      (session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at)
    select r.session_id, r.mssv, r.full_name, 'vắng có phép', 'chưa điểm danh',
           'Hệ thống (Đồng bộ lịch ME)',
           'Thu hồi miễn Học trường do môn học báo nghỉ trên ME: ' || new.subject_name || coalesce(' (' || new.room_name || ')', ''),
           now()
    from revoked_open r;

    -- 2b. Đối với phiên ĐÃ ĐÓNG trong 7 ngày gần nhất: Nếu đang được miễn 'Học trường' mà môn đó báo nghỉ,
    --     và không còn lịch học hoạt động / lịch ngoài / đơn nghỉ đã duyệt nào khác bao phủ phiên
    with revoked_closed as (
      update public.attendance a
      set status = 'vắng không phép',
          category = 'Xưởng',
          note = 'Môn học báo nghỉ trên ME: ' || new.subject_name || coalesce(' (' || new.room_name || ')', '')
      from public.sessions s
      where a.session_id = s.id
        and s.is_open = false
        and a.mssv = new.mssv
        and a.status = 'vắng có phép'
        and a.category = 'Học trường'
        and new.start_time < (s.started_at + (coalesce(s.duration_min, 240) * interval '1 minute'))
        and new.end_time > s.started_at
        and (s.started_at at time zone 'Asia/Ho_Chi_Minh')::date >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 7)
        and not exists (
          select 1 from public.student_schedules sch2
          where sch2.mssv = new.mssv
            and sch2.id <> new.id
            and coalesce(sch2.tinh_trang, 0) <> 1
            and sch2.start_time < (s.started_at + (coalesce(s.duration_min, 240) * interval '1 minute'))
            and sch2.end_time > s.started_at
        )
        and not exists (
          select 1 from public.leave_requests lr
          where lr.mssv = new.mssv
            and lr.status = 'approved'
            and public.leave_request_covers_session(lr.leave_date, lr.leave_period, s.started_at, s.duration_min)
        )
        and not exists (
          select 1 from public.student_external_schedules ext
          where ext.mssv = new.mssv
            and public.external_schedule_covers_session(ext.start_date, ext.end_date, ext.days_of_week, ext.start_time, ext.end_time, s.started_at, s.duration_min)
        )
      returning a.session_id, a.mssv, a.full_name
    )
    insert into public.attendance_audit_logs
      (session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at)
    select rc.session_id, rc.mssv, rc.full_name, 'vắng có phép', 'vắng không phép',
           'Hệ thống (Đồng bộ lịch ME)',
           'Môn học cập nhật Báo nghỉ trên ME: ' || new.subject_name || coalesce(' (' || new.room_name || ')', ''),
           now()
    from revoked_closed rc;
  end if;

  return new;
end;
$function$;

DROP TRIGGER IF EXISTS reconcile_schedule_attendance_after_insert ON public.student_schedules;
CREATE TRIGGER reconcile_schedule_attendance_after_insert
AFTER INSERT OR UPDATE ON public.student_schedules
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_schedule_with_attendance();

REVOKE ALL ON FUNCTION public.reconcile_schedule_with_attendance() FROM public, anon, authenticated;

