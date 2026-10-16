-- Migration: Làm sạch các ghi chú rác (ESP32, Không có dữ liệu tham gia),
-- chuẩn hóa ghi chú độc lập với cột lịch học và chuyển trạng thái về Admin.

-- 1. Làm sạch các dữ liệu rác trong bảng attendance
UPDATE public.attendance
SET note = ''
WHERE note = 'Không có dữ liệu tham gia'
   OR note = 'Camera ESP32 điểm danh AI'
   OR note ILIKE 'Camera ESP32%';

UPDATE public.attendance
SET category = 'Admin'
WHERE category = 'Khuôn mặt';

-- 2. Cập nhật admin_close_session để không chèn chuỗi 'Không có dữ liệu tham gia' vào cột note
CREATE OR REPLACE FUNCTION public.admin_close_session(p_session_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare v_sid uuid; v_session public.sessions%rowtype;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
  if p_session_id is not null and btrim(p_session_id)<>'' then
    select * into v_session from public.sessions where id::text=btrim(p_session_id);
  else
    select * into v_session from public.sessions where is_open=true limit 1;
  end if;
  v_sid:=v_session.id;
  if v_sid is not null then
    insert into public.attendance(session_id,mssv,full_name,status,category,note)
    select v_sid,st.mssv,st.name,
      case when exists(select 1 from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
        and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min)) then 'vắng có phép' else 'vắng không phép' end,
      case when exists(select 1 from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
        and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min)) then 'Xin nghỉ' else 'Xưởng' end,
      case when exists(select 1 from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
        and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min))
        then (select string_agg(r.reason,'; ') from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
          and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min))
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

-- 3. Cập nhật admin_set_status loại bỏ category Khuôn mặt và dọn note rác
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
  v_final_note text;
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
  v_final_note := nullif(btrim(coalesce(p_reason, '')), '');

  insert into public.attendance (session_id, mssv, full_name, status, category, note, created_at)
  values (v_sid, btrim(p_mssv), v_name, p_status, v_category, coalesce(v_final_note, ''), now())
  on conflict (session_id, mssv) do update set
    status = excluded.status,
    category = excluded.category,
    created_at = now(),
    note = case
      when v_final_note is not null then v_final_note
      when public.attendance.note in ('Không có dữ liệu tham gia', 'Camera ESP32 điểm danh AI') or public.attendance.note ilike 'Camera ESP32%' then ''
      else public.attendance.note
    end;

  insert into public.attendance_audit_logs (
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  ) values (
    v_sid, btrim(p_mssv), v_name, coalesce(v_old_status, 'chưa điểm danh'), p_status,
    v_admin_email, v_final_note, now()
  );

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$function$;
