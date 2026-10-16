-- Migration: 20261016100000_auto_late_checkin.sql
-- Mô tả: Tự động tính toán trạng thái "đi muộn" khi quét QR hoặc xác thực sau ngưỡng thời gian trễ của phiên

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

  -- Ngưỡng tính đi muộn: ưu tiên warn_before_min của phiên nếu > 5 phút, còn lại mặc định 15 phút
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
      return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
    end if;
    update public.attendance
    set status = v_final_status,
        category = v_cat,
        note = v_note,
        device_id = v_dev,
        created_at = now()
    where session_id = s.id and mssv = v_mssv;

    return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'status', v_final_status);
  end if;

  if exists(select 1 from public.attendance where session_id = s.id and device_id = v_dev and mssv <> v_mssv) then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_USED', 'message', 'Thiết bị này đã điểm danh cho sinh viên khác.');
  end if;

  insert into public.attendance(session_id, mssv, full_name, status, category, note, device_id)
  values(s.id, v_mssv, v_name, v_final_status, v_cat, v_note, v_dev);

  return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'session_id', s.id, 'status', v_final_status);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
end $function$;

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
  v_late_min int := 15;
  v_final_status text := 'có mặt';
  v_elapsed_min int := 0;
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

  select status into v_existing_status
  from public.attendance
  where session_id = s.id and mssv = v_mssv;

  if found then
    if v_existing_status in ('vắng có phép', 'vắng không phép') then
      update public.attendance
      set status = v_final_status,
          category = left(btrim(coalesce(p_category, 'Đi học')), 60),
          note = v_note,
          device_id = p_device_id,
          created_at = now()
      where session_id = s.id and mssv = v_mssv;

      return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'status', v_final_status);
    else
      return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
    end if;
  end if;

  insert into public.attendance(session_id, mssv, full_name, status, category, note, device_id)
  values(s.id, v_mssv, v_name, v_final_status, left(btrim(coalesce(p_category, 'Đi học')), 60), v_note, p_device_id);

  return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'session_id', s.id, 'status', v_final_status);
end $function$;

-- Cập nhật admin_set_status để tự động đồng bộ created_at theo thời gian thực khi chỉnh trạng thái
CREATE OR REPLACE FUNCTION public.admin_set_status(
  p_session_id text,
  p_mssv text,
  p_status text,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_sid uuid;
  v_name text;
  v_old_status text;
  v_admin_email text := coalesce(auth.jwt() ->> 'email', 'Admin');
  v_category text := 'Admin';
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  if p_status not in ('có mặt', 'đi muộn', 'vắng có phép', 'vắng không phép') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  select s.id into v_sid
  from public.sessions s
  where s.id::text = btrim(p_session_id);

  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;

  select a.full_name, a.status into v_name, v_old_status
  from public.attendance a
  where a.session_id = v_sid and a.mssv = btrim(p_mssv);

  if v_name is null then
    select st.name into v_name from public.students st where st.mssv = btrim(p_mssv);
  end if;
  v_name := coalesce(nullif(btrim(v_name), ''), btrim(p_mssv));

  if coalesce(p_reason, '') ilike '%ESP32%' then
    v_category := 'Khuôn mặt';
  end if;

  insert into public.attendance (session_id, mssv, full_name, status, category, note, created_at)
  values (v_sid, btrim(p_mssv), v_name, p_status, v_category, coalesce(p_reason, ''), now())
  on conflict (session_id, mssv) do update set
    status = excluded.status,
    category = excluded.category,
    created_at = now(),
    note = case
      when nullif(btrim(coalesce(p_reason, '')), '') is not null then p_reason
      else public.attendance.note
    end;

  insert into public.attendance_audit_logs (
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  ) values (
    v_sid, btrim(p_mssv), v_name, coalesce(v_old_status, 'chưa điểm danh'), p_status,
    v_admin_email, nullif(btrim(coalesce(p_reason, '')), ''), now()
  );

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$function$;
