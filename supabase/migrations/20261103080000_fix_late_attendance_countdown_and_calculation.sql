-- Migration: 20261103080000_fix_late_attendance_countdown_and_calculation.sql
-- Mô tả: Chuẩn hóa logic tính toán thời gian đi muộn và thời lượng phiên:
--   1. admin_open_session: Default p_warn_before_min = 30 (thống nhất với TASK-028 & UI Admin).
--   2. submit_attendance: Bỏ điều kiện cứng > 5 phút (tiếp nhận mọi giá trị cài đặt >= 1 phút);
--      tính số phút trễ thực tế so với mốc quy định thay vì lấy tổng thời gian từ lúc mở phiên.
--   3. kiosk_record_face_checkin: Đồng bộ ngưỡng đi muộn (mặc định 30 phút nếu để trống) và
--      tính số phút trễ thực tế so với mốc quy định.

-- 1. Cập nhật admin_open_session
CREATE OR REPLACE FUNCTION public.admin_open_session(
  p_name text,
  p_duration_min integer,
  p_warn_before_min integer DEFAULT 30
)
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
  v_warn int := greatest(1, coalesce(p_warn_before_min, 30));
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
  values (v_name, p_duration_min, v_warn, v_token, v_start, v_start)
  returning id into v_new_id;

  -- 1. Tự động ghi nhận vắng có phép: Học trường (trùng lịch học/thi trường ME, BỎ QUA môn Báo nghỉ tinh_trang IN (1, 2))
  insert into public.attendance(session_id, mssv, full_name, status, category, note)
  select distinct on(st.mssv) v_new_id, st.mssv, st.name, 'vắng có phép', 'Học trường',
    (case when coalesce(sch.tinh_trang, 0) = 6 then 'Lịch thi: ' else 'Lịch học: ' end) || sch.subject_name || coalesce(' (' || sch.room_name || ')', '')
  from public.students st
  join public.student_schedules sch on sch.mssv = st.mssv
  where sch.start_time < v_end and sch.end_time > v_start
    and coalesce(sch.tinh_trang, 0) not in (1, 2)
  order by st.mssv, sch.start_time asc
  on conflict(session_id, mssv) do nothing;

  -- 2. Tự động ghi nhận vắng có phép: Lịch ngoài
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

  -- 3. Tự động ghi nhận vắng có phép: Đơn xin nghỉ phép ĐÃ DUYỆT
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

-- 2. Cập nhật submit_attendance (6 tham số khớp với schema và client)
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
  v_late_min int := 30;
  v_final_status text := 'có mặt';
  v_late_diff_min int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTH', 'message', 'Vui lòng đăng nhập trước khi điểm danh.');
  end if;

  select btrim(mssv) into v_mssv from public.profiles where user_id = v_uid;
  if v_mssv is null or v_mssv = '' then
    v_mssv := btrim(coalesce(p_mssv, ''));
  end if;
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
    and coalesce(tinh_trang, 0) not in (1, 2)
  order by start_time limit 1;

  if v_sub is not null and v_note = '' then
    v_note := 'Trùng lịch: ' || v_sub || coalesce(' (' || v_room || ')', '');
  end if;

  -- Ngưỡng tính đi muộn: lấy warn_before_min được cấu hình của phiên (mặc định 30 phút, tối thiểu 1)
  v_late_min := greatest(1, coalesce(s.warn_before_min, 30));

  if now() > (s.started_at + (v_late_min * interval '1 minute')) then
    v_final_status := 'đi muộn';
    -- Số phút đi muộn thực tế tính từ sau mốc quy định
    v_late_diff_min := greatest(1, round(extract(epoch from (now() - (s.started_at + (v_late_min * interval '1 minute')))) / 60));
    if v_note = '' then
      v_note := 'Quét trễ (+' || v_late_diff_min::text || ' phút)';
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

-- 3. Cập nhật kiosk_record_face_checkin (khớp chính xác thứ tự tham số p_session_id, p_mssv, p_note)
CREATE OR REPLACE FUNCTION public.kiosk_record_face_checkin(
  p_session_id text,
  p_mssv text,
  p_note text DEFAULT 'Camera ESP32 điểm danh AI'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_session public.sessions%rowtype;
  v_sid uuid;
  v_name text;
  v_old_status text;
  v_final_status text;
  v_elapsed_min numeric;
  v_late_diff_min int;
  v_warn int;
  v_note text;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ quản trị viên đã đăng nhập mới được điểm danh bằng khuôn mặt.');
  end if;
  if v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MSSV', 'message', 'MSSV không hợp lệ.');
  end if;

  select name into v_name from public.students where mssv = v_mssv;
  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy sinh viên có MSSV: ' || v_mssv);
  end if;

  if p_session_id is not null and btrim(p_session_id) <> '' then
    select * into v_session from public.sessions where id::text = btrim(p_session_id);
  else
    select * into v_session from public.sessions where is_open = true order by started_at desc limit 1;
  end if;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'Chưa có phiên điểm danh nào đang mở.');
  end if;
  if not v_session.is_open then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED', 'message', 'Phiên điểm danh đã đóng.');
  end if;
  if v_session.duration_min is not null
     and coalesce(v_session.started_at, now()) + v_session.duration_min * interval '1 minute' <= now() then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED', 'message', 'Phiên điểm danh đã hết thời gian.');
  end if;

  v_sid := v_session.id;
  select status into v_old_status from public.attendance
  where session_id = v_sid and mssv = v_mssv for update;

  if v_old_status = 'vắng có phép' then
    return jsonb_build_object('ok', false, 'code', 'EXCUSED', 'message', 'Sinh viên đã được ghi nhận vắng có phép. Camera không thay đổi trạng thái này.', 'status', v_old_status, 'name', v_name, 'mssv', v_mssv, 'session_id', v_sid);
  end if;
  if v_old_status in ('có mặt', 'đi muộn') then
    perform public.emit_kiosk_checkin_display_event(v_sid, v_mssv);
    return jsonb_build_object('ok', true, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.', 'status', v_old_status, 'name', v_name, 'mssv', v_mssv, 'session_id', v_sid);
  end if;

  v_elapsed_min := extract(epoch from (now() - coalesce(v_session.started_at, now()))) / 60.0;
  v_warn := greatest(1, coalesce(v_session.warn_before_min, 30));

  if v_elapsed_min > v_warn then
    v_final_status := 'đi muộn';
    v_late_diff_min := greatest(1, round(v_elapsed_min - v_warn));
    v_note := 'Camera ESP32: Đi muộn (+' || v_late_diff_min::text || 'p)';
  else
    v_final_status := 'có mặt';
    v_note := coalesce(nullif(btrim(p_note), ''), 'Camera ESP32 điểm danh AI');
  end if;

  insert into public.attendance(session_id, mssv, full_name, status, category, note, created_at)
  values(v_sid, v_mssv, v_name, v_final_status, 'Khuôn mặt', v_note, now())
  on conflict(session_id, mssv) do update set
    status = excluded.status,
    category = excluded.category,
    note = excluded.note,
    created_at = now();

  insert into public.attendance_audit_logs(
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  ) values (
    v_sid, v_mssv, v_name, coalesce(v_old_status, 'chưa điểm danh'), v_final_status,
    'Camera Kiosk AI', v_note, now()
  );

  perform public.emit_kiosk_checkin_display_event(v_sid, v_mssv);
  return jsonb_build_object('ok', true, 'code', 'OK', 'status', v_final_status, 'name', v_name, 'mssv', v_mssv, 'session_id', v_sid, 'note', v_note, 'elapsed_min', round(v_elapsed_min));
end;
$function$;


-- 4. Cập nhật submit_attendance_authenticated
CREATE OR REPLACE FUNCTION public.submit_attendance_authenticated(
  p_session_id text,
  p_category text DEFAULT 'Đi học'::text,
  p_note text DEFAULT ''::text,
  p_device_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  s record;
  v_mssv text;
  v_name text;
  v_existing_status text;
  v_late_min int := 30;
  v_final_status text := 'có mặt';
  v_late_diff_min int := 0;
  v_note text := left(btrim(coalesce(p_note, '')), 200);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'message', 'Bạn chưa đăng nhập.');
  end if;

  select mssv into v_mssv from public.profiles where user_id = v_uid;
  v_mssv := btrim(coalesce(v_mssv, ''));
  if v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_MSSV', 'message', 'Tài khoản chưa được liên kết MSSV. Vui lòng liên hệ Admin.');
  end if;

  select * into s from public.sessions where id::text = p_session_id;
  if not found or not s.is_open or (
    s.duration_min is not null and s.started_at + (s.duration_min * interval '1 minute') <= now()
  ) then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED', 'message', 'Phiên điểm danh đã đóng hoặc đã hết giờ.');
  end if;

  select name into v_name from public.students where mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_CLASS', 'message', 'MSSV không có trong danh sách lớp!');
  end if;

  v_late_min := greatest(1, coalesce(s.warn_before_min, 30));

  if now() > (s.started_at + (v_late_min * interval '1 minute')) then
    v_final_status := 'đi muộn';
    v_late_diff_min := greatest(1, round(extract(epoch from (now() - (s.started_at + (v_late_min * interval '1 minute')))) / 60));
    if v_note = '' then
      v_note := 'Quét trễ (+' || v_late_diff_min::text || ' phút)';
    end if;
  else
    v_final_status := 'có mặt';
  end if;

  select status into v_existing_status from public.attendance where session_id = s.id and mssv = v_mssv;
  if found then
    if v_existing_status in ('có mặt', 'đi muộn') then
      return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
    end if;
    update public.attendance
    set status = v_final_status,
        category = coalesce(p_category, 'Đi học'),
        note = v_note,
        device_id = p_device_id,
        created_at = now()
    where session_id = s.id and mssv = v_mssv;

    return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'status', v_final_status);
  end if;

  insert into public.attendance(session_id, mssv, full_name, status, category, note, device_id)
  values(s.id, v_mssv, v_name, v_final_status, coalesce(p_category, 'Đi học'), v_note, p_device_id);

  return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'session_id', s.id, 'status', v_final_status);
end;
$function$;
