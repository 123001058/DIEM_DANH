-- Move leave requests from a single attendance session to a Vietnam-local date and period.
alter table public.leave_requests alter column session_id drop not null;
alter table public.leave_requests add column if not exists leave_date date;
alter table public.leave_requests add column if not exists leave_period text;

update public.leave_requests r
set leave_date=coalesce(r.leave_date,(s.started_at at time zone 'Asia/Ho_Chi_Minh')::date,(r.created_at at time zone 'Asia/Ho_Chi_Minh')::date),
    leave_period=coalesce(r.leave_period,case
      when extract(hour from (coalesce(r.starts_at,s.started_at,r.created_at) at time zone 'Asia/Ho_Chi_Minh')) < 12 then 'morning'
      when extract(hour from (coalesce(r.starts_at,s.started_at,r.created_at) at time zone 'Asia/Ho_Chi_Minh')) < 17 then 'afternoon'
      else 'evening' end)
from public.sessions s
where r.session_id=s.id and (r.leave_date is null or r.leave_period is null);

update public.leave_requests r
set leave_date=coalesce(r.leave_date,(r.created_at at time zone 'Asia/Ho_Chi_Minh')::date),
    leave_period=coalesce(r.leave_period,'full_day')
where r.leave_date is null or r.leave_period is null;

alter table public.leave_requests alter column leave_date set not null;
alter table public.leave_requests alter column leave_period set not null;
alter table public.leave_requests add constraint leave_request_period_check
  check (leave_period in ('full_day','morning','afternoon','evening'));
create index if not exists leave_requests_day_period_idx on public.leave_requests(leave_date,leave_period,created_at desc);

-- The request applies to every attendance session overlapping the selected Vietnam-local period.
create or replace function public.leave_request_covers_session(p_date date,p_period text,p_started_at timestamptz,p_duration_min integer)
returns boolean language sql stable
set search_path = public, pg_temp
as $$
  select (p_started_at at time zone 'Asia/Ho_Chi_Minh')::date=p_date
    and (p_period='full_day' or (
      p_started_at < ((p_date + case p_period when 'morning' then time '12:00' when 'afternoon' then time '17:00' else time '23:59:59.999999' end) at time zone 'Asia/Ho_Chi_Minh') + interval '1 microsecond'
      and p_started_at + make_interval(mins => coalesce(p_duration_min,240)) > ((p_date + case p_period when 'morning' then time '00:00' when 'afternoon' then time '12:00' else time '17:00' end) at time zone 'Asia/Ho_Chi_Minh')));
$$;
revoke all on function public.leave_request_covers_session(date,text,timestamptz,integer) from public,anon;

create or replace function public.apply_approved_leave_to_attendance()
returns trigger language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old_status text;
  v_name text;
  v_email text := coalesce(auth.jwt() ->> 'email', 'Admin');
  v_session record;
begin
  select name into v_name from public.students where mssv=new.mssv;

  if old.status='approved' and (new.status<>'approved' or old.leave_date is distinct from new.leave_date or old.leave_period is distinct from new.leave_period) then
    for v_session in select s.id,s.started_at,s.duration_min from public.sessions s
      where public.leave_request_covers_session(old.leave_date,old.leave_period,s.started_at,s.duration_min)
    loop
      if not exists(select 1 from public.leave_requests r where r.id<>new.id and r.mssv=new.mssv and r.status='approved'
        and public.leave_request_covers_session(r.leave_date,r.leave_period,v_session.started_at,v_session.duration_min)) then
        select status into v_old_status from public.attendance where session_id=v_session.id and mssv=new.mssv and category='Xin nghỉ';
        if v_old_status='vắng có phép' then
          update public.attendance set status='vắng không phép',category='Xưởng',note='Đơn xin nghỉ đã được điều chỉnh' where session_id=v_session.id and mssv=new.mssv and category='Xin nghỉ';
          insert into public.attendance_audit_logs(session_id,mssv,student_name,old_status,new_status,changed_by,reason,changed_at)
          values(v_session.id,new.mssv,coalesce(v_name,new.mssv),'vắng có phép','vắng không phép',v_email,'Đơn xin nghỉ đã bị điều chỉnh',now());
        end if;
      end if;
    end loop;
  end if;

  if new.status='approved' and (old.status<>'approved' or old.leave_date is distinct from new.leave_date or old.leave_period is distinct from new.leave_period) then
    for v_session in select s.id,s.started_at,s.duration_min from public.sessions s
      where public.leave_request_covers_session(new.leave_date,new.leave_period,s.started_at,s.duration_min)
    loop
      select status into v_old_status from public.attendance where session_id=v_session.id and mssv=new.mssv;
      if v_old_status is null then
        insert into public.attendance(session_id,mssv,full_name,status,category,note)
        values(v_session.id,new.mssv,coalesce(v_name,new.mssv),'vắng có phép','Xin nghỉ',new.reason)
        on conflict(session_id,mssv) do nothing;
        v_old_status:='chưa điểm danh';
      elsif v_old_status in ('vắng không phép','chưa điểm danh') then
        update public.attendance set status='vắng có phép',category='Xin nghỉ',note=new.reason where session_id=v_session.id and mssv=new.mssv;
      end if;
      if v_old_status in ('chưa điểm danh','vắng không phép') then
        insert into public.attendance_audit_logs(session_id,mssv,student_name,old_status,new_status,changed_by,reason,changed_at)
        values(v_session.id,new.mssv,coalesce(v_name,new.mssv),v_old_status,'vắng có phép',v_email,'Duyệt đơn xin nghỉ: '||new.reason,now());
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists apply_approved_leave_attendance on public.leave_requests;
create trigger apply_approved_leave_attendance after update of status,leave_date,leave_period on public.leave_requests
for each row execute function public.apply_approved_leave_to_attendance();

create or replace function public.admin_close_session(p_session_id text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, auth, pg_temp
as $$
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
        else 'Không có dữ liệu tham gia' end
    from public.students st
    where not exists(select 1 from public.attendance a where a.session_id=v_sid and a.mssv=st.mssv)
    on conflict(session_id,mssv) do nothing;
    update public.sessions set is_open=false where id=v_sid;
  end if;
  update public.sessions set is_open=false where is_open=true;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.admin_close_session(text) from public,anon;
grant execute on function public.admin_close_session(text) to authenticated;
