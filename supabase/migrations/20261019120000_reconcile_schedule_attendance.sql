-- Migration: 20261019120000_reconcile_schedule_attendance.sql
-- Mô tả: Khắc phục tình trạng sinh viên CÓ LỊCH HỌC TRƯỜNG nhưng vẫn bị tính "Vắng không phép"
--        khi lịch học ME được đồng bộ SAU lúc phiên điểm danh mở/đóng (sự cố phiên "Sáng 19/10").
--
-- 1) admin_close_session: khi đánh vắng sinh viên chưa quét, kiểm tra thêm LỊCH HỌC TRƯỜNG
--    trùng khoảng thời gian phiên -> ghi "vắng có phép" (Học trường) thay vì "vắng không phép" (Xưởng).
-- 2) Trigger trên student_schedules: mỗi khi lịch học trường được đồng bộ (INSERT) - kể cả sau khi
--    phiên đã đóng - tự rà soát các phiên điểm danh trong vòng 7 ngày gần nhất có khung giờ trùng,
--    chuyển hồ sơ "vắng không phép" (Xưởng, do hệ thống đóng phiên tạo) sang "vắng có phép" (Học trường).
--    Không đụng tới các bản ghi do admin tích chọn thủ công (category 'Admin'/'Admin Batch')
--    và không đụng tới sinh viên đã quét (có mặt/đi muộn).

-- =====================================================================
-- 1. Hàm trigger: đối chiếu lịch học mới với điểm danh các phiên trùng giờ
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reconcile_schedule_with_attendance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  with flipped as (
    update public.attendance a
    set status = 'vắng có phép',
        category = 'Học trường',
        note = 'Lịch học: ' || new.subject_name || coalesce(' (' || new.room_name || ')', '')
    from public.sessions s
    where a.session_id = s.id
      and a.mssv = new.mssv
      and a.status = 'vắng không phép'
      and a.category = 'Xưởng'
      and new.start_time < s.started_at + (coalesce(s.duration_min, 240) * interval '1 minute')
      and new.end_time > s.started_at
      and (s.started_at at time zone 'Asia/Ho_Chi_Minh')::date >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 7)
    returning a.session_id, a.mssv, a.full_name
  )
  insert into public.attendance_audit_logs
    (session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at)
  select f.session_id, f.mssv, f.full_name, 'vắng không phép', 'vắng có phép',
         'Hệ thống (đồng bộ lịch ME)',
         'Tự động đối chiếu lịch học trường sau đồng bộ: ' || new.subject_name || coalesce(' (' || new.room_name || ')', ''),
         now()
  from flipped f;
  return new;
end;
$function$;

drop trigger if exists reconcile_schedule_attendance_after_insert on public.student_schedules;
create trigger reconcile_schedule_attendance_after_insert
after insert on public.student_schedules
for each row execute function public.reconcile_schedule_with_attendance();

-- Chỉ dùng nội bộ (được gọi bởi trigger), không cho gọi RPC trực tiếp từ client.
revoke all on function public.reconcile_schedule_with_attendance() from public, anon, authenticated;

-- =====================================================================
-- 2. admin_close_session: kiểm tra thêm lịch học trường khi đánh vắng
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
        else 'vắng không phép' end,
      case
        when exists(select 1 from public.leave_requests r where r.mssv=st.mssv and r.status='approved'
          and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min)) then 'Xin nghỉ'
        when exists(select 1 from public.student_schedules sch where sch.mssv=st.mssv
          and sch.start_time < v_end and sch.end_time > v_start) then 'Học trường'
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
