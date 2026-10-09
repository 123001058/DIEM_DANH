-- Prepare tomorrow's three-part availability report at 20:00 Vietnam time.
-- This only generates/stores the report; it does not send anything to Zalo.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.zalo_schedule_previews (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  status text not null check (status in ('ready','error')),
  member_count integer not null default 0 check (member_count >= 0),
  periods jsonb not null default '{}'::jsonb,
  error_message text,
  generated_at timestamptz not null default now()
);
create index if not exists zalo_schedule_previews_date_idx
  on public.zalo_schedule_previews (target_date, generated_at desc);
alter table public.zalo_schedule_previews enable row level security;
drop policy if exists zalo_schedule_previews_admin_read on public.zalo_schedule_previews;
create policy zalo_schedule_previews_admin_read on public.zalo_schedule_previews
  for select to authenticated using (public.is_admin());
revoke all on public.zalo_schedule_previews from public, anon;
grant select on public.zalo_schedule_previews to authenticated;
grant select, insert on public.zalo_schedule_previews to service_role;

-- Only the database scheduler and the server-side Edge Function can read this secret.
create table if not exists public.zalo_schedule_job_secret (
  id boolean primary key default true check (id),
  secret text not null
);
insert into public.zalo_schedule_job_secret(id,secret)
values (true, encode(extensions.gen_random_bytes(32),'hex'))
on conflict (id) do nothing;
alter table public.zalo_schedule_job_secret enable row level security;
revoke all on public.zalo_schedule_job_secret from public, anon, authenticated;
grant select on public.zalo_schedule_job_secret to service_role;

-- Atomic date-scoped replacement for the server job. The function is callable only
-- with the Supabase service role key held inside the Edge Function.
create or replace function public.server_replace_student_schedules_for_date(p_schedules jsonb, p_date date)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare v_count int;
begin
  if p_date is null or p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    raise exception 'Ngày hoặc danh sách lịch không hợp lệ.';
  end if;

  delete from public.student_schedules
  where (start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week
  )
  select x.mssv, x.subject_name, x.room_name, x.teacher_name, x.start_time, x.end_time, x.day_of_week
  from jsonb_to_recordset(p_schedules) as x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int
  )
  where (x.start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok',true,'count',v_count,'date',p_date);
end;
$$;
revoke all on function public.server_replace_student_schedules_for_date(jsonb,date) from public, anon, authenticated;
grant execute on function public.server_replace_student_schedules_for_date(jsonb,date) to service_role;

create or replace function public.admin_get_zalo_schedule_preview(p_date date)
returns jsonb language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $$
declare v_preview jsonb; v_attempt jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
  select to_jsonb(p) into v_preview from public.zalo_schedule_previews p
  where p.target_date=p_date and p.status='ready' order by p.generated_at desc limit 1;
  select to_jsonb(p) into v_attempt from public.zalo_schedule_previews p
  where p.target_date=p_date order by p.generated_at desc limit 1;
  return jsonb_build_object('ok',true,'preview',v_preview,'last_attempt',v_attempt);
end;
$$;
revoke all on function public.admin_get_zalo_schedule_preview(date) from public, anon;
grant execute on function public.admin_get_zalo_schedule_preview(date) to authenticated;

create or replace function public.admin_save_zalo_schedule_preview(p_date date,p_member_count integer,p_periods jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, auth, pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
  if p_date is null or p_member_count < 0 or jsonb_typeof(p_periods) <> 'object' then
    return jsonb_build_object('ok',false,'message','Dữ liệu lịch không hợp lệ.');
  end if;
  insert into public.zalo_schedule_previews(target_date,status,member_count,periods)
  values(p_date,'ready',p_member_count,p_periods) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;
revoke all on function public.admin_save_zalo_schedule_preview(date,integer,jsonb) from public, anon;
grant execute on function public.admin_save_zalo_schedule_preview(date,integer,jsonb) to authenticated;

-- Supabase Cron runs in UTC: 13:00 UTC is 20:00 in Asia/Ho_Chi_Minh.
-- The publishable key is intentionally public; a separate random secret protects this endpoint.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname='zalo-schedule-preparation-daily';
  perform cron.schedule(
    'zalo-schedule-preparation-daily',
    '0 13 * * *',
    $job$
      select net.http_post(
        url := 'https://nhjkpknhybenkxwadvzv.supabase.co/functions/v1/prepare-zalo-schedule',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey','sb_publishable_h1nRwciz_rOgnD88ZCnkIw_v0Czf1L8',
          'x-cron-secret',(select secret from public.zalo_schedule_job_secret where id=true)
        ),
        body := jsonb_build_object('source','cron')
      );
    $job$
  );
end;
$$;
