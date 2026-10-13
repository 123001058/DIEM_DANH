-- Student leave requests, in-app notifications, evidence uploads, and history.

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  requested_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mssv text not null references public.students(mssv) on delete cascade,
  leave_type text not null check (leave_type in ('full_session','late','early','partial')),
  starts_at timestamptz,
  ends_at timestamptz,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  evidence_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewer_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_request_range_check check (
    (leave_type = 'full_session' and starts_at is null and ends_at is null)
    or (leave_type <> 'full_session' and starts_at is not null and ends_at is not null and ends_at > starts_at)
  )
);

create index if not exists leave_requests_session_idx on public.leave_requests(session_id, created_at desc);
create index if not exists leave_requests_owner_idx on public.leave_requests(requested_by, created_at desc);
create index if not exists leave_requests_status_idx on public.leave_requests(status, created_at desc);

create table if not exists public.leave_request_history (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  old_record jsonb,
  new_record jsonb not null,
  changed_at timestamptz not null default now()
);
create index if not exists leave_request_history_request_idx on public.leave_request_history(leave_request_id, changed_at desc);

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  leave_request_id uuid references public.leave_requests(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists in_app_notifications_user_idx on public.in_app_notifications(user_id, created_at desc);

alter table public.leave_requests enable row level security;
alter table public.leave_request_history enable row level security;
alter table public.in_app_notifications enable row level security;

drop policy if exists leave_requests_read on public.leave_requests;
create policy leave_requests_read on public.leave_requests for select to authenticated
  using (true);
drop policy if exists leave_requests_submit on public.leave_requests;
create policy leave_requests_submit on public.leave_requests for insert to authenticated
  with check (requested_by = auth.uid() and mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid()));
drop policy if exists leave_requests_update on public.leave_requests;
create policy leave_requests_update on public.leave_requests for update to authenticated
  using ((requested_by = auth.uid() and status = 'pending') or public.is_admin())
  with check (public.is_admin() or (requested_by = auth.uid() and status in ('pending','cancelled')));

drop policy if exists leave_request_history_read on public.leave_request_history;
create policy leave_request_history_read on public.leave_request_history for select to authenticated
  using (true);
drop policy if exists in_app_notifications_read on public.in_app_notifications;
create policy in_app_notifications_read on public.in_app_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists in_app_notifications_update on public.in_app_notifications;
create policy in_app_notifications_update on public.in_app_notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.leave_requests to authenticated;
grant select on public.leave_request_history to authenticated;
grant select on public.in_app_notifications to authenticated;
revoke update on public.in_app_notifications from authenticated;
grant update (is_read) on public.in_app_notifications to authenticated;

create or replace function public.capture_leave_request_changes()
returns trigger language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_session_start timestamptz; v_session_duration int; v_uid uuid := auth.uid();
begin
  if new.leave_type <> 'full_session' then
    select started_at,duration_min into v_session_start,v_session_duration from public.sessions where id=new.session_id;
    if not found or new.starts_at < v_session_start or (v_session_duration is not null and new.ends_at > v_session_start + (v_session_duration * interval '1 minute')) then
      raise exception 'Khoảng giờ phải nằm trong phiên điểm danh đã chọn.';
    end if;
  end if;
  if tg_op = 'INSERT' then return new; end if;
  new.updated_at := now();
  if new.status in ('approved','rejected') and old.status is distinct from new.status then
    if not public.is_admin() then
      raise exception 'Chỉ quản trị viên mới được duyệt hoặc từ chối đơn.';
    end if;
    if new.requested_by = v_uid then
      raise exception 'Bạn không thể tự duyệt đơn xin nghỉ của mình.';
    end if;
    new.reviewed_by := v_uid;
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists leave_request_changes on public.leave_requests;
create trigger leave_request_changes before insert or update on public.leave_requests
for each row execute function public.capture_leave_request_changes();

create or replace function public.record_leave_request_event()
returns trigger language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_name text;
begin
  insert into public.leave_request_history(leave_request_id, changed_by, old_record, new_record)
  values (new.id, auth.uid(), case when tg_op='INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  if tg_op='INSERT' then
    select coalesce(nullif(btrim(p.full_name), ''), new.mssv) into v_name
      from public.profiles p where p.user_id = new.requested_by;
    insert into public.in_app_notifications(user_id,title,message,leave_request_id)
    values(new.requested_by,'Đã nhận đơn xin nghỉ','Đơn của bạn đã được gửi và đang chờ duyệt.',new.id);
    insert into public.in_app_notifications(user_id,title,message,leave_request_id)
    select p.user_id,'Có đơn xin nghỉ mới',coalesce(v_name,new.mssv) || ' vừa gửi đơn xin nghỉ.',new.id
      from public.profiles p join public.admin_mssv a on a.mssv=p.mssv where p.user_id<>new.requested_by;
  elsif old.status is distinct from new.status then
    insert into public.in_app_notifications(user_id,title,message,leave_request_id)
    values (new.requested_by,
      case new.status when 'approved' then 'Đơn xin nghỉ đã được duyệt' when 'rejected' then 'Đơn xin nghỉ chưa được duyệt'
        when 'cancelled' then 'Đơn xin nghỉ đã được hủy' else 'Đơn xin nghỉ đã cập nhật' end,
      case new.status when 'approved' then 'Đơn xin nghỉ của bạn đã được duyệt.' when 'rejected' then 'Đơn xin nghỉ của bạn chưa được duyệt.'
        when 'cancelled' then 'Đơn xin nghỉ đã được hủy.' else 'Trạng thái đơn xin nghỉ đã thay đổi.' end
        || coalesce(' Ghi chú: ' || nullif(btrim(new.reviewer_note), ''), ''),new.id);
    if new.status='cancelled' then
      select coalesce(nullif(btrim(p.full_name), ''),new.mssv) into v_name from public.profiles p where p.user_id=new.requested_by;
      insert into public.in_app_notifications(user_id,title,message,leave_request_id)
      select p.user_id,'Đơn xin nghỉ đã bị hủy',coalesce(v_name,new.mssv) || ' đã hủy đơn xin nghỉ.',new.id
        from public.profiles p join public.admin_mssv a on a.mssv=p.mssv where p.user_id<>new.requested_by;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists record_leave_request_event on public.leave_requests;
create trigger record_leave_request_event after insert or update on public.leave_requests
for each row execute function public.record_leave_request_event();

create or replace function public.apply_approved_leave_to_attendance()
returns trigger language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_old_status text;
  v_name text;
  v_email text := coalesce(auth.jwt() ->> 'email', 'Admin');
begin
  select name into v_name from public.students where mssv = new.mssv;
  if new.status = 'approved' and old.status <> 'approved' then
  select status into v_old_status from public.attendance where session_id = new.session_id and mssv = new.mssv;
  if v_old_status is null then
    insert into public.attendance(session_id, mssv, full_name, status, category, note)
    values (new.session_id, new.mssv, coalesce(v_name,new.mssv), 'vắng có phép', 'Xin nghỉ', new.reason)
    on conflict (session_id,mssv) do nothing;
    v_old_status := 'chưa điểm danh';
  elsif v_old_status = 'vắng không phép' then
    update public.attendance set status='vắng có phép', category='Xin nghỉ', note=new.reason
    where session_id=new.session_id and mssv=new.mssv;
  end if;

  if v_old_status in ('chưa điểm danh','vắng không phép') then
    insert into public.attendance_audit_logs(session_id,mssv,student_name,old_status,new_status,changed_by,reason,changed_at)
    values (new.session_id,new.mssv,coalesce(v_name,new.mssv),v_old_status,'vắng có phép',v_email,
      'Duyệt đơn xin nghỉ: ' || new.reason,now());
  end if;
  elsif old.status = 'approved' and new.status <> 'approved' then
    if not exists(select 1 from public.leave_requests r where r.id<>new.id and r.session_id=new.session_id and r.mssv=new.mssv and r.status='approved') then
      select status into v_old_status from public.attendance where session_id=new.session_id and mssv=new.mssv and category='Xin nghỉ';
      if v_old_status='vắng có phép' then
        update public.attendance set status='vắng không phép',category='Xưởng',note='Đơn xin nghỉ đã được điều chỉnh' where session_id=new.session_id and mssv=new.mssv and category='Xin nghỉ';
        insert into public.attendance_audit_logs(session_id,mssv,student_name,old_status,new_status,changed_by,reason,changed_at)
        values(new.session_id,new.mssv,coalesce(v_name,new.mssv),'vắng có phép','vắng không phép',v_email,'Đơn xin nghỉ đã bị điều chỉnh',now());
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists apply_approved_leave_attendance on public.leave_requests;
create trigger apply_approved_leave_attendance after update of status on public.leave_requests
for each row execute function public.apply_approved_leave_to_attendance();

create or replace function public.get_leave_sessions()
returns jsonb language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'message','Vui lòng đăng nhập.'); end if;
  return jsonb_build_object('ok',true,'sessions',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'session_name',s.session_name,'started_at',s.started_at,'duration_min',s.duration_min,'is_open',s.is_open
    ) order by s.started_at desc) from public.sessions s
  ),'[]'::jsonb));
end;
$$;
revoke all on function public.get_leave_sessions() from public, anon;
grant execute on function public.get_leave_sessions() to authenticated;

create or replace function public.admin_close_session(p_session_id text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, auth, pg_temp
as $$
declare v_sid uuid;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
  if p_session_id is not null and btrim(p_session_id) <> '' then
    select id into v_sid from public.sessions where id::text=btrim(p_session_id);
  else
    select id into v_sid from public.sessions where is_open=true limit 1;
  end if;
  if v_sid is not null then
    insert into public.attendance(session_id,mssv,full_name,status,category,note)
    select v_sid,st.mssv,st.name,
      case when exists(select 1 from public.leave_requests r where r.session_id=v_sid and r.mssv=st.mssv and r.status='approved')
        then 'vắng có phép' else 'vắng không phép' end,
      case when exists(select 1 from public.leave_requests r where r.session_id=v_sid and r.mssv=st.mssv and r.status='approved')
        then 'Xin nghỉ' else 'Xưởng' end,
      case when exists(select 1 from public.leave_requests r where r.session_id=v_sid and r.mssv=st.mssv and r.status='approved')
        then (select string_agg(r.reason, '; ') from public.leave_requests r where r.session_id=v_sid and r.mssv=st.mssv and r.status='approved')
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
revoke all on function public.admin_close_session(text) from public, anon;
grant execute on function public.admin_close_session(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('leave-evidence','leave-evidence',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists leave_evidence_upload on storage.objects;
create policy leave_evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id='leave-evidence' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists leave_evidence_owner_read on storage.objects;
drop policy if exists leave_evidence_read on storage.objects;
create policy leave_evidence_read on storage.objects for select to authenticated
  using (bucket_id='leave-evidence');
drop policy if exists leave_evidence_owner_update on storage.objects;
create policy leave_evidence_owner_update on storage.objects for update to authenticated
  using (bucket_id='leave-evidence' and (storage.foldername(name))[1]=auth.uid()::text)
  with check (bucket_id='leave-evidence' and (storage.foldername(name))[1]=auth.uid()::text);
