-- =====================================================================
-- LH-NaviX — Database Schema Snapshot (Synchronized with Supabase Remote)
-- Generated: 2026-10-12
-- Database Engine: PostgreSQL 17 (Supabase)
-- Note: Contains only schema definitions (DDL). NO REAL USER DATA.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- =====================================================================
-- 1. TABLES & COLUMNS
-- =====================================================================

create table if not exists public.admin_mssv (
  mssv text not null,
  added_at timestamp with time zone default now() not null
);

create table if not exists public.anonymous_feedback (
  id uuid default gen_random_uuid() not null,
  public_code text default ('FB-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))) not null,
  feedback_type text not null,
  content text not null,
  status text default 'new'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.attendance (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  mssv text not null,
  full_name text,
  status text default 'có mặt'::text not null,
  category text,
  note text,
  device_id text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.attendance_audit_logs (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  mssv text not null,
  student_name text,
  old_status text,
  new_status text not null,
  changed_by text default 'Admin'::text not null,
  reason text,
  changed_at timestamp with time zone default now() not null
);

create table if not exists public.attendance_record_history (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  attendance_id uuid not null,
  mssv text not null,
  student_name text,
  old_record jsonb not null,
  new_record jsonb not null,
  changed_by text default 'Admin'::text not null,
  changed_at timestamp with time zone default now() not null
);

create table if not exists public.in_app_notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  title text not null,
  message text not null,
  leave_request_id uuid,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.leave_request_history (
  id uuid default gen_random_uuid() not null,
  leave_request_id uuid not null,
  changed_by uuid,
  old_record jsonb,
  new_record jsonb not null,
  changed_at timestamp with time zone default now() not null
);

create table if not exists public.leave_requests (
  id uuid default gen_random_uuid() not null,
  session_id uuid,
  requested_by uuid default auth.uid() not null,
  mssv text not null,
  leave_type text not null,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  reason text not null,
  evidence_path text,
  status text default 'pending'::text not null,
  reviewer_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  leave_date date not null,
  leave_period text not null
);

create table if not exists public.password_reset_history (
  id uuid default gen_random_uuid() not null,
  mssv text not null,
  student_name text not null,
  reset_by uuid,
  reset_by_name text default 'Admin'::text not null,
  request_id uuid,
  created_at timestamp with time zone default now() not null,
  temp_password text
);

create table if not exists public.password_reset_requests (
  id uuid default gen_random_uuid() not null,
  mssv text not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now(),
  handled_at timestamp with time zone,
  handled_by uuid
);

create table if not exists public.profiles (
  user_id uuid not null,
  username text,
  full_name text,
  mssv text
);

create table if not exists public.sessions (
  id uuid default gen_random_uuid() not null,
  session_name text not null,
  is_open boolean default true not null,
  duration_min integer,
  warn_before_min integer default 5 not null,
  started_at timestamp with time zone default now() not null,
  qr_token text not null,
  qr_born_at timestamp with time zone default now()
);

create table if not exists public.student_schedules (
  id uuid default gen_random_uuid() not null,
  mssv text not null,
  subject_name text not null,
  room_name text,
  teacher_name text,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  day_of_week integer,
  created_at timestamp with time zone default now() not null,
  buoi smallint
);

create table if not exists public.students (
  mssv text not null,
  name text not null
);

create table if not exists public.team_group_members (
  team_id uuid not null,
  mssv text not null,
  added_at timestamp with time zone default now() not null
);

create table if not exists public.team_groups (
  id uuid default gen_random_uuid() not null,
  name text not null,
  field text not null,
  leader_mssv text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.team_task_assignments (
  task_id uuid not null,
  mssv text not null,
  status text default 'todo'::text not null,
  read_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.team_tasks (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text default ''::text not null,
  scope text not null,
  team_id uuid,
  created_by uuid default auth.uid() not null,
  priority text default 'med'::text not null,
  due_date date,
  created_at timestamp with time zone default now() not null,
  completed_by_mssv text,
  completed_at timestamp with time zone,
  claimed_by_mssv text,
  claimed_at timestamp with time zone
);

create table if not exists public.workshop_rules (
  id uuid default gen_random_uuid() not null,
  title text not null,
  content text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.zalo_schedule_job_secret (
  id boolean default true not null,
  secret text not null
);

create table if not exists public.zalo_schedule_logs (
  id uuid default gen_random_uuid() not null,
  run_date date not null,
  trigger_type text default 'scheduled'::text not null,
  status text not null,
  group_label text,
  free_count integer default 0 not null,
  busy_count integer default 0 not null,
  message text,
  error text,
  sent_at timestamp with time zone default now() not null
);

create table if not exists public.zalo_schedule_previews (
  id uuid default gen_random_uuid() not null,
  target_date date not null,
  status text not null,
  member_count integer default 0 not null,
  periods jsonb default '{}'::jsonb not null,
  error_message text,
  generated_at timestamp with time zone default now() not null
);

create table if not exists public.zalo_schedule_settings (
  id boolean default true not null,
  auto_enabled boolean default false not null,
  send_time time without time zone default '20:00:00'::time without time zone not null,
  group_id text default ''::text not null,
  group_label text default ''::text not null,
  updated_at timestamp with time zone default now() not null
);

-- =====================================================================
-- 2. CONSTRAINTS (Primary Keys, Foreign Keys, Unique, Check)
-- =====================================================================
alter table only public.sessions drop constraint if exists sessions_pkey;
alter table only public.sessions add constraint sessions_pkey PRIMARY KEY (id);
alter table only public.attendance drop constraint if exists attendance_pkey;
alter table only public.attendance add constraint attendance_pkey PRIMARY KEY (id);
alter table only public.attendance drop constraint if exists attendance_session_id_fkey;
alter table only public.attendance add constraint attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
alter table only public.attendance drop constraint if exists attendance_session_mssv_uq;
alter table only public.attendance add constraint attendance_session_mssv_uq UNIQUE (session_id, mssv);
alter table only public.attendance drop constraint if exists attendance_status_check;
alter table only public.attendance add constraint attendance_status_check CHECK ((status = ANY (ARRAY['có mặt'::text, 'đi muộn'::text, 'vắng có phép'::text, 'vắng không phép'::text])));
alter table only public.students drop constraint if exists students_pkey;
alter table only public.students add constraint students_pkey PRIMARY KEY (mssv);
alter table only public.profiles drop constraint if exists profiles_mssv_key;
alter table only public.profiles add constraint profiles_mssv_key UNIQUE (mssv);
alter table only public.profiles drop constraint if exists profiles_pkey;
alter table only public.profiles add constraint profiles_pkey PRIMARY KEY (user_id);
alter table only public.profiles drop constraint if exists profiles_user_id_fkey;
alter table only public.profiles add constraint profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.profiles drop constraint if exists profiles_username_key;
alter table only public.profiles add constraint profiles_username_key UNIQUE (username);
alter table only public.admin_mssv drop constraint if exists admin_mssv_pkey;
alter table only public.admin_mssv add constraint admin_mssv_pkey PRIMARY KEY (mssv);
alter table only public.student_schedules drop constraint if exists student_schedules_mssv_fkey;
alter table only public.student_schedules add constraint student_schedules_mssv_fkey FOREIGN KEY (mssv) REFERENCES students(mssv) ON DELETE CASCADE;
alter table only public.student_schedules drop constraint if exists student_schedules_pkey;
alter table only public.student_schedules add constraint student_schedules_pkey PRIMARY KEY (id);
alter table only public.attendance_audit_logs drop constraint if exists attendance_audit_logs_pkey;
alter table only public.attendance_audit_logs add constraint attendance_audit_logs_pkey PRIMARY KEY (id);
alter table only public.attendance_audit_logs drop constraint if exists attendance_audit_logs_session_id_fkey;
alter table only public.attendance_audit_logs add constraint attendance_audit_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
alter table only public.password_reset_requests drop constraint if exists password_reset_requests_handled_by_fkey;
alter table only public.password_reset_requests add constraint password_reset_requests_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public.password_reset_requests drop constraint if exists password_reset_requests_mssv_fkey;
alter table only public.password_reset_requests add constraint password_reset_requests_mssv_fkey FOREIGN KEY (mssv) REFERENCES students(mssv) ON DELETE CASCADE;
alter table only public.password_reset_requests drop constraint if exists password_reset_requests_pkey;
alter table only public.password_reset_requests add constraint password_reset_requests_pkey PRIMARY KEY (id);
alter table only public.attendance_record_history drop constraint if exists attendance_record_history_pkey;
alter table only public.attendance_record_history add constraint attendance_record_history_pkey PRIMARY KEY (id);
alter table only public.attendance_record_history drop constraint if exists attendance_record_history_session_id_fkey;
alter table only public.attendance_record_history add constraint attendance_record_history_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
alter table only public.team_groups drop constraint if exists team_groups_created_by_fkey;
alter table only public.team_groups add constraint team_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public.team_groups drop constraint if exists team_groups_field_check;
alter table only public.team_groups add constraint team_groups_field_check CHECK (((length(btrim(field)) >= 1) AND (length(btrim(field)) <= 120)));
alter table only public.team_groups drop constraint if exists team_groups_leader_mssv_fkey;
alter table only public.team_groups add constraint team_groups_leader_mssv_fkey FOREIGN KEY (leader_mssv) REFERENCES students(mssv) ON DELETE SET NULL;
alter table only public.team_groups drop constraint if exists team_groups_name_check;
alter table only public.team_groups add constraint team_groups_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 100)));
alter table only public.team_groups drop constraint if exists team_groups_pkey;
alter table only public.team_groups add constraint team_groups_pkey PRIMARY KEY (id);
alter table only public.team_group_members drop constraint if exists team_group_members_mssv_fkey;
alter table only public.team_group_members add constraint team_group_members_mssv_fkey FOREIGN KEY (mssv) REFERENCES students(mssv) ON DELETE CASCADE;
alter table only public.team_group_members drop constraint if exists team_group_members_pkey;
alter table only public.team_group_members add constraint team_group_members_pkey PRIMARY KEY (team_id, mssv);
alter table only public.team_group_members drop constraint if exists team_group_members_team_id_fkey;
alter table only public.team_group_members add constraint team_group_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES team_groups(id) ON DELETE CASCADE;
alter table only public.team_tasks drop constraint if exists team_tasks_claimed_by_mssv_fkey;
alter table only public.team_tasks add constraint team_tasks_claimed_by_mssv_fkey FOREIGN KEY (claimed_by_mssv) REFERENCES students(mssv) ON DELETE SET NULL;
alter table only public.team_tasks drop constraint if exists team_tasks_completed_by_mssv_fkey;
alter table only public.team_tasks add constraint team_tasks_completed_by_mssv_fkey FOREIGN KEY (completed_by_mssv) REFERENCES students(mssv) ON DELETE SET NULL;
alter table only public.team_tasks drop constraint if exists team_tasks_created_by_fkey;
alter table only public.team_tasks add constraint team_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.team_tasks drop constraint if exists team_tasks_pkey;
alter table only public.team_tasks add constraint team_tasks_pkey PRIMARY KEY (id);
alter table only public.team_tasks drop constraint if exists team_tasks_priority_check;
alter table only public.team_tasks add constraint team_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'med'::text, 'high'::text])));
alter table only public.team_tasks drop constraint if exists team_tasks_scope_check;
alter table only public.team_tasks add constraint team_tasks_scope_check CHECK ((scope = ANY (ARRAY['group'::text, 'personal'::text, 'global'::text])));
alter table only public.team_tasks drop constraint if exists team_tasks_team_id_fkey;
alter table only public.team_tasks add constraint team_tasks_team_id_fkey FOREIGN KEY (team_id) REFERENCES team_groups(id) ON DELETE CASCADE;
alter table only public.team_tasks drop constraint if exists team_tasks_title_check;
alter table only public.team_tasks add constraint team_tasks_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 180)));
alter table only public.team_task_assignments drop constraint if exists team_task_assignments_mssv_fkey;
alter table only public.team_task_assignments add constraint team_task_assignments_mssv_fkey FOREIGN KEY (mssv) REFERENCES students(mssv) ON DELETE CASCADE;
alter table only public.team_task_assignments drop constraint if exists team_task_assignments_pkey;
alter table only public.team_task_assignments add constraint team_task_assignments_pkey PRIMARY KEY (task_id, mssv);
alter table only public.team_task_assignments drop constraint if exists team_task_assignments_status_check;
alter table only public.team_task_assignments add constraint team_task_assignments_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text])));
alter table only public.team_task_assignments drop constraint if exists team_task_assignments_task_id_fkey;
alter table only public.team_task_assignments add constraint team_task_assignments_task_id_fkey FOREIGN KEY (task_id) REFERENCES team_tasks(id) ON DELETE CASCADE;
alter table only public.anonymous_feedback drop constraint if exists anonymous_feedback_content_check;
alter table only public.anonymous_feedback add constraint anonymous_feedback_content_check CHECK (((length(btrim(content)) >= 1) AND (length(btrim(content)) <= 5000)));
alter table only public.anonymous_feedback drop constraint if exists anonymous_feedback_feedback_type_check;
alter table only public.anonymous_feedback add constraint anonymous_feedback_feedback_type_check CHECK ((feedback_type = ANY (ARRAY['gopy'::text, 'suco'::text, 'muasam'::text, 'khac'::text])));
alter table only public.anonymous_feedback drop constraint if exists anonymous_feedback_pkey;
alter table only public.anonymous_feedback add constraint anonymous_feedback_pkey PRIMARY KEY (id);
alter table only public.anonymous_feedback drop constraint if exists anonymous_feedback_public_code_key;
alter table only public.anonymous_feedback add constraint anonymous_feedback_public_code_key UNIQUE (public_code);
alter table only public.anonymous_feedback drop constraint if exists anonymous_feedback_status_check;
alter table only public.anonymous_feedback add constraint anonymous_feedback_status_check CHECK ((status = ANY (ARRAY['new'::text, 'seen'::text, 'resolved'::text])));
alter table only public.zalo_schedule_settings drop constraint if exists zalo_schedule_settings_id_check;
alter table only public.zalo_schedule_settings add constraint zalo_schedule_settings_id_check CHECK (id);
alter table only public.zalo_schedule_settings drop constraint if exists zalo_schedule_settings_pkey;
alter table only public.zalo_schedule_settings add constraint zalo_schedule_settings_pkey PRIMARY KEY (id);
alter table only public.zalo_schedule_logs drop constraint if exists zalo_schedule_logs_pkey;
alter table only public.zalo_schedule_logs add constraint zalo_schedule_logs_pkey PRIMARY KEY (id);
alter table only public.workshop_rules drop constraint if exists workshop_rules_content_check;
alter table only public.workshop_rules add constraint workshop_rules_content_check CHECK (((length(btrim(content)) >= 1) AND (length(btrim(content)) <= 5000)));
alter table only public.workshop_rules drop constraint if exists workshop_rules_pkey;
alter table only public.workshop_rules add constraint workshop_rules_pkey PRIMARY KEY (id);
alter table only public.workshop_rules drop constraint if exists workshop_rules_title_check;
alter table only public.workshop_rules add constraint workshop_rules_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 180)));
alter table only public.zalo_schedule_previews drop constraint if exists zalo_schedule_previews_member_count_check;
alter table only public.zalo_schedule_previews add constraint zalo_schedule_previews_member_count_check CHECK ((member_count >= 0));
alter table only public.zalo_schedule_previews drop constraint if exists zalo_schedule_previews_pkey;
alter table only public.zalo_schedule_previews add constraint zalo_schedule_previews_pkey PRIMARY KEY (id);
alter table only public.zalo_schedule_previews drop constraint if exists zalo_schedule_previews_status_check;
alter table only public.zalo_schedule_previews add constraint zalo_schedule_previews_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'error'::text])));
alter table only public.zalo_schedule_job_secret drop constraint if exists zalo_schedule_job_secret_id_check;
alter table only public.zalo_schedule_job_secret add constraint zalo_schedule_job_secret_id_check CHECK (id);
alter table only public.zalo_schedule_job_secret drop constraint if exists zalo_schedule_job_secret_pkey;
alter table only public.zalo_schedule_job_secret add constraint zalo_schedule_job_secret_pkey PRIMARY KEY (id);
alter table only public.leave_requests drop constraint if exists leave_request_period_check;
alter table only public.leave_requests add constraint leave_request_period_check CHECK ((leave_period = ANY (ARRAY['full_day'::text, 'morning'::text, 'afternoon'::text, 'evening'::text])));
alter table only public.leave_requests drop constraint if exists leave_request_range_check;
alter table only public.leave_requests add constraint leave_request_range_check CHECK ((((leave_type = 'full_session'::text) AND (starts_at IS NULL) AND (ends_at IS NULL)) OR ((leave_type <> 'full_session'::text) AND (starts_at IS NOT NULL) AND (ends_at IS NOT NULL) AND (ends_at > starts_at))));
alter table only public.leave_requests drop constraint if exists leave_requests_leave_type_check;
alter table only public.leave_requests add constraint leave_requests_leave_type_check CHECK ((leave_type = ANY (ARRAY['full_session'::text, 'late'::text, 'early'::text, 'partial'::text])));
alter table only public.leave_requests drop constraint if exists leave_requests_mssv_fkey;
alter table only public.leave_requests add constraint leave_requests_mssv_fkey FOREIGN KEY (mssv) REFERENCES students(mssv) ON DELETE CASCADE;
alter table only public.leave_requests drop constraint if exists leave_requests_pkey;
alter table only public.leave_requests add constraint leave_requests_pkey PRIMARY KEY (id);
alter table only public.leave_requests drop constraint if exists leave_requests_reason_check;
alter table only public.leave_requests add constraint leave_requests_reason_check CHECK (((length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 1000)));
alter table only public.leave_requests drop constraint if exists leave_requests_requested_by_fkey;
alter table only public.leave_requests add constraint leave_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.leave_requests drop constraint if exists leave_requests_reviewed_by_fkey;
alter table only public.leave_requests add constraint leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public.leave_requests drop constraint if exists leave_requests_session_id_fkey;
alter table only public.leave_requests add constraint leave_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
alter table only public.leave_requests drop constraint if exists leave_requests_status_check;
alter table only public.leave_requests add constraint leave_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
alter table only public.leave_request_history drop constraint if exists leave_request_history_changed_by_fkey;
alter table only public.leave_request_history add constraint leave_request_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public.leave_request_history drop constraint if exists leave_request_history_leave_request_id_fkey;
alter table only public.leave_request_history add constraint leave_request_history_leave_request_id_fkey FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE;
alter table only public.leave_request_history drop constraint if exists leave_request_history_pkey;
alter table only public.leave_request_history add constraint leave_request_history_pkey PRIMARY KEY (id);
alter table only public.in_app_notifications drop constraint if exists in_app_notifications_leave_request_id_fkey;
alter table only public.in_app_notifications add constraint in_app_notifications_leave_request_id_fkey FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE;
alter table only public.in_app_notifications drop constraint if exists in_app_notifications_pkey;
alter table only public.in_app_notifications add constraint in_app_notifications_pkey PRIMARY KEY (id);
alter table only public.in_app_notifications drop constraint if exists in_app_notifications_user_id_fkey;
alter table only public.in_app_notifications add constraint in_app_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.password_reset_history drop constraint if exists password_reset_history_pkey;
alter table only public.password_reset_history add constraint password_reset_history_pkey PRIMARY KEY (id);
alter table only public.password_reset_history drop constraint if exists password_reset_history_reset_by_fkey;
alter table only public.password_reset_history add constraint password_reset_history_reset_by_fkey FOREIGN KEY (reset_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- =====================================================================
-- 3. INDEXES
-- =====================================================================
CREATE UNIQUE INDEX attendance_session_device_uq ON public.attendance USING btree (session_id, device_id) WHERE (device_id IS NOT NULL);
CREATE INDEX attendance_session_idx ON public.attendance USING btree (session_id, created_at DESC);
CREATE INDEX idx_attendance_audit_logs_session ON public.attendance_audit_logs USING btree (session_id, changed_at DESC);
CREATE INDEX idx_attendance_record_history_session ON public.attendance_record_history USING btree (session_id, changed_at DESC);
CREATE INDEX in_app_notifications_user_idx ON public.in_app_notifications USING btree (user_id, created_at DESC);
CREATE INDEX leave_request_history_request_idx ON public.leave_request_history USING btree (leave_request_id, changed_at DESC);
CREATE INDEX leave_requests_day_period_idx ON public.leave_requests USING btree (leave_date, leave_period, created_at DESC);
CREATE INDEX leave_requests_owner_idx ON public.leave_requests USING btree (requested_by, created_at DESC);
CREATE INDEX leave_requests_session_idx ON public.leave_requests USING btree (session_id, created_at DESC);
CREATE INDEX leave_requests_status_idx ON public.leave_requests USING btree (status, created_at DESC);
CREATE INDEX idx_password_reset_history_created_at ON public.password_reset_history USING btree (created_at DESC);
CREATE UNIQUE INDEX idx_unique_pending_reset ON public.password_reset_requests USING btree (mssv) WHERE (status = 'pending'::text);
CREATE INDEX idx_student_schedules_date_session ON public.student_schedules USING btree (mssv, buoi, start_time);
CREATE INDEX idx_student_schedules_lookup ON public.student_schedules USING btree (mssv, start_time, end_time);
CREATE INDEX zalo_schedule_previews_date_idx ON public.zalo_schedule_previews USING btree (target_date, generated_at DESC);

-- =====================================================================
-- 4. ROW LEVEL SECURITY (RLS) STATUS
-- =====================================================================
alter table public.admin_mssv enable row level security;
alter table public.anonymous_feedback enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_audit_logs enable row level security;
alter table public.attendance_record_history enable row level security;
alter table public.in_app_notifications enable row level security;
alter table public.leave_request_history enable row level security;
alter table public.leave_requests enable row level security;
alter table public.password_reset_history enable row level security;
alter table public.password_reset_requests enable row level security;
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.student_schedules enable row level security;
alter table public.students enable row level security;
alter table public.team_group_members enable row level security;
alter table public.team_groups enable row level security;
alter table public.team_task_assignments enable row level security;
alter table public.team_tasks enable row level security;
alter table public.workshop_rules enable row level security;
alter table public.zalo_schedule_job_secret enable row level security;
alter table public.zalo_schedule_logs enable row level security;
alter table public.zalo_schedule_previews enable row level security;
alter table public.zalo_schedule_settings enable row level security;

-- =====================================================================
-- 5. RLS POLICIES
-- =====================================================================
drop policy if exists "admin_feedback_read" on public.anonymous_feedback;
create policy "admin_feedback_read" on public.anonymous_feedback
  for select
  to authenticated
  using (is_admin());

drop policy if exists "admin_all_att" on public.attendance;
create policy "admin_all_att" on public.attendance
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_all_audit" on public.attendance_audit_logs;
create policy "admin_all_audit" on public.attendance_audit_logs
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_read_attendance_record_history" on public.attendance_record_history;
create policy "admin_read_attendance_record_history" on public.attendance_record_history
  for select
  to authenticated
  using (is_admin());

drop policy if exists "in_app_notifications_read" on public.in_app_notifications;
create policy "in_app_notifications_read" on public.in_app_notifications
  for select
  to authenticated
  using ((user_id = auth.uid()));

drop policy if exists "in_app_notifications_update" on public.in_app_notifications;
create policy "in_app_notifications_update" on public.in_app_notifications
  for update
  to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "leave_request_history_read" on public.leave_request_history;
create policy "leave_request_history_read" on public.leave_request_history
  for select
  to authenticated
  using (true);

drop policy if exists "leave_requests_delete" on public.leave_requests;
create policy "leave_requests_delete" on public.leave_requests
  for delete
  to authenticated
  using (is_admin());

drop policy if exists "leave_requests_read" on public.leave_requests;
create policy "leave_requests_read" on public.leave_requests
  for select
  to authenticated
  using (true);

drop policy if exists "leave_requests_submit" on public.leave_requests;
create policy "leave_requests_submit" on public.leave_requests
  for insert
  to authenticated
  with check (((requested_by = auth.uid()) AND (mssv = ( SELECT p.mssv
   FROM profiles p
  WHERE (p.user_id = auth.uid())))));

drop policy if exists "leave_requests_update" on public.leave_requests;
create policy "leave_requests_update" on public.leave_requests
  for update
  to authenticated
  using ((((requested_by = auth.uid()) AND (status = 'pending'::text)) OR is_admin()))
  with check ((is_admin() OR ((requested_by = auth.uid()) AND (status = ANY (ARRAY['pending'::text, 'cancelled'::text])))));

drop policy if exists "admin_read_password_reset_history" on public.password_reset_history;
create policy "admin_read_password_reset_history" on public.password_reset_history
  for select
  to authenticated
  using (is_admin());

drop policy if exists "Admin full access" on public.password_reset_requests;
create policy "Admin full access" on public.password_reset_requests
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "Anon can insert requests" on public.password_reset_requests;
create policy "Anon can insert requests" on public.password_reset_requests
  for insert
  to anon
  with check (((status = 'pending'::text) AND (handled_at IS NULL) AND (handled_by IS NULL)));

drop policy if exists "Admins can do everything" on public.profiles;
create policy "Admins can do everything" on public.profiles
  for all
  to authenticated
  using (( SELECT is_admin() AS is_admin))
  with check (( SELECT is_admin() AS is_admin));

drop policy if exists "prof_self" on public.profiles;
create policy "prof_self" on public.profiles
  for select
  to authenticated
  using (((user_id = auth.uid()) OR is_admin()));

drop policy if exists "admin_all_sessions" on public.sessions;
create policy "admin_all_sessions" on public.sessions
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "Allow read student_schedules" on public.student_schedules;
create policy "Allow read student_schedules" on public.student_schedules
  for select
  to public
  using (true);

drop policy if exists "read_students" on public.students;
create policy "read_students" on public.students
  for select
  to public
  using (true);

drop policy if exists "admin_manage_team_group_members" on public.team_group_members;
create policy "admin_manage_team_group_members" on public.team_group_members
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_manage_team_groups" on public.team_groups;
create policy "admin_manage_team_groups" on public.team_groups
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "task_assignment_read_policy" on public.team_task_assignments;
create policy "task_assignment_read_policy" on public.team_task_assignments
  for select
  to authenticated
  using ((is_admin() OR (mssv = ( SELECT p.mssv
   FROM profiles p
  WHERE (p.user_id = auth.uid())))));

drop policy if exists "task_read_policy" on public.team_tasks;
create policy "task_read_policy" on public.team_tasks
  for select
  to authenticated
  using ((is_admin() OR (EXISTS ( SELECT 1
   FROM (team_groups g
     JOIN team_group_members m ON ((m.team_id = g.id)))
  WHERE ((g.id = team_tasks.team_id) AND (m.mssv = ( SELECT p.mssv
           FROM profiles p
          WHERE (p.user_id = auth.uid()))))))));

drop policy if exists "workshop_rules_admin_delete" on public.workshop_rules;
create policy "workshop_rules_admin_delete" on public.workshop_rules
  for delete
  to authenticated
  using (is_admin());

drop policy if exists "workshop_rules_admin_insert" on public.workshop_rules;
create policy "workshop_rules_admin_insert" on public.workshop_rules
  for insert
  to authenticated
  with check (is_admin());

drop policy if exists "workshop_rules_admin_update" on public.workshop_rules;
create policy "workshop_rules_admin_update" on public.workshop_rules
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "workshop_rules_read" on public.workshop_rules;
create policy "workshop_rules_read" on public.workshop_rules
  for select
  to authenticated
  using (true);

drop policy if exists "admin_read_zalo_logs" on public.zalo_schedule_logs;
create policy "admin_read_zalo_logs" on public.zalo_schedule_logs
  for select
  to authenticated
  using (is_admin());

drop policy if exists "zalo_schedule_previews_admin_read" on public.zalo_schedule_previews;
create policy "zalo_schedule_previews_admin_read" on public.zalo_schedule_previews
  for select
  to authenticated
  using (is_admin());


-- =====================================================================
-- 6. FUNCTIONS / STORED PROCEDURES & RPC (Total: 76)
-- =====================================================================

-- Function: _qr_sig(p_secret text, p_session text, p_win bigint)
CREATE OR REPLACE FUNCTION public._qr_sig(p_secret text, p_session text, p_win bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select left(
    encode(
      hmac(p_session || ':' || p_win::text, p_secret, 'sha256'),
      'hex'
    ),
    24
  )
$function$;

-- Function: add_team_leader_as_member()
CREATE OR REPLACE FUNCTION public.add_team_leader_as_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if new.leader_mssv is not null then
    insert into public.team_group_members (team_id, mssv)
    values (new.id, new.leader_mssv)
    on conflict (team_id, mssv) do nothing;
  end if;
  return new;
end;
$function$;

-- Function: admin_batch_set_status(p_session_id text, p_mssv_list text[], p_status text, p_reason text)
CREATE OR REPLACE FUNCTION public.admin_batch_set_status(p_session_id text, p_mssv_list text[], p_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_sid uuid; v_email text:=coalesce(auth.jwt()->>'email','Admin');
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 if p_status not in ('có mặt','đi muộn','vắng có phép','vắng không phép') then return jsonb_build_object('ok',false,'message','Trạng thái không hợp lệ.'); end if;
 select id into v_sid from public.sessions where id::text=btrim(p_session_id);
 if v_sid is null then return jsonb_build_object('ok',false,'message','Không tìm thấy phiên.'); end if;
 insert into public.attendance_audit_logs(session_id,mssv,student_name,old_status,new_status,changed_by,reason,changed_at)
 select v_sid,st.mssv,st.name,coalesce(a.status,'chưa điểm danh'),p_status,v_email,coalesce(p_reason,'Cập nhật hàng loạt'),now()
 from public.students st left join public.attendance a on a.session_id=v_sid and a.mssv=st.mssv where st.mssv=any(p_mssv_list);
 insert into public.attendance(session_id,mssv,full_name,status,category,note)
 select v_sid,st.mssv,st.name,p_status,'Admin Batch',coalesce(p_reason,'') from public.students st where st.mssv=any(p_mssv_list)
 on conflict(session_id,mssv) do update set status=excluded.status;
 return jsonb_build_object('ok',true,'count',cardinality(p_mssv_list));
end $function$;

-- Function: admin_clear_password_reset_history()
CREATE OR REPLACE FUNCTION public.admin_clear_password_reset_history()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_deleted integer;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  delete from public.password_reset_history;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$function$;

-- Function: admin_close_session(p_session_id text)
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
        else 'Không có dữ liệu tham gia' end
    from public.students st
    where not exists(select 1 from public.attendance a where a.session_id=v_sid and a.mssv=st.mssv)
    on conflict(session_id,mssv) do nothing;
    update public.sessions set is_open=false where id=v_sid;
  end if;
  update public.sessions set is_open=false where is_open=true;
  return jsonb_build_object('ok',true);
end;
$function$;

-- Function: admin_complete_reset_request(p_request_id uuid)
CREATE OR REPLACE FUNCTION public.admin_complete_reset_request(p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Permission denied (Not Admin)';
  end if;

  update public.password_reset_requests
  set status = 'completed',
      handled_at = now(),
      handled_by = auth.uid()
  where id = p_request_id and status = 'pending';

  return true;
end;
$function$;

-- Function: admin_create_team(p_name text, p_description text)
CREATE OR REPLACE FUNCTION public.admin_create_team(p_name text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_team public.teams;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được tạo nhóm.');
  end if;

  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'Tên nhóm không được để trống.');
  end if;

  insert into public.teams (name, description)
  values (v_name, nullif(btrim(coalesce(p_description, '')), ''))
  returning * into v_team;

  return jsonb_build_object('ok', true, 'team', jsonb_build_object(
    'id', v_team.id, 'name', v_team.name, 'description', v_team.description
  ));
end;
$function$;

-- Function: admin_delete_attendance()
CREATE OR REPLACE FUNCTION public.admin_delete_attendance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_att_count int; v_sess_count int;
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 delete from public.attendance; get diagnostics v_att_count=row_count;
 delete from public.sessions where is_open=false; get diagnostics v_sess_count=row_count;
 return jsonb_build_object('ok',true,'deleted',v_att_count,'sessions_deleted',v_sess_count);
end $function$;

-- Function: admin_delete_history()
CREATE OR REPLACE FUNCTION public.admin_delete_history()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_count int;
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 delete from public.sessions where is_open=false; get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'deleted',v_count);
end $function$;

-- Function: admin_delete_leave_request(p_request_id uuid)
CREATE OR REPLACE FUNCTION public.admin_delete_leave_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_req public.leave_requests%rowtype;
  v_name text;
  v_email text := coalesce(auth.jwt() ->> 'email', 'Admin');
  v_old_status text;
  v_session record;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền thực hiện hành động này.');
  end if;

  select * into v_req from public.leave_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy đơn xin nghỉ.');
  end if;

  select name into v_name from public.students where mssv = v_req.mssv;

  -- Nếu đơn đang ở trạng thái 'approved', hoàn tác trạng thái điểm danh về 'vắng không phép' cho các phiên bị ảnh hưởng
  if v_req.status = 'approved' then
    for v_session in select s.id, s.started_at, s.duration_min from public.sessions s
      where public.leave_request_covers_session(v_req.leave_date, v_req.leave_period, s.started_at, s.duration_min)
    loop
      if not exists (
        select 1 from public.leave_requests r
        where r.id <> v_req.id and r.mssv = v_req.mssv and r.status = 'approved'
          and public.leave_request_covers_session(r.leave_date, r.leave_period, v_session.started_at, v_session.duration_min)
      ) then
        select status into v_old_status from public.attendance
        where session_id = v_session.id and mssv = v_req.mssv and category = 'Xin nghỉ';

        if v_old_status = 'vắng có phép' then
          update public.attendance
          set status = 'vắng không phép', category = 'Xưởng', note = 'Đơn xin nghỉ đã bị xóa'
          where session_id = v_session.id and mssv = v_req.mssv and category = 'Xin nghỉ';

          insert into public.attendance_audit_logs(
            session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
          ) values (
            v_session.id, v_req.mssv, coalesce(v_name, v_req.mssv),
            'vắng có phép', 'vắng không phép', v_email, 'Đơn xin nghỉ đã bị xóa', now()
          );
        end if;
      end if;
    end loop;
  end if;

  -- Xóa bản ghi đơn (lịch sử leave_request_history và in_app_notifications có foreign key ON DELETE CASCADE)
  delete from public.leave_requests where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'evidence_path', v_req.evidence_path,
    'message', 'Đã xóa vĩnh viễn đơn xin nghỉ thành công.'
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$function$;

-- Function: admin_delete_session(p_session_id uuid)
CREATE OR REPLACE FUNCTION public.admin_delete_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_is_admin boolean;
begin
  -- Kiểm tra quyền admin
  select public.is_admin() into v_is_admin;
  if not v_is_admin then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền thực hiện hành động này.');
  end if;

  -- Xóa phiên (các record trong bảng attendance có foreign key cascade hoặc sẽ tự bị xóa nếu đã set cascade, 
  -- nếu không cascade thì cần xóa attendance trước)
  -- Tốt nhất nên xóa attendance trước cho an toàn nếu schema chưa thiết lập ON DELETE CASCADE
  delete from public.attendance where session_id = p_session_id;
  delete from public.sessions where id = p_session_id;

  return jsonb_build_object('ok', true, 'message', 'Đã xóa phiên thành công.');
exception
  when others then
    return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$function$;

-- Function: admin_delete_team(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.admin_delete_team(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được xóa nhóm.');
  end if;

  perform 1 from public.teams where id = p_team_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  if exists (select 1 from public.team_members where team_id = p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Nhóm còn thành viên, hãy gỡ hết trước khi xóa.');
  end if;

  if exists (select 1 from public.tasks where team_id = p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Nhóm còn công việc, hãy xử lý công việc trước khi xóa.');
  end if;

  delete from public.teams where id = p_team_id;
  return jsonb_build_object('ok', true, 'message', 'Đã xóa nhóm thành công.');
end;
$function$;

-- Function: admin_delete_team_task(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.admin_delete_team_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok',false,'message','Chỉ admin mới được xóa nhiệm vụ.');
  end if;
  delete from public.team_tasks where id=p_task_id;
  if not found then
    return jsonb_build_object('ok',false,'message','Không tìm thấy nhiệm vụ cần xóa.');
  end if;
  return jsonb_build_object('ok',true);
end;
$function$;

-- Function: admin_get_anonymous_feedback()
CREATE OR REPLACE FUNCTION public.admin_get_anonymous_feedback()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',public_code,'type',feedback_type,'content',content,'status',status,'created_at',created_at) order by created_at desc) from public.anonymous_feedback),'[]'::jsonb));
end; $function$;

-- Function: admin_get_attendance_record_history(p_session_id text)
CREATE OR REPLACE FUNCTION public.admin_get_attendance_record_history(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  return jsonb_build_object('ok', true, 'records', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id, 'mssv', h.mssv, 'student_name', h.student_name,
      'old_record', h.old_record, 'new_record', h.new_record,
      'changed_by', h.changed_by, 'changed_at', h.changed_at
    ) order by h.changed_at desc), '[]'::jsonb)
    from public.attendance_record_history h
    where h.session_id::text = btrim(p_session_id)
  ));
end;
$function$;

-- Function: admin_get_audit_logs(p_session_id text)
CREATE OR REPLACE FUNCTION public.admin_get_audit_logs(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  return jsonb_build_object('ok', true, 'logs', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'mssv', l.mssv,
      'student_name', l.student_name,
      'old_status', l.old_status,
      'new_status', l.new_status,
      'changed_by', l.changed_by,
      'reason', l.reason,
      'changed_at', l.changed_at
    ) order by l.changed_at desc), '[]'::jsonb)
    from public.attendance_audit_logs l
    where l.session_id::text = btrim(p_session_id)
  ));
end;
$function$;

-- Function: admin_get_team_tasks(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.admin_get_team_tasks(p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare v_mssv text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if not public.is_admin() and (
    p_team_id is null or not exists (
      select 1 from public.team_groups where id = p_team_id and leader_mssv = v_mssv
    )
  ) then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền xem nhiệm vụ nhóm này.');
  end if;

  return jsonb_build_object('ok', true, 'tasks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'description', t.description, 'scope', t.scope,
      'team_id', t.team_id, 'team_name', coalesce(g.name, 'Toàn xưởng'),
      'priority', t.priority, 'due_date', t.due_date, 'created_at', t.created_at,
      'completed_by_mssv', t.completed_by_mssv,
      'completed_by_name', (select s.name from public.students s where s.mssv = t.completed_by_mssv),
      'completed_at', t.completed_at,
      'claimed_by_mssv', t.claimed_by_mssv,
      'claimed_by_name', (select s.name from public.students s where s.mssv = t.claimed_by_mssv),
      'claimed_at', t.claimed_at,
      'assignees', (select coalesce(jsonb_agg(jsonb_build_object(
        'mssv', a.mssv, 'name', s.name, 'status', a.status, 'read_at', a.read_at
      ) order by s.name), '[]'::jsonb)
      from public.team_task_assignments a join public.students s on s.mssv = a.mssv where a.task_id = t.id)
    ) order by t.created_at desc)
    from public.team_tasks t
    left join public.team_groups g on g.id = t.team_id
    where p_team_id is null or t.team_id = p_team_id
  ), '[]'::jsonb));
end;
$function$;

-- Function: admin_get_zalo_logs()
CREATE OR REPLACE FUNCTION public.admin_get_zalo_logs()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'logs',coalesce((select jsonb_agg(to_jsonb(l) order by sent_at desc) from (select * from public.zalo_schedule_logs order by sent_at desc limit 100) l),'[]'::jsonb));
end; $function$;

-- Function: admin_get_zalo_schedule_preview(p_date date)
CREATE OR REPLACE FUNCTION public.admin_get_zalo_schedule_preview(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare v_preview jsonb; v_attempt jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
  select to_jsonb(p) into v_preview from public.zalo_schedule_previews p
  where p.target_date=p_date and p.status='ready' order by p.generated_at desc limit 1;
  select to_jsonb(p) into v_attempt from public.zalo_schedule_previews p
  where p.target_date=p_date order by p.generated_at desc limit 1;
  return jsonb_build_object('ok',true,'preview',v_preview,'last_attempt',v_attempt);
end;
$function$;

-- Function: admin_get_zalo_settings()
CREATE OR REPLACE FUNCTION public.admin_get_zalo_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'settings',(select to_jsonb(s) from public.zalo_schedule_settings s where id=true));
end; $function$;

-- Function: admin_list_users()
CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được xem danh sách tài khoản.');
  end if;

  return jsonb_build_object('ok', true, 'users', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'username', p.username,
        'full_name', p.full_name,
        'mssv', p.mssv,
        'role', p.role,
        'team_id', tm.team_id,
        'team_name', t.name,
        'team_role', coalesce(tm.team_role, 'member')
      ) order by p.role, coalesce(p.full_name, p.username)
    ), '[]'::jsonb)
    from public.profiles p
    left join public.team_members tm on tm.user_id = p.user_id
    left join public.teams t on t.id = tm.team_id
  ));
end;
$function$;

-- Function: admin_open_session(p_name text, p_duration_min integer, p_warn_before_min integer)
CREATE OR REPLACE FUNCTION public.admin_open_session(p_name text, p_duration_min integer, p_warn_before_min integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_name text:=btrim(coalesce(p_name,'')); v_new_id uuid; v_token text; v_start timestamptz:=now(); v_end timestamptz; v_dur int:=coalesce(p_duration_min,240);
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 if v_name='' then return jsonb_build_object('ok',false,'message','Tên phiên không được để trống.'); end if;
 update public.sessions set is_open=false where is_open;
 v_end:=v_start+(v_dur*interval '1 minute');
 v_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.sessions(session_name,duration_min,warn_before_min,qr_token,qr_born_at,started_at)
 values(v_name,p_duration_min,greatest(1,coalesce(p_warn_before_min,5)),v_token,v_start,v_start) returning id into v_new_id;
 insert into public.attendance(session_id,mssv,full_name,status,category,note)
 select distinct on(st.mssv) v_new_id,st.mssv,st.name,'vắng có phép','Học trường',
   'Lịch học: '||sch.subject_name||coalesce(' ('||sch.room_name||')','')
 from public.students st join public.student_schedules sch on sch.mssv=st.mssv
 where sch.start_time<v_end and sch.end_time>v_start
 order by st.mssv,sch.start_time asc on conflict(session_id,mssv) do nothing;
 return jsonb_build_object('ok',true,'session_id',v_new_id,'qr_token',v_token);
end $function$;

-- Function: admin_regenerate_qr()
CREATE OR REPLACE FUNCTION public.admin_regenerate_qr()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_token text; v_sid uuid;
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 v_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 update public.sessions set qr_token=v_token,qr_born_at=now() where is_open returning id into v_sid;
 if v_sid is null then return jsonb_build_object('ok',false,'message','Không có phiên nào đang mở.'); end if;
 return jsonb_build_object('ok',true,'qr_token',v_token,'qr_born_at',now());
end $function$;

-- Function: admin_reopen_session(p_session_id text)
CREATE OR REPLACE FUNCTION public.admin_reopen_session(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_sid uuid; v_token text; v_email text:=coalesce(auth.jwt()->>'email','Admin');
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 select id into v_sid from public.sessions where id::text=btrim(p_session_id);
 if v_sid is null then return jsonb_build_object('ok',false,'message','Không tìm thấy phiên.'); end if;
 update public.sessions set is_open=false where is_open and id<>v_sid;
 v_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 update public.sessions set is_open=true,qr_token=v_token,qr_born_at=now() where id=v_sid;
 insert into public.attendance_audit_logs(session_id,mssv,student_name,old_status,new_status,changed_by,reason,changed_at)
 values(v_sid,'SYSTEM','Phiên điểm danh','closed','active',v_email,'Admin mở lại phiên đã đóng',now());
 return jsonb_build_object('ok',true,'qr_token',v_token);
end $function$;

-- Function: admin_revoke_leader(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.admin_revoke_leader(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_old uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được thu hồi quyền Đội trưởng.');
  end if;

  select leader_id into v_old from public.teams where id = p_team_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  if v_old is null then
    return jsonb_build_object('ok', false, 'message', 'Nhóm này chưa có Đội trưởng.');
  end if;

  update public.teams set leader_id = null where id = p_team_id;
  update public.team_members set team_role = 'member'
  where team_id = p_team_id and user_id = v_old;
  update public.profiles set role = 'student'
  where user_id = v_old and role = 'leader';

  return jsonb_build_object('ok', true, 'message', 'Đã thu hồi quyền Đội trưởng.');
end;
$function$;

-- Function: admin_save_zalo_schedule_preview(p_date date, p_member_count integer, p_periods jsonb)
CREATE OR REPLACE FUNCTION public.admin_save_zalo_schedule_preview(p_date date, p_member_count integer, p_periods jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
$function$;

-- Function: admin_save_zalo_settings(p_enabled boolean, p_send_time time without time zone, p_group_id text, p_group_label text)
CREATE OR REPLACE FUNCTION public.admin_save_zalo_settings(p_enabled boolean, p_send_time time without time zone, p_group_id text, p_group_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 if p_enabled and length(btrim(coalesce(p_group_id,'')))=0 then return jsonb_build_object('ok',false,'message','Cần nhập Zalo group ID trước khi bật gửi tự động.'); end if;
 update public.zalo_schedule_settings set auto_enabled=p_enabled,send_time=p_send_time,group_id=btrim(coalesce(p_group_id,'')),group_label=btrim(coalesce(p_group_label,'')),updated_at=now() where id=true;
 return jsonb_build_object('ok',true,'schedule_ready',false,'message','Đã lưu. Cần cấu hình Supabase Cron và bí mật máy chủ để bật lịch gửi tự động.');
end; $function$;

-- Function: admin_set_status(p_session_id text, p_mssv text, p_status text, p_reason text)
CREATE OR REPLACE FUNCTION public.admin_set_status(p_session_id text, p_mssv text, p_status text, p_reason text DEFAULT NULL::text)
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

  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  values (v_sid, btrim(p_mssv), v_name, p_status, 'Admin', coalesce(p_reason, ''))
  on conflict (session_id, mssv) do update set
    status = excluded.status,
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

-- Function: admin_set_team_leader(p_team_id uuid, p_user_id uuid)
CREATE OR REPLACE FUNCTION public.admin_set_team_leader(p_team_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_team public.teams;
  v_target public.profiles;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được cấp quyền Đội trưởng.');
  end if;

  if p_team_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'Thiếu thông tin nhóm hoặc người dùng.');
  end if;

  select * into v_team from public.teams where id = p_team_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  select * into v_target from public.profiles where user_id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy hồ sơ người dùng.');
  end if;

  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'message', 'Không thể cấp quyền Đội trưởng cho chính tài khoản Admin.');
  end if;

  if v_team.leader_id is not null and v_team.leader_id <> p_user_id then
    update public.team_members
    set team_role = 'member'
    where team_id = p_team_id and user_id = v_team.leader_id;

    update public.profiles
    set role = 'student'
    where user_id = v_team.leader_id and role = 'leader';
  end if;

  update public.teams set leader_id = p_user_id where id = p_team_id;

  update public.profiles
  set role = 'leader'
  where user_id = p_user_id and role <> 'admin';

  insert into public.team_members (team_id, user_id, team_role)
  values (p_team_id, p_user_id, 'leader')
  on conflict (team_id, user_id)
  do update set team_role = 'leader';

  return jsonb_build_object('ok', true, 'message', 'Đã cấp quyền Đội trưởng thành công.');
end;
$function$;

-- Function: admin_sync_student_schedules(p_schedules jsonb)
CREATE OR REPLACE FUNCTION public.admin_sync_student_schedules(p_schedules jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_count int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' or jsonb_array_length(p_schedules) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Danh sách lịch học trống hoặc không hợp lệ.');
  end if;

  delete from public.student_schedules where id is not null;
  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week, buoi
  )
  select x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week, x.buoi
  from jsonb_to_recordset(p_schedules) as x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int, buoi smallint
  );
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$function$;

-- Function: admin_sync_student_schedules_for_date(p_schedules jsonb, p_date date)
CREATE OR REPLACE FUNCTION public.admin_sync_student_schedules_for_date(p_schedules jsonb, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_count int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if p_date is null or p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Ngày hoặc danh sách lịch không hợp lệ.');
  end if;

  delete from public.student_schedules
  where (start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week, buoi
  )
  select x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week, x.buoi
  from jsonb_to_recordset(p_schedules) as x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int, buoi smallint
  )
  where (x.start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count, 'date', p_date);
end;
$function$;

-- Function: admin_today_sessions()
CREATE OR REPLACE FUNCTION public.admin_today_sessions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 return jsonb_build_object('ok',true,'sessions',(
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'session_name',s.session_name,'started_at',s.started_at,'duration_min',s.duration_min,'is_open',s.is_open,'status',case when s.is_open then 'active' else 'closed' end,
   'present',(select count(*) from public.attendance a where a.session_id=s.id and a.status='có mặt'),
   'late',(select count(*) from public.attendance a where a.session_id=s.id and a.status='đi muộn'),
   'absent',(select count(*) from public.attendance a where a.session_id=s.id and a.status='vắng không phép'),
   'excused',(select count(*) from public.attendance a where a.session_id=s.id and a.status='vắng có phép'),
   'total',(select count(*) from public.students)) order by s.started_at desc),'[]'::jsonb)
  from (select * from public.sessions order by started_at desc limit 50) s));
end $function$;

-- Function: admin_update_anonymous_feedback(p_id uuid, p_status text)
CREATE OR REPLACE FUNCTION public.admin_update_anonymous_feedback(p_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$ begin
 if not public.is_admin() or p_status not in ('seen','resolved') then return jsonb_build_object('ok',false,'message','Không có quyền hoặc trạng thái không hợp lệ.'); end if;
 update public.anonymous_feedback set status=p_status,updated_at=now() where id=p_id;
 return jsonb_build_object('ok',found);
end; $function$;

-- Function: apply_approved_leave_to_attendance()
CREATE OR REPLACE FUNCTION public.apply_approved_leave_to_attendance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
$function$;

-- Function: assign_existing_global_tasks_to_student()
CREATE OR REPLACE FUNCTION public.assign_existing_global_tasks_to_student()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.team_task_assignments (task_id, mssv)
  select t.id, new.mssv
  from public.team_tasks t
  where t.scope = 'global'
  on conflict (task_id, mssv) do nothing;
  return new;
end;
$function$;

-- Function: assign_existing_group_tasks_to_member()
CREATE OR REPLACE FUNCTION public.assign_existing_group_tasks_to_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.team_task_assignments (task_id, mssv)
  select t.id, new.mssv
  from public.team_tasks t
  where t.team_id = new.team_id
    and t.scope = 'group'
  on conflict (task_id, mssv) do nothing;

  return new;
end;
$function$;

-- Function: can_manage_assignment(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.can_manage_assignment(p_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id and public.is_team_leader(t.team_id)
  );
$function$;

-- Function: capture_attendance_record_history()
CREATE OR REPLACE FUNCTION public.capture_attendance_record_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_changed_by text;
begin
  if (to_jsonb(old) - 'id') is not distinct from (to_jsonb(new) - 'id') then
    return new;
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), nullif(auth.jwt() ->> 'email', ''), 'Admin')
    into v_changed_by
  from (select auth.uid() as user_id) u
  left join public.profiles p on p.user_id = u.user_id;

  insert into public.attendance_record_history (
    session_id, attendance_id, mssv, student_name, old_record, new_record, changed_by, changed_at
  ) values (
    old.session_id, old.id, old.mssv, coalesce(old.full_name, new.full_name),
    jsonb_build_object('status', old.status, 'category', old.category, 'note', old.note, 'checked_at', old.created_at),
    jsonb_build_object('status', new.status, 'category', new.category, 'note', new.note, 'checked_at', new.created_at),
    coalesce(v_changed_by, 'Admin'), now()
  );
  return new;
end;
$function$;

-- Function: capture_leave_request_changes()
CREATE OR REPLACE FUNCTION public.capture_leave_request_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
$function$;

-- Function: claim_my_global_task(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.claim_my_global_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_mssv text;
  v_scope text;
  v_completed_at timestamptz;
  v_claimed_by text;
  v_claimed_name text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  select scope, completed_at, claimed_by_mssv
  into v_scope, v_completed_at, v_claimed_by
  from public.team_tasks
  where id = p_task_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;
  if v_scope <> 'global' then
    return jsonb_build_object('ok', false, 'message', 'Chỉ nhiệm vụ toàn xưởng mới có thể nhận làm.');
  end if;
  if v_completed_at is not null then
    return jsonb_build_object('ok', false, 'already_completed', true, 'message', 'Nhiệm vụ này đã hoàn thành.');
  end if;

  if v_claimed_by = v_mssv then
    return jsonb_build_object('ok', true, 'already_claimed', true, 'claimed_by_mssv', v_claimed_by);
  end if;
  if v_claimed_by is not null then
    select name into v_claimed_name from public.students where mssv = v_claimed_by;
    return jsonb_build_object('ok', false, 'claimed', true, 'claimed_by_mssv', v_claimed_by,
      'claimed_by_name', v_claimed_name, 'message', 'Nhiệm vụ đã có người nhận làm.');
  end if;

  update public.team_tasks
  set claimed_by_mssv = v_mssv, claimed_at = now()
  where id = p_task_id;
  return jsonb_build_object('ok', true, 'claimed_by_mssv', v_mssv);
end;
$function$;

-- Function: create_team_task(p_title text, p_description text, p_scope text, p_team_id uuid, p_assignee_mssv text, p_priority text, p_due_date date)
CREATE OR REPLACE FUNCTION public.create_team_task(p_title text, p_description text, p_scope text, p_team_id uuid, p_assignee_mssv text, p_priority text, p_due_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_mssv text;
  v_id uuid;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if p_scope is null or p_scope not in ('group', 'personal', 'global')
     or p_priority is null or p_priority not in ('low', 'med', 'high')
     or length(btrim(coalesce(p_title, ''))) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Thông tin nhiệm vụ không hợp lệ.');
  end if;

  if p_scope = 'global' then
    if not public.is_admin() then
      return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên mới được giao nhiệm vụ toàn xưởng.');
    end if;
  else
    if p_team_id is null then
      return jsonb_build_object('ok', false, 'message', 'Vui lòng chọn nhóm.');
    end if;
    if not public.is_admin() and not exists (
      select 1 from public.team_groups where id = p_team_id and leader_mssv = v_mssv
    ) then
      return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên hoặc đội trưởng mới được giao nhiệm vụ cho nhóm này.');
    end if;
  end if;

  if p_scope = 'personal' and not exists (
    select 1 from public.team_group_members where team_id = p_team_id and mssv = p_assignee_mssv
  ) then
    return jsonb_build_object('ok', false, 'message', 'Sinh viên được giao chưa thuộc nhóm.');
  end if;

  insert into public.team_tasks (title, description, scope, team_id, priority, due_date)
  values (btrim(p_title), coalesce(p_description, ''), p_scope,
          case when p_scope = 'global' then null else p_team_id end,
          p_priority, p_due_date)
  returning id into v_id;

  if p_scope = 'global' then
    insert into public.team_task_assignments (task_id, mssv)
    select v_id, mssv from public.students
    on conflict (task_id, mssv) do nothing;
  elsif p_scope = 'group' then
    insert into public.team_task_assignments (task_id, mssv)
    select v_id, mssv from public.team_group_members where team_id = p_team_id
    on conflict (task_id, mssv) do nothing;
  else
    insert into public.team_task_assignments (task_id, mssv) values (v_id, p_assignee_mssv);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

-- Function: get_leave_sessions()
CREATE OR REPLACE FUNCTION public.get_leave_sessions()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'message','Vui lòng đăng nhập.'); end if;
  return jsonb_build_object('ok',true,'sessions',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'session_name',s.session_name,'started_at',s.started_at,'duration_min',s.duration_min,'is_open',s.is_open
    ) order by s.started_at desc) from public.sessions s
  ),'[]'::jsonb));
end;
$function$;

-- Function: get_my_attendance_history(p_mssv text)
CREATE OR REPLACE FUNCTION public.get_my_attendance_history(p_mssv text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_my_mssv text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'Chưa đăng nhập.');
  end if;

  select btrim(mssv) into v_my_mssv from public.profiles where user_id = v_uid;
  if v_my_mssv is null or v_my_mssv <> btrim(p_mssv) then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền xem lịch sử của người khác.');
  end if;

  return jsonb_build_object('ok', true, 'records', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'session_name', s.session_name, 'started_at', s.started_at,
      'status', a.status, 'category', a.category,
      'note', a.note, 'checked_at', a.created_at
    ) order by a.created_at desc), '[]'::jsonb)
    from public.attendance a
    join public.sessions s on s.id = a.session_id
    where a.mssv = btrim(p_mssv)
  ));
end;
$function$;

-- Function: get_my_tasks()
CREATE OR REPLACE FUNCTION public.get_my_tasks()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare v_mssv text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'description', t.description, 'scope', t.scope,
        'team_id', t.team_id, 'team_name', coalesce(g.name, 'Toàn xưởng'), 'field', g.field,
        'priority', t.priority, 'due_date', t.due_date, 'status', a.status,
        'read_at', a.read_at, 'created_at', t.created_at,
        'completed_by_mssv', t.completed_by_mssv,
        'completed_by_name', (select s.name from public.students s where s.mssv = t.completed_by_mssv),
        'completed_at', t.completed_at,
        'claimed_by_mssv', t.claimed_by_mssv,
        'claimed_by_name', (select s.name from public.students s where s.mssv = t.claimed_by_mssv),
        'claimed_at', t.claimed_at
      ) order by t.created_at desc)
      from public.team_task_assignments a
      join public.team_tasks t on t.id = a.task_id
      left join public.team_groups g on g.id = t.team_id
      where a.mssv = v_mssv
    ), '[]'::jsonb),
    'managed_teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'field', field))
      from public.team_groups where leader_mssv = v_mssv
    ), '[]'::jsonb)
  );
end;
$function$;

-- Function: get_open_session()
CREATE OR REPLACE FUNCTION public.get_open_session()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
 select jsonb_build_object('id',s.id,'session_name',s.session_name,'duration_min',s.duration_min,'warn_before_min',s.warn_before_min,'started_at',s.started_at,'qr_token',s.qr_token,'qr_born_at',s.qr_born_at)
 from public.sessions s where s.is_open and (s.duration_min is null or s.started_at+s.duration_min*interval '1 minute'>now()) order by s.started_at desc limit 1
$function$;

-- Function: get_session_summary(p_session_id text)
CREATE OR REPLACE FUNCTION public.get_session_summary(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_sid uuid; v_total int; v_present int; v_absent int; v_unmarked int;
begin
 select id into v_sid from public.sessions where id::text=btrim(p_session_id);
 if v_sid is null then return jsonb_build_object('ok',false,'message','Không tìm thấy phiên.'); end if;
 select count(*) into v_total from public.students;
 select count(*) into v_present from public.attendance where session_id=v_sid and status='có mặt';
 select count(*) into v_absent from public.attendance where session_id=v_sid and status in ('vắng có phép','vắng không phép');
 v_unmarked:=v_total-v_present-v_absent;
 return jsonb_build_object('ok',true,'total',v_total,'present',v_present,'absent',v_absent,'unmarked',v_unmarked);
end $function$;

-- Function: get_team_availability(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.get_team_availability(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_team_member(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không thuộc nhóm này.');
  end if;

  return jsonb_build_object('ok', true, 'members', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'username', p.username,
        'full_name', coalesce(p.full_name, p.username),
        'mssv', p.mssv,
        'role', p.role,
        'team_role', tm.team_role,
        'is_leader', (t.leader_id = p.user_id),
        'is_deputy', (tm.team_role = 'deputy'),
        'blocks', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'slot_thu', ab.slot_thu,
            'slot_buoi', ab.slot_buoi,
            'reason', ab.reason
          )), '[]'::jsonb)
          from public.availability_blocks ab
          where ab.user_id = p.user_id
        )
      ) order by
        case tm.team_role
          when 'leader' then 1
          when 'deputy' then 2
          else 3
        end,
        coalesce(p.full_name, p.username)
    ), '[]'::jsonb)
    from public.team_members tm
    join public.profiles p on p.user_id = tm.user_id
    join public.teams t on t.id = tm.team_id
    where tm.team_id = p_team_id
  ));
end;
$function$;

-- Function: get_team_board(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.get_team_board(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_team_member(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không thuộc nhóm này.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'is_leader', public.is_team_leader(p_team_id),
    'tasks', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'description', t.description,
          'slot_thu', t.slot_thu,
          'slot_buoi', t.slot_buoi,
          'due_at', t.due_at,
          'priority', t.priority,
          'status', t.status,
          'created_at', t.created_at,
          'assignees', coalesce((
            select jsonb_agg(jsonb_build_object(
              'user_id', a.assignee_id,
              'full_name', coalesce(p.full_name, p.username),
              'status', a.status,
              'note', a.note
            ))
            from public.task_assignments a
            left join public.profiles p on p.user_id = a.assignee_id
            where a.task_id = t.id
          ), '[]'::jsonb)
        ) order by t.created_at desc
      ), '[]'::jsonb)
      from public.tasks t
      where t.team_id = p_team_id
        and (
          public.is_team_leader(p_team_id)
          or exists (
            select 1 from public.task_assignments a
            where a.task_id = t.id and a.assignee_id = auth.uid()
          )
        )
    )
  );
end;
$function$;

-- Function: handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_mssv text; v_name text;
begin
 v_mssv:=coalesce(nullif(btrim(new.raw_user_meta_data->>'mssv'),''),nullif(btrim(split_part(new.email,'@',1)),''));
 v_name:=coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),(select name from public.students where mssv=v_mssv),v_mssv);
 insert into public.profiles(user_id,username,full_name,mssv) values(new.id,v_mssv,v_name,v_mssv)
 on conflict(user_id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),mssv=coalesce(profiles.mssv,excluded.mssv);
 return new;
end $function$;

-- Function: is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
 select exists(select 1 from public.profiles p join public.admin_mssv a on a.mssv=p.mssv where p.user_id=auth.uid());
$function$;

-- Function: is_assigned_to_task(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.is_assigned_to_task(p_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.task_assignments
    where task_id = p_task_id and assignee_id = auth.uid()
  );
$function$;

-- Function: is_leader()
CREATE OR REPLACE FUNCTION public.is_leader()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('leader', 'deputy')
  );
$function$;

-- Function: is_team_leader(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.is_team_leader(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select public.is_admin()
    or exists (
      select 1 from public.teams
      where id = p_team_id and leader_id = auth.uid()
    )
    or exists (
      select 1 from public.team_members
      where team_id = p_team_id
        and user_id = auth.uid()
        and team_role = 'deputy'
    );
$function$;

-- Function: is_team_member(p_team_id uuid)
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select public.is_admin()
    or exists (
      select 1 from public.teams
      where id = p_team_id and leader_id = auth.uid()
    )
    or exists (
      select 1 from public.team_members
      where team_id = p_team_id and user_id = auth.uid()
    );
$function$;

-- Function: issue_qr_token(p_session_id text)
CREATE OR REPLACE FUNCTION public.issue_qr_token(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  s record;
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_win bigint;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
    into s
  from public.sessions
  where id::text = p_session_id
    and is_open;

  if not found then
    raise exception 'session not open' using errcode = 'P0002';
  end if;

  if coalesce(s.refresh_time, 20) <= 0
     or coalesce(s.refresh_time, 20) > 86400 then
    raise exception 'invalid refresh_time' using errcode = 'P0003';
  end if;

  if s.duration_min is not null
     and s.started_at + (s.duration_min * interval '1 minute') <= now() then
    raise exception 'session expired' using errcode = 'P0004';
  end if;

  v_win := v_now / (coalesce(s.refresh_time, 20) * 1000);

  return jsonb_build_object(
    'token',
    v_win::text || '.' || public._qr_sig(s.qr_secret, s.id::text, v_win),
    'server_now_ms',
    v_now
  );
end;
$function$;

-- Function: leader_assign_task(p_task_id uuid, p_assignee_id uuid, p_note text, p_force boolean)
CREATE OR REPLACE FUNCTION public.leader_assign_task(p_task_id uuid, p_assignee_id uuid, p_note text DEFAULT NULL::text, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_task public.tasks;
  v_block record;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;

  if not public.is_team_leader(v_task.team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được giao nhiệm vụ.');
  end if;

  -- Thành viên phải thuộc đúng nhóm đó
  if not exists (
    select 1 from public.team_members
    where team_id = v_task.team_id and user_id = p_assignee_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'Người được giao không thuộc nhóm này.');
  end if;

  -- Kiểm tra lịch rảnh (khoảng bận thủ công)
  if v_task.slot_thu is not null and v_task.slot_buoi is not null and not coalesce(p_force, false) then
    select * into v_block
    from public.availability_blocks
    where user_id = p_assignee_id
      and slot_thu = v_task.slot_thu
      and slot_buoi = v_task.slot_buoi;

    if found then
      return jsonb_build_object(
        'ok', false,
        'message', 'Thành viên đã báo bận trong khung giờ này. Hãy chọn người khác hoặc giao cưỡng chế.',
        'conflict', true
      );
    end if;
  end if;

  insert into public.task_assignments (task_id, assignee_id, note, assigned_by)
  values (p_task_id, p_assignee_id, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (task_id, assignee_id) do update
    set note = excluded.note, assigned_at = now(), assigned_by = auth.uid();

  return jsonb_build_object('ok', true, 'message', 'Đã giao nhiệm vụ thành công.');
end;
$function$;

-- Function: leader_create_task(p_team_id uuid, p_title text, p_description text, p_slot_thu integer, p_slot_buoi integer, p_due_at timestamp with time zone, p_priority text)
CREATE OR REPLACE FUNCTION public.leader_create_task(p_team_id uuid, p_title text, p_description text DEFAULT NULL::text, p_slot_thu integer DEFAULT NULL::integer, p_slot_buoi integer DEFAULT NULL::integer, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_priority text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_task public.tasks;
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng của nhóm mới được tạo nhiệm vụ.');
  end if;

  if v_title = '' then
    return jsonb_build_object('ok', false, 'message', 'Tiêu đề nhiệm vụ không được để trống.');
  end if;

  if p_slot_thu is not null and (p_slot_thu < 2 or p_slot_thu > 8) then
    return jsonb_build_object('ok', false, 'message', 'Thứ không hợp lệ (2–8).');
  end if;

  if p_slot_buoi is not null and (p_slot_buoi < 1 or p_slot_buoi > 3) then
    return jsonb_build_object('ok', false, 'message', 'Buổi không hợp lệ (1–3).');
  end if;

  if p_priority is null or p_priority not in ('low', 'normal', 'high') then
    p_priority := 'normal';
  end if;

  insert into public.tasks (
    team_id, title, description, slot_thu, slot_buoi, due_at, priority, created_by
  )
  values (
    p_team_id, v_title, nullif(btrim(coalesce(p_description, '')), ''),
    p_slot_thu, p_slot_buoi, p_due_at, p_priority, auth.uid()
  )
  returning * into v_task;

  return jsonb_build_object('ok', true, 'task', jsonb_build_object(
    'id', v_task.id, 'title', v_task.title, 'team_id', v_task.team_id
  ));
end;
$function$;

-- Function: leader_delete_task(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.leader_delete_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', true, 'message', 'Nhiệm vụ không tồn tại.');
  end if;

  if not public.is_team_leader(v_task.team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được xoá nhiệm vụ.');
  end if;

  delete from public.tasks where id = p_task_id;
  return jsonb_build_object('ok', true, 'message', 'Đã xoá nhiệm vụ.');
end;
$function$;

-- Function: leader_set_member_role(p_team_id uuid, p_user_id uuid, p_new_role text)
CREATE OR REPLACE FUNCTION public.leader_set_member_role(p_team_id uuid, p_user_id uuid, p_new_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_team public.teams;
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không có quyền phân vai trong nhóm này.');
  end if;

  if p_new_role is null or p_new_role not in ('leader', 'deputy', 'member') then
    return jsonb_build_object('ok', false, 'message', 'Vai trò không hợp lệ.');
  end if;

  if p_user_id = auth.uid() and not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không thể thay đổi vai trò của chính mình.');
  end if;

  if not exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = p_user_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'Người dùng này không thuộc nhóm.');
  end if;

  select * into v_team from public.teams where id = p_team_id;

  if p_new_role = 'leader' then
    if not public.is_admin() then
      return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được cấp Đội trưởng chính.');
    end if;

    if v_team.leader_id is not null and v_team.leader_id <> p_user_id then
      update public.team_members set team_role = 'member'
      where team_id = p_team_id and user_id = v_team.leader_id;
      update public.profiles set role = 'student'
      where user_id = v_team.leader_id and role = 'leader';
    end if;

    update public.teams set leader_id = p_user_id where id = p_team_id;
    update public.profiles set role = 'leader'
    where user_id = p_user_id and role <> 'admin';
    update public.team_members set team_role = 'leader'
    where team_id = p_team_id and user_id = p_user_id;

    return jsonb_build_object('ok', true, 'message', 'Đã cấp quyền Đội trưởng chính.');
  end if;

  if v_team.leader_id = p_user_id then
    return jsonb_build_object('ok', false, 'message', 'Hãy chuyển hoặc thu hồi Đội trưởng chính trước khi đổi vai trò.');
  end if;

  if p_new_role = 'deputy' then
    update public.team_members set team_role = 'deputy'
    where team_id = p_team_id and user_id = p_user_id;
    update public.profiles set role = 'deputy'
    where user_id = p_user_id and role not in ('admin', 'leader');
    return jsonb_build_object('ok', true, 'message', 'Đã cấp quyền Đội phó.');
  end if;

  update public.team_members set team_role = 'member'
  where team_id = p_team_id and user_id = p_user_id;
  update public.profiles set role = 'student'
  where user_id = p_user_id and role = 'deputy';

  return jsonb_build_object('ok', true, 'message', 'Đã đặt lại thành Thành viên.');
end;
$function$;

-- Function: leader_unassign_task(p_task_id uuid, p_assignee_id uuid)
CREATE OR REPLACE FUNCTION public.leader_unassign_task(p_task_id uuid, p_assignee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;

  if not public.is_team_leader(v_task.team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được gỡ nhiệm vụ.');
  end if;

  delete from public.task_assignments
  where task_id = p_task_id and assignee_id = p_assignee_id;

  return jsonb_build_object('ok', true, 'message', 'Đã gỡ nhiệm vụ khỏi thành viên.');
end;
$function$;

-- Function: leave_request_covers_session(p_date date, p_period text, p_started_at timestamp with time zone, p_duration_min integer)
CREATE OR REPLACE FUNCTION public.leave_request_covers_session(p_date date, p_period text, p_started_at timestamp with time zone, p_duration_min integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (p_started_at at time zone 'Asia/Ho_Chi_Minh')::date=p_date
    and (p_period='full_day' or (
      p_started_at < ((p_date + case p_period when 'morning' then time '12:00' when 'afternoon' then time '17:00' else time '23:59:59.999999' end) at time zone 'Asia/Ho_Chi_Minh') + interval '1 microsecond'
      and p_started_at + make_interval(mins => coalesce(p_duration_min,240)) > ((p_date + case p_period when 'morning' then time '00:00' when 'afternoon' then time '12:00' else time '17:00' end) at time zone 'Asia/Ho_Chi_Minh')));
$function$;

-- Function: my_teams()
CREATE OR REPLACE FUNCTION public.my_teams()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if public.is_admin() then
    return jsonb_build_object('ok', true, 'is_admin', true, 'teams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'leader_id', t.leader_id
      ) order by t.name), '[]'::jsonb)
      from public.teams t
    ));
  end if;

  return jsonb_build_object('ok', true, 'is_admin', false, 'teams', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'leader_id', t.leader_id
    ) order by t.name), '[]'::jsonb)
    from public.teams t
    where public.is_team_member(t.id)
  ));
end;
$function$;

-- Function: record_leave_request_event()
CREATE OR REPLACE FUNCTION public.record_leave_request_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
$function$;

-- Function: release_my_global_task(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.release_my_global_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_mssv text;
  v_scope text;
  v_completed_at timestamptz;
  v_claimed_by text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  select scope, completed_at, claimed_by_mssv
  into v_scope, v_completed_at, v_claimed_by
  from public.team_tasks
  where id = p_task_id
  for update;
  if not found or v_scope <> 'global' then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ toàn xưởng.');
  end if;
  if v_completed_at is not null then
    return jsonb_build_object('ok', false, 'already_completed', true, 'message', 'Nhiệm vụ đã hoàn thành nên không thể hủy nhận.');
  end if;
  if v_claimed_by is distinct from v_mssv then
    return jsonb_build_object('ok', false, 'message', 'Bạn không phải người đang nhận nhiệm vụ này.');
  end if;

  update public.team_tasks
  set claimed_by_mssv = null, claimed_at = null
  where id = p_task_id;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Function: rls_auto_enable()
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Function: server_now_ms()
CREATE OR REPLACE FUNCTION public.server_now_ms()
 RETURNS bigint
 LANGUAGE sql
AS $function$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$function$;

-- Function: server_replace_student_schedules_for_date(p_schedules jsonb, p_date date)
CREATE OR REPLACE FUNCTION public.server_replace_student_schedules_for_date(p_schedules jsonb, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_count int;
begin
  if p_date is null or p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    raise exception 'Ngày hoặc danh sách lịch không hợp lệ.';
  end if;

  delete from public.student_schedules
  where (start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week, buoi
  )
  select x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week, x.buoi
  from jsonb_to_recordset(p_schedules) as x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int, buoi smallint
  )
  where (x.start_time at time zone 'Asia/Ho_Chi_Minh')::date = p_date;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count, 'date', p_date);
end;
$function$;

-- Function: set_availability_block(p_slot_thu integer, p_slot_buoi integer, p_busy boolean, p_reason text)
CREATE OR REPLACE FUNCTION public.set_availability_block(p_slot_thu integer, p_slot_buoi integer, p_busy boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if p_slot_thu is null or p_slot_thu < 2 or p_slot_thu > 8 then
    return jsonb_build_object('ok', false, 'message', 'Thứ không hợp lệ (2–8).');
  end if;

  if p_slot_buoi is null or p_slot_buoi < 1 or p_slot_buoi > 3 then
    return jsonb_build_object('ok', false, 'message', 'Buổi không hợp lệ (1–3).');
  end if;

  if coalesce(p_busy, false) then
    insert into public.availability_blocks (user_id, slot_thu, slot_buoi, reason)
    values (auth.uid(), p_slot_thu, p_slot_buoi, nullif(btrim(coalesce(p_reason, '')), ''))
    on conflict (user_id, slot_thu, slot_buoi)
    do update set reason = excluded.reason, created_at = now();
  else
    delete from public.availability_blocks
    where user_id = auth.uid()
      and slot_thu = p_slot_thu
      and slot_buoi = p_slot_buoi;
  end if;

  return jsonb_build_object('ok', true, 'message', 'Đã cập nhật lịch rảnh.');
end;
$function$;

-- Function: shares_team_with(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.shares_team_with(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select public.is_admin() or exists (
    select 1
    from public.team_members me
    join public.team_members other
      on other.team_id = me.team_id
    where me.user_id = auth.uid()
      and other.user_id = p_user_id
  ) or exists (
    -- Đội trưởng xem được thành viên trong nhóm mình quản lý
    select 1
    from public.teams t
    join public.team_members m on m.team_id = t.id
    where t.leader_id = auth.uid() and m.user_id = p_user_id
  );
$function$;

-- Function: submit_anonymous_feedback(p_type text, p_content text)
CREATE OR REPLACE FUNCTION public.submit_anonymous_feedback(p_type text, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$ declare v_code text; begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'message','Vui lòng đăng nhập để gửi phản hồi.'); end if;
 if p_type not in ('gopy','suco','muasam','khac') or length(btrim(coalesce(p_content,''))) not between 1 and 5000 then return jsonb_build_object('ok',false,'message','Nội dung phản hồi không hợp lệ.'); end if;
 insert into public.anonymous_feedback(feedback_type,content) values(p_type,btrim(p_content)) returning public_code into v_code;
 return jsonb_build_object('ok',true,'code',v_code);
end; $function$;

-- Function: submit_attendance(p_session_id text, p_token text, p_mssv text, p_category text, p_note text, p_device_id text)
CREATE OR REPLACE FUNCTION public.submit_attendance(p_session_id text, p_token text, p_mssv text, p_category text, p_note text, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); s record; v_mssv text; v_name text; v_status text; v_cat text:=left(btrim(coalesce(p_category,'')),60); v_note text:=left(btrim(coalesce(p_note,'')),200); v_dev text:=btrim(coalesce(p_device_id,'')); v_sub text; v_room text;
begin
 if v_uid is null then return jsonb_build_object('ok',false,'code','NO_AUTH','message','Vui lòng đăng nhập trước khi điểm danh.'); end if;
 select btrim(mssv) into v_mssv from public.profiles where user_id=v_uid;
 if v_mssv is null or v_mssv='' then return jsonb_build_object('ok',false,'code','NO_MSSV','message','Tài khoản chưa liên kết MSSV.'); end if;
 if p_token is null or length(p_token)<20 or v_cat='' or v_dev='' then return jsonb_build_object('ok',false,'code','BAD_INPUT','message','Thiếu thông tin điểm danh.'); end if;
 select * into s from public.sessions where id::text=btrim(p_session_id);
 if not found or not s.is_open or (s.duration_min is not null and s.started_at+s.duration_min*interval '1 minute'<=now()) then
   return jsonb_build_object('ok',false,'code','SESSION_CLOSED','message','Phiên đã đóng hoặc hết giờ.'); end if;
 if s.qr_token<>p_token then return jsonb_build_object('ok',false,'code','TOKEN_INVALID','message','Mã QR không còn hiệu lực. Vui lòng quét mã mới.'); end if;
 select name into v_name from public.students where mssv=v_mssv;
 if not found then return jsonb_build_object('ok',false,'code','NOT_IN_CLASS','message','MSSV không có trong danh sách lớp.'); end if;
 select subject_name,room_name into v_sub,v_room from public.student_schedules where mssv=v_mssv and now()>=start_time and now()<=end_time order by start_time limit 1;
 if v_sub is not null and v_note='' then v_note:='Trùng lịch: '||v_sub||coalesce(' ('||v_room||')',''); end if;
 select status into v_status from public.attendance where session_id=s.id and mssv=v_mssv;
 if found then
   if v_status='có mặt' then return jsonb_build_object('ok',false,'code','ALREADY','message','Bạn đã điểm danh phiên này rồi.'); end if;
   update public.attendance set status='có mặt',category=v_cat,note=v_note,device_id=v_dev,created_at=now() where session_id=s.id and mssv=v_mssv;
   return jsonb_build_object('ok',true,'code','OK','name',v_name,'mssv',v_mssv);
 end if;
 if exists(select 1 from public.attendance where session_id=s.id and device_id=v_dev and mssv<>v_mssv) then
   return jsonb_build_object('ok',false,'code','DEVICE_USED','message','Thiết bị này đã điểm danh cho sinh viên khác.'); end if;
 insert into public.attendance(session_id,mssv,full_name,status,category,note,device_id) values(s.id,v_mssv,v_name,'có mặt',v_cat,v_note,v_dev);
 return jsonb_build_object('ok',true,'code','OK','name',v_name,'mssv',v_mssv,'session_id',s.id);
exception when unique_violation then return jsonb_build_object('ok',false,'code','ALREADY','message','Bạn đã điểm danh phiên này rồi.');
end $function$;

-- Function: submit_attendance_authenticated(p_session_id text, p_category text, p_note text, p_device_id text)
CREATE OR REPLACE FUNCTION public.submit_attendance_authenticated(p_session_id text, p_category text DEFAULT 'Đi học'::text, p_note text DEFAULT ''::text, p_device_id text DEFAULT NULL::text)
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
begin
  if v_uid is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'UNAUTHORIZED',
      'message', 'Bạn chưa đăng nhập.'
    );
  end if;

  select mssv into v_mssv
  from public.profiles
  where user_id = v_uid;

  v_mssv := btrim(coalesce(v_mssv, ''));
  if v_mssv = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_MSSV',
      'message', 'Tài khoản chưa được liên kết MSSV. Vui lòng liên hệ Admin.'
    );
  end if;

  select * into s
  from public.sessions
  where id::text = p_session_id;

  if not found or not s.is_open or (
    s.duration_min is not null
    and s.started_at + (s.duration_min * interval '1 minute') <= now()
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'SESSION_CLOSED',
      'message', 'Phiên điểm danh đã đóng hoặc đã hết giờ.'
    );
  end if;

  select name into v_name
  from public.students
  where mssv = v_mssv;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_IN_CLASS',
      'message', 'MSSV không có trong danh sách lớp!'
    );
  end if;

  select status into v_existing_status
  from public.attendance
  where session_id = s.id and mssv = v_mssv;

  if found then
    if v_existing_status in ('vắng có phép', 'vắng không phép') then
      update public.attendance
      set status = 'có mặt',
          category = left(btrim(coalesce(p_category, 'Đi học')), 60),
          note = left(btrim(coalesce(p_note, '')), 200),
          device_id = p_device_id,
          created_at = now()
      where session_id = s.id and mssv = v_mssv;

      return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv);
    else
      return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'Bạn đã điểm danh phiên này rồi.');
    end if;
  end if;

  if p_device_id is not null and btrim(p_device_id) <> '' then
    if exists (
      select 1 from public.attendance
      where session_id = s.id and device_id = p_device_id
    ) then
      return jsonb_build_object('ok', false, 'code', 'DEVICE_USED', 'message', 'Thiết bị này đã được dùng để điểm danh cho sinh viên khác trong phiên.');
    end if;
  end if;

  insert into public.attendance (
    session_id, mssv, full_name, status, category, note, device_id
  )
  values (
    s.id,
    v_mssv,
    v_name,
    'có mặt',
    left(btrim(coalesce(p_category, 'Đi học')), 60),
    left(btrim(coalesce(p_note, '')), 200),
    p_device_id
  );

  return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'MSSV hoặc thiết bị này đã điểm danh phiên này rồi.');
end;
$function$;

-- Function: team_add_member(p_team_id uuid, p_user_id uuid)
CREATE OR REPLACE FUNCTION public.team_add_member(p_team_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được thêm thành viên.');
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy hồ sơ người dùng.');
  end if;

  -- Một tài khoản chỉ thuộc một nhóm
  if exists (select 1 from public.team_members where user_id = p_user_id and team_id <> p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Người dùng này đã thuộc một nhóm khác.');
  end if;

  insert into public.team_members (team_id, user_id)
  values (p_team_id, p_user_id)
  on conflict (team_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'message', 'Đã thêm thành viên vào nhóm.');
end;
$function$;

-- Function: team_remove_member(p_team_id uuid, p_user_id uuid)
CREATE OR REPLACE FUNCTION public.team_remove_member(p_team_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được gỡ thành viên.');
  end if;

  -- Không cho gỡ chính đội trưởng (phải chuyển quyền trước)
  if exists (select 1 from public.teams where id = p_team_id and leader_id = p_user_id) then
    return jsonb_build_object('ok', false, 'message', 'Không thể gỡ Đội trưởng. Hãy cấp lại Đội trưởng trước.');
  end if;

  delete from public.team_members
  where team_id = p_team_id and user_id = p_user_id;

  return jsonb_build_object('ok', true, 'message', 'Đã gỡ thành viên khỏi nhóm.');
end;
$function$;

-- Function: update_my_task(p_task_id uuid, p_status text, p_mark_read boolean)
CREATE OR REPLACE FUNCTION public.update_my_task(p_task_id uuid, p_status text DEFAULT NULL::text, p_mark_read boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_mssv text;
  v_scope text;
  v_completed_at timestamptz;
  v_completed_by text;
  v_claimed_by text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if p_status is not null and p_status not in ('todo', 'doing', 'done') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  select t.scope, t.completed_at, t.completed_by_mssv, t.claimed_by_mssv
  into v_scope, v_completed_at, v_completed_by, v_claimed_by
  from public.team_tasks t
  join public.team_task_assignments a on a.task_id = t.id
  where t.id = p_task_id and a.mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ của bạn.');
  end if;

  if v_scope = 'global' and p_status = 'done' and v_completed_at is null
     and v_claimed_by is distinct from v_mssv then
    return jsonb_build_object('ok', false, 'message', 'Bạn cần nhận làm nhiệm vụ này trước khi hoàn thành.');
  end if;

  if v_scope in ('group', 'global') then
    if p_status = 'done' and v_completed_at is null then
      update public.team_tasks set completed_by_mssv = v_mssv, completed_at = now()
      where id = p_task_id and completed_at is null
      returning completed_by_mssv, completed_at into v_completed_by, v_completed_at;
      if found then
        update public.team_task_assignments
        set status = case when v_scope = 'global' or mssv = v_mssv then 'done' else status end,
            read_at = case when mssv = v_mssv and p_mark_read then coalesce(read_at, now()) else read_at end,
            updated_at = case when v_scope = 'global' or mssv = v_mssv then now() else updated_at end
        where task_id = p_task_id;
        return jsonb_build_object('ok', true, 'completed_by_me', true,
          'completed_by_mssv', v_completed_by, 'completed_at', v_completed_at);
      end if;
      select completed_by_mssv, completed_at into v_completed_by, v_completed_at
      from public.team_tasks where id = p_task_id;
      return jsonb_build_object('ok', true, 'already_completed', true,
        'completed_by_mssv', v_completed_by, 'completed_at', v_completed_at);
    elsif v_completed_at is not null then
      if p_mark_read then
        update public.team_task_assignments set read_at = coalesce(read_at, now())
        where task_id = p_task_id and mssv = v_mssv;
      end if;
      return jsonb_build_object('ok', true, 'already_completed', true,
        'completed_by_mssv', v_completed_by, 'completed_at', v_completed_at);
    end if;
  end if;

  update public.team_task_assignments
  set status = coalesce(p_status, status),
      read_at = case when p_mark_read then coalesce(read_at, now()) else read_at end,
      updated_at = now()
  where task_id = p_task_id and mssv = v_mssv;
  return jsonb_build_object('ok', true, 'completed_by_me', v_scope = 'personal' and p_status = 'done');
end;
$function$;

-- Function: update_task_status(p_task_id uuid, p_status text, p_note text)
CREATE OR REPLACE FUNCTION public.update_task_status(p_task_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if p_status is null or p_status not in ('todo', 'doing', 'done', 'cancelled') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  -- Chỉ được cập nhật nhiệm vụ được giao cho mình (đội trưởng/admin thì đã có quyền ở trên)
  if not exists (
    select 1 from public.task_assignments
    where task_id = p_task_id and assignee_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không được giao nhiệm vụ này.');
  end if;

  update public.task_assignments
  set status = p_status,
      note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
  where task_id = p_task_id and assignee_id = auth.uid();

  return jsonb_build_object('ok', true, 'message', 'Đã cập nhật tiến độ.');
end;
$function$;

-- =====================================================================
-- 7. TRIGGERS (Total: 10)
-- =====================================================================

-- Trigger: attendance_record_history_after_update on attendance
drop trigger if exists attendance_record_history_after_update on public.attendance;
CREATE TRIGGER attendance_record_history_after_update AFTER UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION capture_attendance_record_history();

-- Trigger: apply_approved_leave_attendance on leave_requests
drop trigger if exists apply_approved_leave_attendance on public.leave_requests;
CREATE TRIGGER apply_approved_leave_attendance AFTER UPDATE OF status, leave_date, leave_period ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION apply_approved_leave_to_attendance();

-- Trigger: leave_request_changes on leave_requests
drop trigger if exists leave_request_changes on public.leave_requests;
CREATE TRIGGER leave_request_changes BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION capture_leave_request_changes();

-- Trigger: leave_request_changes on leave_requests
drop trigger if exists leave_request_changes on public.leave_requests;
CREATE TRIGGER leave_request_changes BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION capture_leave_request_changes();

-- Trigger: record_leave_request_event on leave_requests
drop trigger if exists record_leave_request_event on public.leave_requests;
CREATE TRIGGER record_leave_request_event AFTER INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION record_leave_request_event();

-- Trigger: record_leave_request_event on leave_requests
drop trigger if exists record_leave_request_event on public.leave_requests;
CREATE TRIGGER record_leave_request_event AFTER INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION record_leave_request_event();

-- Trigger: assign_existing_global_tasks_after_student_insert on students
drop trigger if exists assign_existing_global_tasks_after_student_insert on public.students;
CREATE TRIGGER assign_existing_global_tasks_after_student_insert AFTER INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION assign_existing_global_tasks_to_student();

-- Trigger: assign_existing_group_tasks_after_member_insert on team_group_members
drop trigger if exists assign_existing_group_tasks_after_member_insert on public.team_group_members;
CREATE TRIGGER assign_existing_group_tasks_after_member_insert AFTER INSERT ON public.team_group_members FOR EACH ROW EXECUTE FUNCTION assign_existing_group_tasks_to_member();

-- Trigger: team_group_leader_is_member on team_groups
drop trigger if exists team_group_leader_is_member on public.team_groups;
CREATE TRIGGER team_group_leader_is_member AFTER INSERT OR UPDATE OF leader_mssv ON public.team_groups FOR EACH ROW EXECUTE FUNCTION add_team_leader_as_member();

-- Trigger: team_group_leader_is_member on team_groups
drop trigger if exists team_group_leader_is_member on public.team_groups;
CREATE TRIGGER team_group_leader_is_member AFTER INSERT OR UPDATE OF leader_mssv ON public.team_groups FOR EACH ROW EXECUTE FUNCTION add_team_leader_as_member();
