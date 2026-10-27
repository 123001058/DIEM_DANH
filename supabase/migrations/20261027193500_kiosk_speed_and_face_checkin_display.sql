-- Migration: 20261027193500_kiosk_speed_and_face_checkin_display.sql
-- Mô tả:
-- 1. get_open_session: Trả về last_checkin id kèm timestamp tạo để Kiosk luôn phát hiện lượt điểm danh mới (kể cả cùng sinh viên quét lại).
-- 2. kiosk_record_face_checkin: Cập nhật created_at = now() và full_name cả khi ALREADY để kích hoạt Kiosk hiển thị tên ngay khi quét mặt.
-- 3. submit_attendance / submit_attendance_authenticated: Tương tự, cập nhật created_at khi quét lại.

-- 1. Cập nhật hàm get_open_session
create or replace function public.get_open_session()
returns jsonb
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', s.id,
    'session_name', s.session_name,
    'duration_min', s.duration_min,
    'warn_before_min', s.warn_before_min,
    'started_at', s.started_at,
    'qr_token', s.qr_token,
    'qr_born_at', s.qr_born_at,
    'last_checkin', (
      select jsonb_build_object(
        'id', a.id::text || '_' || to_char(a.created_at, 'YYYYMMDDHH24MISSMS'),
        'name', a.full_name
      )
      from public.attendance a
      where a.session_id = s.id
        and a.status in ('có mặt', 'đi muộn')
        and a.created_at >= now() - interval '25 seconds'
        and nullif(btrim(a.full_name), '') is not null
      order by a.created_at desc, a.id desc
      limit 1
    )
  )
  from public.sessions s
  where s.is_open
    and (s.duration_min is null or s.started_at + s.duration_min * interval '1 minute' > now())
  order by s.started_at desc
  limit 1;
$function$;

-- 2. Cập nhật kiosk_record_face_checkin
create or replace function public.kiosk_record_face_checkin(
  p_session_id text,
  p_mssv text,
  p_note text default 'Camera ESP32 điểm danh AI'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_sid uuid;
  v_session record;
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_name text;
  v_old_status text;
  v_final_status text;
  v_elapsed_min numeric;
  v_warn int;
  v_note text;
begin
  if not public.is_admin() then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORBIDDEN',
      'message', 'Chỉ quản trị viên đã đăng nhập mới được điểm danh bằng khuôn mặt.'
    );
  end if;

  if v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MSSV', 'message', 'MSSV không hợp lệ.');
  end if;

  -- Tìm sinh viên
  select name into v_name from public.students where mssv = v_mssv;
  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy sinh viên có MSSV: ' || v_mssv);
  end if;

  -- Tìm phiên
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

  -- Kiểm tra trạng thái hiện tại
  select status into v_old_status from public.attendance where session_id = v_sid and mssv = v_mssv;
  if v_old_status in ('có mặt', 'đi muộn') then
    -- Đã điểm danh trước đó: vẫn cập nhật created_at = now() để Kiosk nhận tín hiệu và hiển thị tên xác nhận!
    update public.attendance
    set created_at = now(),
        full_name = coalesce(full_name, v_name)
    where session_id = v_sid and mssv = v_mssv;

    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY',
      'message', 'Bạn đã điểm danh phiên này rồi.',
      'status', v_old_status,
      'name', v_name,
      'mssv', v_mssv,
      'session_id', v_sid
    );
  end if;

  -- Tính toán đi muộn
  v_elapsed_min := extract(epoch from (now() - coalesce(v_session.started_at, now()))) / 60.0;
  v_warn := coalesce(v_session.warn_before_min, 15);
  if v_warn <= 0 then
    v_warn := 15;
  end if;

  if v_elapsed_min > v_warn then
    v_final_status := 'đi muộn';
    v_note := 'Camera ESP32: Đi muộn (+' || round(v_elapsed_min)::text || 'p)';
  else
    v_final_status := 'có mặt';
    v_note := coalesce(nullif(btrim(p_note), ''), 'Camera ESP32 điểm danh AI');
  end if;

  -- Ghi vào attendance
  insert into public.attendance(session_id, mssv, full_name, status, category, note, created_at)
  values(v_sid, v_mssv, v_name, v_final_status, 'Khuôn mặt', v_note, now())
  on conflict(session_id, mssv) do update set
    full_name = coalesce(excluded.full_name, attendance.full_name, v_name),
    status = excluded.status,
    category = excluded.category,
    note = excluded.note,
    created_at = now();

  -- Ghi log audit
  insert into public.attendance_audit_logs(
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  ) values (
    v_sid, v_mssv, v_name, coalesce(v_old_status, 'chưa điểm danh'), v_final_status,
    'Camera Kiosk AI', v_note, now()
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'status', v_final_status,
    'name', v_name,
    'mssv', v_mssv,
    'session_id', v_sid,
    'note', v_note,
    'elapsed_min', round(v_elapsed_min)
  );
end;
$function$;

-- 3. Cập nhật submit_attendance (cho quét mã QR)
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
  where mssv = v_mssv and now() >= start_time and now() <= end_time
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
      -- Cập nhật timestamp để Kiosk hiện tên xác nhận
      update public.attendance
      set created_at = now(),
          full_name = coalesce(full_name, v_name)
      where session_id = s.id and mssv = v_mssv;

      return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
    end if;
    update public.attendance
    set status = v_final_status,
        category = v_cat,
        note = v_note,
        device_id = v_dev,
        full_name = coalesce(full_name, v_name),
        created_at = now()
    where session_id = s.id and mssv = v_mssv;

    return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'status', v_final_status);
  end if;

  if exists(select 1 from public.attendance where session_id = s.id and device_id = v_dev and mssv <> v_mssv) then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_USED', 'message', 'Thiết bị này đã điểm danh cho sinh viên khác.');
  end if;

  insert into public.attendance(session_id, mssv, full_name, status, category, note, device_id, created_at)
  values(s.id, v_mssv, v_name, v_final_status, v_cat, v_note, v_dev, now());

  return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'session_id', s.id, 'status', v_final_status);
exception when unique_violation then
  update public.attendance
  set created_at = now(),
      full_name = coalesce(full_name, v_name)
  where session_id = s.id and mssv = v_mssv;
  return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
end $function$;

-- 4. Cấp quyền
grant execute on function public.get_open_session() to anon, authenticated, service_role;
grant execute on function public.kiosk_record_face_checkin(text, text, text) to authenticated, service_role;
grant execute on function public.submit_attendance(text, text, text, text, text, text) to authenticated, service_role;
