-- Migration: 20261028170000_sync_external_schedules_with_attendance.sql
-- Mô tả: Khắc phục triệt để tình trạng sinh viên đăng ký LỊCH NGOÀI (student_external_schedules)
--        nhưng hệ thống không đối chiếu khi mở/đóng phiên dẫn đến bị tính "Vắng không phép".
--
-- 1) external_schedule_covers_session: Hàm STABLE kiểm tra xem một lịch ngoài có bao phủ
--    phiên điểm danh hay không (đối chiếu khoảng ngày, thứ trong tuần và giờ bắt đầu/kết thúc).
-- 2) admin_open_session: Tự động ghi nhận 'vắng có phép', category 'Lịch ngoài' khi mở phiên.
-- 3) admin_close_session: Khi đóng phiên, đối chiếu thêm lịch ngoài trước khi đánh vắng không phép.
-- 4) Trigger reconcile_ext_schedule_attendance_after_change: Tự động đối chiếu các phiên trong vòng
--    7 ngày gần nhất khi sinh viên tạo hoặc cập nhật lịch ngoài.
-- 5) Cập nhật chuẩn hóa dữ liệu phiên tối 27/10 cho sinh viên có lịch ngoài trùng giờ.

-- =====================================================================
-- 1. Hàm kiểm tra Lịch ngoài bao phủ phiên điểm danh
-- =====================================================================
CREATE OR REPLACE FUNCTION public.external_schedule_covers_session(
  p_start_date date,
  p_end_date date,
  p_days_of_week integer[],
  p_start_time time,
  p_end_time time,
  p_started_at timestamp with time zone,
  p_duration_min integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  select (p_started_at at time zone 'Asia/Ho_Chi_Minh')::date between p_start_date and p_end_date
    and (case extract(isodow from (p_started_at at time zone 'Asia/Ho_Chi_Minh')::date)::int when 7 then 8 else extract(isodow from (p_started_at at time zone 'Asia/Ho_Chi_Minh')::date)::int + 1 end) = any(p_days_of_week)
    and p_started_at < (((p_started_at at time zone 'Asia/Ho_Chi_Minh')::date + p_end_time) at time zone 'Asia/Ho_Chi_Minh')
    and (p_started_at + make_interval(mins => coalesce(p_duration_min, 240))) > (((p_started_at at time zone 'Asia/Ho_Chi_Minh')::date + p_start_time) at time zone 'Asia/Ho_Chi_Minh');
$function$;

-- =====================================================================
-- 2. Cập nhật admin_open_session (ghi nhận Lịch ngoài khi mở phiên)
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

  -- 1. Tự động ghi nhận vắng có phép: Học trường (trùng lịch học trường ME)
  insert into public.attendance(session_id, mssv, full_name, status, category, note)
  select distinct on(st.mssv) v_new_id, st.mssv, st.name, 'vắng có phép', 'Học trường',
    'Lịch học: ' || sch.subject_name || coalesce(' (' || sch.room_name || ')', '')
  from public.students st
  join public.student_schedules sch on sch.mssv = st.mssv
  where sch.start_time < v_end and sch.end_time > v_start
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
end $function$;

-- =====================================================================
-- 3. Cập nhật admin_close_session (đối chiếu Lịch ngoài khi đánh vắng)
-- =====================================================================
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
          and sch.start_time < v_end and sch.end_time > v_start) then 'vắng có phép'
        when exists(select 1 from public.student_external_schedules ext where ext.mssv=st.mssv
          and public.external_schedule_covers_session(ext.start_date,ext.end_date,ext.days_of_week,ext.start_time,ext.end_time,v_session.started_at,v_session.duration_min)) then 'vắng có phép'
        else 'vắng không phép' end,
      case
        when exists(select 1 from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
          and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min)) then 'Xin nghỉ'
        when exists(select 1 from public.student_schedules sch where sch.mssv=st.mssv
          and sch.start_time < v_end and sch.end_time > v_start) then 'Học trường'
        when exists(select 1 from public.student_external_schedules ext where ext.mssv=st.mssv
          and public.external_schedule_covers_session(ext.start_date,ext.end_date,ext.days_of_week,ext.start_time,ext.end_time,v_session.started_at,v_session.duration_min)) then 'Lịch ngoài'
        else 'Xưởng' end,
      case
        when exists(select 1 from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
          and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min))
          then (select string_agg(r.reason,'; ') from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
            and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min))
        when exists(select 1 from public.student_schedules sch where sch.mssv=st.mssv
          and sch.start_time < v_end and sch.end_time > v_start)
          then (select 'Lịch học: ' || sch.subject_name || coalesce(' (' || sch.room_name || ')','')
            from public.student_schedules sch where sch.mssv=st.mssv
            and sch.start_time < v_end and sch.end_time > v_start
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

-- =====================================================================
-- 4. Trigger rà soát điểm danh sau khi sinh viên thêm/sửa Lịch ngoài
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reconcile_external_schedule_with_attendance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  with flipped as (
    update public.attendance a
    set status = 'vắng có phép',
        category = 'Lịch ngoài',
        note = 'Lịch ngoài: ' || new.subject_name || coalesce(' (' || new.room_name || ')', '')
    from public.sessions s
    where a.session_id = s.id
      and a.mssv = new.mssv
      and a.status = 'vắng không phép'
      and a.category = 'Xưởng'
      and public.external_schedule_covers_session(
        new.start_date, new.end_date, new.days_of_week, new.start_time, new.end_time, s.started_at, s.duration_min
      )
      and (s.started_at at time zone 'Asia/Ho_Chi_Minh')::date >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 7)
    returning a.session_id, a.mssv, a.full_name
  )
  insert into public.attendance_audit_logs
    (session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at)
  select f.session_id, f.mssv, f.full_name, 'vắng không phép', 'vắng có phép',
         'Hệ thống (Lịch ngoài)',
         'Tự động đối chiếu lịch học ngoài: ' || new.subject_name || coalesce(' (' || new.room_name || ')', ''),
         now()
  from flipped f;
  return new;
end;
$function$;

drop trigger if exists reconcile_ext_schedule_attendance_after_change on public.student_external_schedules;
create trigger reconcile_ext_schedule_attendance_after_change
after insert or update on public.student_external_schedules
for each row execute function public.reconcile_external_schedule_with_attendance();

revoke all on function public.reconcile_external_schedule_with_attendance() from public, anon, authenticated;

-- =====================================================================
-- 5. Rà soát chuẩn hóa các phiên điểm danh 7 ngày qua cho lịch ngoài
-- =====================================================================
update public.attendance a
set status = 'vắng có phép',
    category = 'Lịch ngoài',
    note = 'Lịch ngoài: ' || ext.subject_name || coalesce(' (' || ext.room_name || ')', '')
from public.sessions s
join public.student_external_schedules ext on true
where a.session_id = s.id
  and a.mssv = ext.mssv
  and (
    (a.status = 'vắng không phép' and a.category = 'Xưởng')
    or (a.mssv = '124000737' and s.id = '5907a2ba-b5fe-4539-b7fa-280183418a03' and a.category = 'Admin')
  )
  and public.external_schedule_covers_session(
    ext.start_date, ext.end_date, ext.days_of_week, ext.start_time, ext.end_time, s.started_at, s.duration_min
  )
  and (s.started_at at time zone 'Asia/Ho_Chi_Minh')::date >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 7);

