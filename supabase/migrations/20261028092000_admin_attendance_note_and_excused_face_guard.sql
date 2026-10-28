-- Cho phép Admin sửa riêng ghi chú và ngăn camera ghi đè trạng thái vắng có phép.

create or replace function public.admin_update_attendance_note(
  p_session_id text,
  p_mssv text,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_sid uuid;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  if nullif(btrim(coalesce(p_session_id, '')), '') is null
     or nullif(btrim(coalesce(p_mssv, '')), '') is null then
    return jsonb_build_object('ok', false, 'message', 'Thiếu phiên điểm danh hoặc MSSV.');
  end if;

  select s.id into v_sid
  from public.sessions s
  where s.id::text = btrim(p_session_id);

  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên điểm danh.');
  end if;

  update public.attendance
  set note = v_note
  where session_id = v_sid and mssv = btrim(p_mssv);

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy dòng điểm danh của sinh viên trong phiên này.');
  end if;

  return jsonb_build_object('ok', true, 'note', v_note);
exception when others then
  return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$$;

revoke all on function public.admin_update_attendance_note(text, text, text) from public, anon;
grant execute on function public.admin_update_attendance_note(text, text, text) to authenticated;

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

  select status into v_old_status
  from public.attendance
  where session_id = v_sid and mssv = v_mssv
  for update;

  if v_old_status = 'vắng có phép' then
    return jsonb_build_object(
      'ok', false,
      'code', 'EXCUSED',
      'message', 'Sinh viên đã được ghi nhận vắng có phép. Camera không thay đổi trạng thái này.',
      'status', v_old_status,
      'name', v_name,
      'mssv', v_mssv,
      'session_id', v_sid
    );
  end if;

  if v_old_status in ('có mặt', 'đi muộn') then
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

grant execute on function public.kiosk_record_face_checkin(text, text, text) to authenticated, service_role;
