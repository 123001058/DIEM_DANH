-- Persistent tasks, anonymous feedback, and Zalo schedule settings.
create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  description text not null default '',
  scope text not null check (scope in ('group','personal')),
  team_id uuid not null references public.team_groups(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  priority text not null default 'med' check (priority in ('low','med','high')),
  due_date date,
  created_at timestamptz not null default now()
);
create table if not exists public.team_task_assignments (
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  mssv text not null references public.students(mssv) on delete cascade,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  read_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (task_id,mssv)
);
alter table public.team_tasks enable row level security;
alter table public.team_task_assignments enable row level security;
drop policy if exists task_read_policy on public.team_tasks;
create policy task_read_policy on public.team_tasks for select to authenticated using (
  public.is_admin() or exists(select 1 from public.team_groups g join public.team_group_members m on m.team_id=g.id where g.id=public.team_tasks.team_id and m.mssv=(select p.mssv from public.profiles p where p.user_id=auth.uid()))
);
drop policy if exists task_assignment_read_policy on public.team_task_assignments;
create policy task_assignment_read_policy on public.team_task_assignments for select to authenticated using (
  public.is_admin() or mssv=(select p.mssv from public.profiles p where p.user_id=auth.uid())
);
grant select on public.team_tasks,public.team_task_assignments to authenticated;

create or replace function public.create_team_task(p_title text,p_description text,p_scope text,p_team_id uuid,p_assignee_mssv text,p_priority text,p_due_date date)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_mssv text; v_id uuid;
begin
  select mssv into v_mssv from public.profiles where user_id=auth.uid();
  if not public.is_admin() and not exists(select 1 from public.team_groups where id=p_team_id and leader_mssv=v_mssv) then return jsonb_build_object('ok',false,'message','Chỉ quản trị viên hoặc đội trưởng mới được giao nhiệm vụ cho nhóm này.'); end if;
  if p_scope not in ('group','personal') or p_priority not in ('low','med','high') or length(btrim(coalesce(p_title,'')))=0 then return jsonb_build_object('ok',false,'message','Thông tin nhiệm vụ không hợp lệ.'); end if;
  if p_scope='personal' and not exists(select 1 from public.team_group_members where team_id=p_team_id and mssv=p_assignee_mssv) then return jsonb_build_object('ok',false,'message','Sinh viên được giao chưa thuộc nhóm.'); end if;
  insert into public.team_tasks(title,description,scope,team_id,priority,due_date) values(btrim(p_title),coalesce(p_description,''),p_scope,p_team_id,p_priority,p_due_date) returning id into v_id;
  if p_scope='group' then insert into public.team_task_assignments(task_id,mssv) select v_id,mssv from public.team_group_members where team_id=p_team_id;
  else insert into public.team_task_assignments(task_id,mssv) values(v_id,p_assignee_mssv); end if;
  return jsonb_build_object('ok',true,'id',v_id);
end; $$;
revoke all on function public.create_team_task(text,text,text,uuid,text,text,date) from public,anon;
grant execute on function public.create_team_task(text,text,text,uuid,text,text,date) to authenticated;

create or replace function public.get_my_tasks()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ declare v_mssv text; begin
 select mssv into v_mssv from public.profiles where user_id=auth.uid();
 if v_mssv is null then return jsonb_build_object('ok',false,'message','Tài khoản chưa liên kết MSSV.'); end if;
 return jsonb_build_object('ok',true,'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'scope',t.scope,'team_id',t.team_id,'team_name',g.name,'field',g.field,'priority',t.priority,'due_date',t.due_date,'status',a.status,'read_at',a.read_at,'created_at',t.created_at) order by t.created_at desc) from public.team_task_assignments a join public.team_tasks t on t.id=a.task_id join public.team_groups g on g.id=t.team_id where a.mssv=v_mssv),'[]'::jsonb), 'managed_teams',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'field',field)) from public.team_groups where leader_mssv=v_mssv),'[]'::jsonb));
end; $$;
revoke all on function public.get_my_tasks() from public,anon; grant execute on function public.get_my_tasks() to authenticated;

create or replace function public.admin_get_team_tasks(p_team_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ declare v_mssv text; begin
 select mssv into v_mssv from public.profiles where user_id=auth.uid();
 if not public.is_admin() and not exists(select 1 from public.team_groups where id=p_team_id and leader_mssv=v_mssv) then return jsonb_build_object('ok',false,'message','Không có quyền xem nhiệm vụ nhóm này.'); end if;
 return jsonb_build_object('ok',true,'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'scope',t.scope,'team_id',t.team_id,'team_name',g.name,'priority',t.priority,'due_date',t.due_date,'created_at',t.created_at,'assignees',(select coalesce(jsonb_agg(jsonb_build_object('mssv',a.mssv,'name',s.name,'status',a.status,'read_at',a.read_at) order by s.name),'[]'::jsonb) from public.team_task_assignments a join public.students s on s.mssv=a.mssv where a.task_id=t.id)) order by t.created_at desc) from public.team_tasks t join public.team_groups g on g.id=t.team_id where p_team_id is null or t.team_id=p_team_id),'[]'::jsonb));
end; $$;
revoke all on function public.admin_get_team_tasks(uuid) from public,anon; grant execute on function public.admin_get_team_tasks(uuid) to authenticated;

create or replace function public.update_my_task(p_task_id uuid,p_status text default null,p_mark_read boolean default false)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$ declare v_mssv text; begin
 select mssv into v_mssv from public.profiles where user_id=auth.uid();
 if p_status is not null and p_status not in ('todo','doing','done') then return jsonb_build_object('ok',false,'message','Trạng thái không hợp lệ.'); end if;
 update public.team_task_assignments set status=coalesce(p_status,status),read_at=case when p_mark_read then coalesce(read_at,now()) else read_at end,updated_at=now() where task_id=p_task_id and mssv=v_mssv;
 if not found then return jsonb_build_object('ok',false,'message','Không tìm thấy nhiệm vụ của bạn.'); end if;
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.update_my_task(uuid,text,boolean) from public,anon; grant execute on function public.update_my_task(uuid,text,boolean) to authenticated;

-- Anonymous by design: no sender, profile, IP, or device field is stored.
create table if not exists public.anonymous_feedback(
 id uuid primary key default gen_random_uuid(), public_code text not null unique default ('FB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 feedback_type text not null check(feedback_type in ('gopy','suco','muasam','khac')), content text not null check(length(btrim(content)) between 1 and 5000),
 status text not null default 'new' check(status in ('new','seen','resolved')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.anonymous_feedback enable row level security;
drop policy if exists admin_feedback_read on public.anonymous_feedback;
create policy admin_feedback_read on public.anonymous_feedback for select to authenticated using(public.is_admin());
grant select on public.anonymous_feedback to authenticated;
create or replace function public.submit_anonymous_feedback(p_type text,p_content text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$ declare v_code text; begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'message','Vui lòng đăng nhập để gửi phản hồi.'); end if;
 if p_type not in ('gopy','suco','muasam','khac') or length(btrim(coalesce(p_content,''))) not between 1 and 5000 then return jsonb_build_object('ok',false,'message','Nội dung phản hồi không hợp lệ.'); end if;
 insert into public.anonymous_feedback(feedback_type,content) values(p_type,btrim(p_content)) returning public_code into v_code;
 return jsonb_build_object('ok',true,'code',v_code);
end; $$;
revoke all on function public.submit_anonymous_feedback(text,text) from public,anon; grant execute on function public.submit_anonymous_feedback(text,text) to authenticated;
create or replace function public.admin_get_anonymous_feedback()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',public_code,'type',feedback_type,'content',content,'status',status,'created_at',created_at) order by created_at desc) from public.anonymous_feedback),'[]'::jsonb));
end; $$;
revoke all on function public.admin_get_anonymous_feedback() from public,anon; grant execute on function public.admin_get_anonymous_feedback() to authenticated;
create or replace function public.admin_update_anonymous_feedback(p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() or p_status not in ('seen','resolved') then return jsonb_build_object('ok',false,'message','Không có quyền hoặc trạng thái không hợp lệ.'); end if;
 update public.anonymous_feedback set status=p_status,updated_at=now() where id=p_id;
 return jsonb_build_object('ok',found);
end; $$;
revoke all on function public.admin_update_anonymous_feedback(uuid,text) from public,anon; grant execute on function public.admin_update_anonymous_feedback(uuid,text) to authenticated;

create table if not exists public.zalo_schedule_settings(
 id boolean primary key default true check(id), auto_enabled boolean not null default false, send_time time not null default '20:00', group_id text not null default '', group_label text not null default '', updated_at timestamptz not null default now()
);
insert into public.zalo_schedule_settings(id) values(true) on conflict(id) do nothing;
alter table public.zalo_schedule_settings enable row level security;
create table if not exists public.zalo_schedule_logs(
 id uuid primary key default gen_random_uuid(), run_date date not null, trigger_type text not null default 'scheduled', status text not null, group_label text, free_count integer not null default 0, busy_count integer not null default 0, message text, error text, sent_at timestamptz not null default now()
);
alter table public.zalo_schedule_logs enable row level security;
drop policy if exists admin_read_zalo_logs on public.zalo_schedule_logs;
create policy admin_read_zalo_logs on public.zalo_schedule_logs for select to authenticated using(public.is_admin());
grant select on public.zalo_schedule_logs to authenticated;
create or replace function public.admin_get_zalo_settings()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'settings',(select to_jsonb(s) from public.zalo_schedule_settings s where id=true));
end; $$;
revoke all on function public.admin_get_zalo_settings() from public,anon; grant execute on function public.admin_get_zalo_settings() to authenticated;
create or replace function public.admin_save_zalo_settings(p_enabled boolean,p_send_time time,p_group_id text,p_group_label text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 if p_enabled and length(btrim(coalesce(p_group_id,'')))=0 then return jsonb_build_object('ok',false,'message','Cần nhập Zalo group ID trước khi bật gửi tự động.'); end if;
 update public.zalo_schedule_settings set auto_enabled=p_enabled,send_time=p_send_time,group_id=btrim(coalesce(p_group_id,'')),group_label=btrim(coalesce(p_group_label,'')),updated_at=now() where id=true;
 return jsonb_build_object('ok',true,'schedule_ready',false,'message','Đã lưu. Cần cấu hình Supabase Cron và bí mật máy chủ để bật lịch gửi tự động.');
end; $$;
revoke all on function public.admin_save_zalo_settings(boolean,time,text,text) from public,anon; grant execute on function public.admin_save_zalo_settings(boolean,time,text,text) to authenticated;
create or replace function public.admin_get_zalo_logs()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'logs',coalesce((select jsonb_agg(to_jsonb(l) order by sent_at desc) from (select * from public.zalo_schedule_logs order by sent_at desc limit 100) l),'[]'::jsonb));
end; $$;
revoke all on function public.admin_get_zalo_logs() from public,anon; grant execute on function public.admin_get_zalo_logs() to authenticated;
