-- =====================================================================
-- LH-NaviX — Database Schema Snapshot (Verified against Supabase Remote)
-- Synchronized: 2026-10-12
-- Database Engine: PostgreSQL 17 (Supabase)
-- Note: Contains only verified working schema definitions (DDL). NO REAL USER DATA.
-- Ghost/abandoned functions referencing non-existent tables (teams, tasks) are omitted.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- =====================================================================
-- 1. TABLES & COLUMNS (24 verified tables)
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
  name text not null,
  is_active boolean default true not null
);

create table if not exists public.semester_settings (
  id boolean default true not null primary key check (id),
  start_date date not null default '2026-10-12',
  end_date date not null default '2027-02-03',
  updated_at timestamp with time zone default now() not null
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

create table if not exists public.team_task_activity_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.team_tasks(id) on delete set null,
  task_title text not null,
  team_id uuid references public.team_groups(id) on delete set null,
  team_name text,
  scope text default 'group',
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_mssv text,
  actor_name text not null default 'Thành viên',
  action_type text not null,
  assignee_mssv text,
  assignee_name text,
  old_value text,
  new_value text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
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
-- 2. CONSTRAINTS (74 verified constraints: Primary Keys, Foreign Keys, Unique, Check)
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
alter table only public.anonymous_feedback add constraint anonymous_feedback_status_check CHECK ((status = ANY (ARRAY['new'::text, 'seen'::text, 'processing'::text, 'resolved'::text, 'rejected'::text])));
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
-- 3. INDEXES (42 verified indexes)
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
alter table public.semester_settings enable row level security;
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
-- 5. RLS POLICIES (29 verified policies)
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
  using (
    is_admin()
    or exists (
      select 1
      from public.leave_requests r
      where r.id = leave_request_history.leave_request_id
        and (
          r.requested_by = (select auth.uid())
          or r.mssv = (
            select p.mssv
            from public.profiles p
            where p.user_id = (select auth.uid())
            limit 1
          )
        )
    )
  );

drop policy if exists "leave_requests_delete" on public.leave_requests;
create policy "leave_requests_delete" on public.leave_requests
  for delete
  to authenticated
  using (is_admin());

drop policy if exists "leave_requests_read" on public.leave_requests;
create policy "leave_requests_read" on public.leave_requests
  for select
  to authenticated
  using (
    is_admin()
    or requested_by = (select auth.uid())
    or mssv = (
      select p.mssv
      from public.profiles p
      where p.user_id = (select auth.uid())
      limit 1
    )
  );

drop policy if exists "leave_requests_submit" on public.leave_requests;
create policy "leave_requests_submit" on public.leave_requests
  for insert
  to authenticated
  with check (((requested_by = auth.uid()) AND (mssv = ( SELECT p.mssv
   FROM profiles p
  WHERE (p.user_id = auth.uid())))));

drop policy if exists "leave_requests_admin_submit" on public.leave_requests;
create policy "leave_requests_admin_submit" on public.leave_requests
  for insert
  to authenticated
  with check (is_admin() AND requested_by = auth.uid());

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
drop policy if exists student_schedules_read_own_or_admin on public.student_schedules;
create policy student_schedules_read_own_or_admin on public.student_schedules
  for select
  to authenticated
  using (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  );

drop policy if exists "read_students" on public.students;
drop policy if exists students_read_own_or_admin on public.students;
create policy students_read_own_or_admin on public.students
  for select
  to authenticated
  using (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  );

drop policy if exists "semester_settings_read" on public.semester_settings;
create policy "semester_settings_read" on public.semester_settings
  for select
  to public
  using (true);

drop policy if exists "semester_settings_admin_write" on public.semester_settings;
create policy "semester_settings_admin_write" on public.semester_settings
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

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
-- 6. FUNCTIONS / STORED PROCEDURES & RPC (Total: 51 verified functions)
-- =====================================================================

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

-- Function: admin_delete_team_task(p_task_id uuid)
CREATE OR REPLACE FUNCTION public.admin_delete_team_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_mssv text;
  v_actor_name text;
  v_task_title text;
  v_team_id uuid;
  v_scope text;
  v_team_name text;
  v_is_leader boolean := false;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Quản trị viên')
  into v_user_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_actor_name is null then
    v_actor_name := 'Quản trị viên';
  end if;

  select t.title, t.team_id, t.scope, coalesce(g.name, 'Toàn xưởng')
  into v_task_title, v_team_id, v_scope, v_team_name
  from public.team_tasks t
  left join public.team_groups g on g.id = t.team_id
  where t.id = p_task_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ cần xóa.');
  end if;

  if v_team_id is not null and v_user_mssv is not null then
    select exists (
      select 1 from public.team_groups where id = v_team_id and leader_mssv = v_user_mssv
    ) into v_is_leader;
  end if;

  if not public.is_admin() and not v_is_leader then
    return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên hoặc đội trưởng mới được xóa nhiệm vụ.');
  end if;

  -- Ghi log lịch sử hoạt động TRƯỚC KHI XÓA (bảo toàn dữ liệu vĩnh viễn)
  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    p_task_id, v_task_title, v_team_id, v_team_name, v_scope,
    auth.uid(), v_user_mssv, v_actor_name,
    'deleted', null, null,
    v_task_title, null,
    jsonb_build_object('deleted_at', now(), 'deleted_by', v_actor_name, 'scope', v_scope)
  );

  delete from public.team_tasks where id = p_task_id;

  return jsonb_build_object('ok', true, 'deleted_title', v_task_title);
end;
$function$;

-- Function: admin_get_task_activity_logs(...)
CREATE OR REPLACE FUNCTION public.admin_get_task_activity_logs(
  p_team_id uuid default null,
  p_task_id uuid default null,
  p_action_type text default null,
  p_limit int default 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_mssv text;
begin
  select mssv into v_mssv from public.profiles where user_id = auth.uid();
  if not public.is_admin() and (
    p_team_id is not null and not exists (
      select 1 from public.team_groups where id = p_team_id and leader_mssv = v_mssv
    )
  ) then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền xem lịch sử hoạt động.');
  end if;

  return jsonb_build_object('ok', true, 'logs', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'task_id', l.task_id,
      'task_title', l.task_title,
      'team_id', l.team_id,
      'team_name', l.team_name,
      'scope', l.scope,
      'actor_user_id', l.actor_user_id,
      'actor_mssv', l.actor_mssv,
      'actor_name', l.actor_name,
      'action_type', l.action_type,
      'assignee_mssv', l.assignee_mssv,
      'assignee_name', l.assignee_name,
      'old_value', l.old_value,
      'new_value', l.new_value,
      'metadata', l.metadata,
      'created_at', l.created_at
    ) order by l.created_at desc)
    from (
      select * from public.team_task_activity_logs
      where (p_task_id is null or task_id = p_task_id)
        and (p_team_id is null or team_id = p_team_id)
        and (p_action_type is null or action_type = p_action_type)
      order by created_at desc
      limit coalesce(p_limit, 100)
    ) l
  ), '[]'::jsonb));
end;
$function$;

-- Function: admin_update_team_task(...)
CREATE OR REPLACE FUNCTION public.admin_update_team_task(
  p_task_id uuid,
  p_title text,
  p_description text default null,
  p_priority text default null,
  p_due_date date default null,
  p_assignee_mssv text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_mssv text;
  v_actor_name text;
  v_old_title text;
  v_old_desc text;
  v_old_pri text;
  v_old_due date;
  v_team_id uuid;
  v_scope text;
  v_team_name text;
  v_old_assignee text;
  v_old_assignee_name text;
  v_new_assignee_name text;
  v_is_leader boolean := false;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Quản trị viên')
  into v_user_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_actor_name is null then
    v_actor_name := 'Quản trị viên';
  end if;

  select t.title, t.description, t.priority, t.due_date, t.team_id, t.scope, coalesce(g.name, 'Toàn xưởng')
  into v_old_title, v_old_desc, v_old_pri, v_old_due, v_team_id, v_scope, v_team_name
  from public.team_tasks t
  left join public.team_groups g on g.id = t.team_id
  where t.id = p_task_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;

  if v_team_id is not null and v_user_mssv is not null then
    select exists (
      select 1 from public.team_groups where id = v_team_id and leader_mssv = v_user_mssv
    ) into v_is_leader;
  end if;

  if not public.is_admin() and not v_is_leader then
    return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên hoặc đội trưởng mới được cập nhật nhiệm vụ.');
  end if;

  update public.team_tasks
  set title = coalesce(btrim(p_title), title),
      description = coalesce(p_description, description),
      priority = coalesce(p_priority, priority),
      due_date = p_due_date
  where id = p_task_id;

  if v_scope = 'personal' and p_assignee_mssv is not null then
    select a.mssv, s.name into v_old_assignee, v_old_assignee_name
    from public.team_task_assignments a
    left join public.students s on s.mssv = a.mssv
    where a.task_id = p_task_id limit 1;

    if v_old_assignee is distinct from p_assignee_mssv then
      select name into v_new_assignee_name from public.students where mssv = p_assignee_mssv;
      delete from public.team_task_assignments where task_id = p_task_id;
      insert into public.team_task_assignments (task_id, mssv) values (p_task_id, p_assignee_mssv);

      insert into public.team_task_activity_logs (
        task_id, task_title, team_id, team_name, scope,
        actor_user_id, actor_mssv, actor_name,
        action_type, assignee_mssv, assignee_name,
        old_value, new_value, metadata
      ) values (
        p_task_id, coalesce(btrim(p_title), v_old_title), v_team_id, v_team_name, v_scope,
        auth.uid(), v_user_mssv, v_actor_name,
        'reassigned', p_assignee_mssv, coalesce(v_new_assignee_name, p_assignee_mssv),
        coalesce(v_old_assignee_name, v_old_assignee, 'Chưa giao'),
        coalesce(v_new_assignee_name, p_assignee_mssv),
        jsonb_build_object('reassigned_at', now())
      );
    end if;
  end if;

  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    p_task_id, coalesce(btrim(p_title), v_old_title), v_team_id, v_team_name, v_scope,
    auth.uid(), v_user_mssv, v_actor_name,
    'updated', null, null,
    v_old_title, coalesce(btrim(p_title), v_old_title),
    jsonb_build_object('priority', coalesce(p_priority, v_old_pri), 'due_date', p_due_date)
  );

  return jsonb_build_object('ok', true);
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

-- Function: admin_open_session(p_name text, p_duration_min integer, p_warn_before_min integer)
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

  -- 1. Tự động ghi nhận vắng có phép: Học trường
  insert into public.attendance(session_id, mssv, full_name, status, category, note)
  select distinct on(st.mssv) v_new_id, st.mssv, st.name, 'vắng có phép', 'Học trường',
    'Lịch học: ' || sch.subject_name || coalesce(' (' || sch.room_name || ')', '')
  from public.students st
  join public.student_schedules sch on sch.mssv = st.mssv
  where sch.start_time < v_end and sch.end_time > v_start
  order by st.mssv, sch.start_time asc
  on conflict(session_id, mssv) do nothing;

  -- 2. Tự động ghi nhận vắng có phép: Đơn xin nghỉ phép ĐÃ DUYỆT bao phủ đúng phiên này
  insert into public.attendance(session_id, mssv, full_name, status, category, note)
  select distinct on(r.mssv) v_new_id, r.mssv, coalesce(st.name, r.mssv), 'vắng có phép', 'Xin nghỉ',
    coalesce('Nghỉ phép (' || case r.leave_period when 'morning' then 'Buổi sáng' when 'afternoon' then 'Buổi chiều' when 'evening' then 'Buổi tối' else 'Cả ngày' end || '): ' || r.reason, 'Nghỉ phép (đã duyệt)')
  from public.leave_requests r
  left join public.students st on st.mssv = r.mssv
  where r.status = 'approved'
    and public.leave_request_covers_session(r.leave_date, r.leave_period, v_start, v_dur)
  order by r.mssv, r.created_at desc
  on conflict(session_id, mssv) do nothing;

  return jsonb_build_object('ok', true, 'session_id', v_new_id, 'qr_token', v_token);
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
 if not public.is_admin() or p_status not in ('new','seen','processing','resolved','rejected') then return jsonb_build_object('ok',false,'message','Không có quyền hoặc trạng thái không hợp lệ.'); end if;
 update public.anonymous_feedback set status=p_status,updated_at=now() where id=p_id;
 return jsonb_build_object('ok',found);
end; $function$;

-- Function: admin_delete_anonymous_feedback(p_id uuid)
CREATE OR REPLACE FUNCTION public.admin_delete_anonymous_feedback(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$ begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền admin.'); end if;
 delete from public.anonymous_feedback where id=p_id;
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
  v_actor_name text;
  v_scope text;
  v_task_title text;
  v_completed_at timestamptz;
  v_claimed_by text;
  v_claimed_name text;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Thành viên')
  into v_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  select scope, title, completed_at, claimed_by_mssv
  into v_scope, v_task_title, v_completed_at, v_claimed_by
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

  -- Ghi log nhận việc
  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    p_task_id, v_task_title, null, 'Toàn xưởng', 'global',
    auth.uid(), v_mssv, v_actor_name,
    'claimed', v_mssv, v_actor_name,
    'Chưa ai nhận', 'Đã nhận làm',
    jsonb_build_object('claimed_at', now())
  );

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
  v_actor_name text;
  v_team_name text;
  v_assignee_name text;
  v_id uuid;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Quản trị viên')
  into v_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_actor_name is null then
    v_actor_name := case when public.is_admin() then 'Quản trị viên' else 'Thành viên' end;
  end if;

  if p_scope is null or p_scope not in ('group', 'personal', 'global')
     or p_priority is null or p_priority not in ('low', 'med', 'high')
     or length(btrim(coalesce(p_title, ''))) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Thông tin nhiệm vụ không hợp lệ.');
  end if;

  if p_scope = 'global' then
    if not public.is_admin() then
      return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên mới được giao nhiệm vụ toàn xưởng.');
    end if;
    v_team_name := 'Toàn xưởng';
    v_assignee_name := 'Tất cả sinh viên xưởng';
  else
    if p_team_id is null then
      return jsonb_build_object('ok', false, 'message', 'Vui lòng chọn nhóm.');
    end if;
    if not public.is_admin() and not exists (
      select 1 from public.team_groups where id = p_team_id and leader_mssv = v_mssv
    ) then
      return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên hoặc đội trưởng mới được giao nhiệm vụ cho nhóm này.');
    end if;
    select name into v_team_name from public.team_groups where id = p_team_id;
  end if;

  if p_scope = 'personal' then
    if not exists (
      select 1 from public.team_group_members where team_id = p_team_id and mssv = p_assignee_mssv
    ) then
      return jsonb_build_object('ok', false, 'message', 'Sinh viên được giao chưa thuộc nhóm.');
    end if;
    select name into v_assignee_name from public.students where mssv = p_assignee_mssv;
    if v_assignee_name is null then
      v_assignee_name := p_assignee_mssv;
    end if;
  elsif p_scope = 'group' then
    v_assignee_name := 'Cả nhóm ' || coalesce(v_team_name, '');
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

  -- Ghi log lịch sử hoạt động
  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    v_id, btrim(p_title), case when p_scope = 'global' then null else p_team_id end, v_team_name, p_scope,
    auth.uid(), v_mssv, v_actor_name,
    'created', p_assignee_mssv, v_assignee_name,
    null, p_priority,
    jsonb_build_object('priority', p_priority, 'due_date', p_due_date, 'description', coalesce(p_description, ''))
  );

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
 select jsonb_build_object(
   'id',s.id,
   'session_name',s.session_name,
   'duration_min',s.duration_min,
   'warn_before_min',s.warn_before_min,
   'started_at',s.started_at,
   'qr_token',s.qr_token,
   'qr_born_at',s.qr_born_at,
   'last_checkin',(
     select jsonb_build_object(
       'id',a.id::text || '_' || (extract(epoch from a.created_at)*1000)::bigint::text,
       'name',a.full_name
     )
     from public.attendance a
     where a.session_id=s.id
       and a.status in ('có mặt','đi muộn')
       and a.created_at >= now() - interval '20 seconds'
       and nullif(btrim(a.full_name),'') is not null
     order by a.created_at desc,a.id desc
     limit 1
   )
 )
 from public.sessions s where s.is_open and (s.duration_min is null or s.started_at+s.duration_min*interval '1 minute'>now()) order by s.started_at desc limit 1
$function$;

-- Function: get_session_summary(p_session_id text)
CREATE OR REPLACE FUNCTION public.get_session_summary(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_sid uuid; v_total int; v_present int; v_late int; v_absent int; v_unmarked int;
begin
 select id into v_sid from public.sessions where id::text=btrim(p_session_id);
 if v_sid is null then return jsonb_build_object('ok',false,'message','Không tìm thấy phiên.'); end if;
 select count(*) into v_total from public.students where coalesce(is_active,true);
 select count(*) into v_present from public.attendance a join public.students st on st.mssv=a.mssv and coalesce(st.is_active,true) where a.session_id=v_sid and a.status in ('có mặt','đi muộn');
 select count(*) into v_late from public.attendance a join public.students st on st.mssv=a.mssv and coalesce(st.is_active,true) where a.session_id=v_sid and a.status='đi muộn';
 select count(*) into v_absent from public.attendance a join public.students st on st.mssv=a.mssv and coalesce(st.is_active,true) where a.session_id=v_sid and a.status in ('vắng có phép','vắng không phép');
 v_unmarked:=greatest(v_total-v_present-v_absent,0);
 return jsonb_build_object('ok',true,'total',v_total,'present',v_present,'late',v_late,'absent',v_absent,'unmarked',v_unmarked);
end $function$;

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

-- Function: record_leave_request_event()
CREATE OR REPLACE FUNCTION public.record_leave_request_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare v_name text;
begin
  -- Chỉ thay đổi reviewer_note/updated_at (gửi chat) thì không tạo lịch sử sửa đơn.
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'reviewer_note' - 'updated_at')
         is not distinct from (to_jsonb(new) - 'reviewer_note' - 'updated_at') then
    return new;
  end if;

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
        || case
             when new.reviewer_note is null or btrim(new.reviewer_note) = '' then ''
             when left(btrim(new.reviewer_note), 1) in ('[', '{') then ''
             else ' Ghi chú: ' || btrim(new.reviewer_note)
           end,new.id);
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
create or replace function public.release_my_global_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_mssv text;
  v_actor_name text;
  v_scope text;
  v_task_title text;
  v_completed_at timestamptz;
  v_claimed_by text;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Thành viên')
  into v_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  select scope, title, completed_at, claimed_by_mssv
  into v_scope, v_task_title, v_completed_at, v_claimed_by
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

  -- Ghi log hủy nhận việc
  insert into public.team_task_activity_logs (
    task_id, task_title, team_id, team_name, scope,
    actor_user_id, actor_mssv, actor_name,
    action_type, assignee_mssv, assignee_name,
    old_value, new_value, metadata
  ) values (
    p_task_id, v_task_title, null, 'Toàn xưởng', 'global',
    auth.uid(), v_mssv, v_actor_name,
    'released', v_mssv, v_actor_name,
    'Đang nhận làm', 'Đã hủy nhận',
    jsonb_build_object('released_at', now())
  );

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
declare
  v_uid uuid:=auth.uid(); s record; v_mssv text; v_name text; v_status text;
  v_cat text:=left(btrim(coalesce(p_category,'')),60); v_note text:=left(btrim(coalesce(p_note,'')),200);
  v_dev text:=btrim(coalesce(p_device_id,'')); v_sub text; v_room text;
  v_late_min int := 15; v_final_status text := 'có mặt'; v_elapsed_min int := 0;
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

 select status into v_status from public.attendance where session_id=s.id and mssv=v_mssv;
 if found then
   if v_status in ('có mặt', 'đi muộn') then return jsonb_build_object('ok',false,'code','ALREADY','message','Bạn đã điểm danh phiên này rồi.'); end if;
   update public.attendance set status=v_final_status,category=v_cat,note=v_note,device_id=v_dev,created_at=now() where session_id=s.id and mssv=v_mssv;
   return jsonb_build_object('ok',true,'code','OK','name',v_name,'mssv',v_mssv,'status',v_final_status);
 end if;
 if exists(select 1 from public.attendance where session_id=s.id and device_id=v_dev and mssv<>v_mssv) then
   return jsonb_build_object('ok',false,'code','DEVICE_USED','message','Thiết bị này đã điểm danh cho sinh viên khác.'); end if;
 insert into public.attendance(session_id,mssv,full_name,status,category,note,device_id) values(s.id,v_mssv,v_name,v_final_status,v_cat,v_note,v_dev);
 return jsonb_build_object('ok',true,'code','OK','name',v_name,'mssv',v_mssv,'session_id',s.id,'status',v_final_status);
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
  v_late_min int := 15;
  v_final_status text := 'có mặt';
  v_elapsed_min int := 0;
  v_note text := left(btrim(coalesce(p_note, '')), 200);
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
    v_final_status,
    left(btrim(coalesce(p_category, 'Đi học')), 60),
    v_note,
    p_device_id
  );

  return jsonb_build_object('ok', true, 'code', 'OK', 'name', v_name, 'mssv', v_mssv, 'session_id', s.id, 'status', v_final_status);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'ALREADY', 'message', 'MSSV hoặc thiết bị này đã điểm danh phiên này rồi.');
end;
$function$;

-- Function: update_my_task(p_task_id uuid, p_status text, p_mark_read boolean)
create or replace function public.update_my_task(
  p_task_id uuid,
  p_status text default null,
  p_mark_read boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_mssv text;
  v_actor_name text;
  v_scope text;
  v_task_title text;
  v_team_id uuid;
  v_team_name text;
  v_completed_at timestamptz;
  v_completed_by text;
  v_claimed_by text;
  v_old_status text;
begin
  select p.mssv, coalesce(s.name, p.full_name, p.username, p.mssv, 'Thành viên')
  into v_mssv, v_actor_name
  from public.profiles p
  left join public.students s on s.mssv = p.mssv
  where p.user_id = auth.uid();

  if v_mssv is null then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  if p_status is not null and p_status not in ('todo', 'doing', 'done') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  select t.scope, t.title, t.team_id, coalesce(g.name, 'Toàn xưởng'), t.completed_at, t.completed_by_mssv, t.claimed_by_mssv, a.status
  into v_scope, v_task_title, v_team_id, v_team_name, v_completed_at, v_completed_by, v_claimed_by, v_old_status
  from public.team_tasks t
  join public.team_task_assignments a on a.task_id = t.id
  left join public.team_groups g on g.id = t.team_id
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

        -- Ghi log hoàn thành nhiệm vụ chung
        insert into public.team_task_activity_logs (
          task_id, task_title, team_id, team_name, scope,
          actor_user_id, actor_mssv, actor_name,
          action_type, assignee_mssv, assignee_name,
          old_value, new_value, metadata
        ) values (
          p_task_id, v_task_title, v_team_id, v_team_name, v_scope,
          auth.uid(), v_mssv, v_actor_name,
          'completed', v_mssv, v_actor_name,
          coalesce(v_old_status, 'todo'), 'done',
          jsonb_build_object('scope', v_scope)
        );

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

  -- Cập nhật nhiệm vụ cá nhân hoặc tiến độ thường
  update public.team_task_assignments
  set status = coalesce(p_status, status),
      read_at = case when p_mark_read then coalesce(read_at, now()) else read_at end,
      updated_at = now()
  where task_id = p_task_id and mssv = v_mssv;

  -- Ghi log nếu trạng thái thay đổi
  if p_status is not null and p_status is distinct from v_old_status then
    insert into public.team_task_activity_logs (
      task_id, task_title, team_id, team_name, scope,
      actor_user_id, actor_mssv, actor_name,
      action_type, assignee_mssv, assignee_name,
      old_value, new_value, metadata
    ) values (
      p_task_id, v_task_title, v_team_id, v_team_name, v_scope,
      auth.uid(), v_mssv, v_actor_name,
      case when p_status = 'done' then 'completed' else 'status_changed' end,
      v_mssv, v_actor_name,
      coalesce(v_old_status, 'todo'), p_status,
      jsonb_build_object('scope', v_scope)
    );
  end if;

  return jsonb_build_object('ok', true, 'completed_by_me', v_scope = 'personal' and p_status = 'done');
end;
$function$;

-- Function: get_semester_settings()
CREATE OR REPLACE FUNCTION public.get_semester_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_rec record;
BEGIN
  SELECT start_date, end_date, updated_at
  INTO v_rec
  FROM public.semester_settings
  WHERE id = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'start_date', '2026-10-12', 'end_date', '2027-02-03');
  END IF;

  RETURN jsonb_build_object('ok', true, 'start_date', v_rec.start_date, 'end_date', v_rec.end_date, 'updated_at', v_rec.updated_at);
END;
$function$;

-- Function: admin_save_semester_settings(p_start_date date, p_end_date date)
CREATE OR REPLACE FUNCTION public.admin_save_semester_settings(p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Khoảng ngày không hợp lệ. Ngày bắt đầu phải trước ngày kết thúc.');
  END IF;

  INSERT INTO public.semester_settings (id, start_date, end_date, updated_at)
  VALUES (true, p_start_date, p_end_date, now())
  ON CONFLICT (id) DO UPDATE
    SET start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'start_date', p_start_date, 'end_date', p_end_date);
END;
$function$;

-- Function: admin_add_student(p_mssv text, p_name text)
CREATE OR REPLACE FUNCTION public.admin_add_student(p_mssv text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  IF v_mssv = '' OR v_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'MSSV và họ tên sinh viên không được để trống.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.students WHERE mssv = v_mssv) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sinh viên với MSSV ' || v_mssv || ' đã tồn tại trong danh sách.');
  END IF;

  INSERT INTO public.students (mssv, name, is_active)
  VALUES (v_mssv, v_name, true);

  RETURN jsonb_build_object('ok', true, 'mssv', v_mssv, 'name', v_name);
END;
$function$;

-- Function: admin_set_student_active(p_mssv text, p_is_active boolean)
CREATE OR REPLACE FUNCTION public.admin_set_student_active(p_mssv text, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  SELECT name INTO v_name FROM public.students WHERE mssv = v_mssv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên có MSSV: ' || v_mssv);
  END IF;

  UPDATE public.students
  SET is_active = coalesce(p_is_active, true)
  WHERE mssv = v_mssv;

  RETURN jsonb_build_object('ok', true, 'mssv', v_mssv, 'name', v_name, 'is_active', p_is_active);
END;
$function$;

-- Function: admin_get_student_delete_impact(p_mssv text)
CREATE OR REPLACE FUNCTION public.admin_get_student_delete_impact(p_mssv text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_name text;
  v_leave_count int := 0;
  v_sched_count int := 0;
  v_group_member_count int := 0;
  v_task_assign_count int := 0;
  v_attendance_count int := 0;
  v_reset_req_count int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  SELECT name INTO v_name FROM public.students WHERE mssv = v_mssv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên.');
  END IF;

  SELECT count(*) INTO v_leave_count FROM public.leave_requests WHERE mssv = v_mssv;
  SELECT count(*) INTO v_sched_count FROM public.student_schedules WHERE mssv = v_mssv;
  SELECT count(*) INTO v_group_member_count FROM public.team_group_members WHERE mssv = v_mssv;
  SELECT count(*) INTO v_task_assign_count FROM public.team_task_assignments WHERE mssv = v_mssv;
  SELECT count(*) INTO v_attendance_count FROM public.attendance WHERE mssv = v_mssv;
  SELECT count(*) INTO v_reset_req_count FROM public.password_reset_requests WHERE mssv = v_mssv;

  RETURN jsonb_build_object(
    'ok', true,
    'mssv', v_mssv,
    'name', v_name,
    'leave_count', v_leave_count,
    'schedules_count', v_sched_count,
    'group_member_count', v_group_member_count,
    'task_assign_count', v_task_assign_count,
    'attendance_count', v_attendance_count,
    'reset_req_count', v_reset_req_count
  );
END;
$function$;

-- Function: admin_delete_student(p_mssv text)
CREATE OR REPLACE FUNCTION public.admin_delete_student(p_mssv text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  SELECT name INTO v_name FROM public.students WHERE mssv = v_mssv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên để xóa.');
  END IF;

  DELETE FROM public.students WHERE mssv = v_mssv;

  RETURN jsonb_build_object('ok', true, 'mssv', v_mssv, 'name', v_name);
END;
$function$;

-- Function: admin_sync_student_schedules_for_range(p_schedules jsonb, p_from_date date, p_to_date date, p_mssv text)
CREATE OR REPLACE FUNCTION public.admin_sync_student_schedules_for_range(
  p_schedules jsonb,
  p_from_date date,
  p_to_date date,
  p_mssv text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_count int := 0;
  v_deleted int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  IF p_from_date IS NULL OR p_to_date IS NULL OR p_from_date > p_to_date THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Khoảng ngày không hợp lệ. Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
  END IF;

  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Danh sách lịch học gửi lên không hợp lệ.');
  END IF;

  IF v_mssv <> '' THEN
    DELETE FROM public.student_schedules
    WHERE mssv = v_mssv
      AND (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_from_date
      AND (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_to_date;
  ELSE
    DELETE FROM public.student_schedules
    WHERE (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_from_date
      AND (start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_to_date;
  END IF;
  GET DIAGNOSTICS v_deleted = row_count;

  INSERT INTO public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week, buoi
  )
  SELECT DISTINCT ON (x.mssv, x.subject_name, x.start_time, x.end_time)
         x.mssv, x.subject_name, x.room_name, x.teacher_name,
         x.start_time, x.end_time, x.day_of_week, x.buoi
  FROM jsonb_to_recordset(p_schedules) AS x(
    mssv text, subject_name text, room_name text, teacher_name text,
    start_time timestamptz, end_time timestamptz, day_of_week int, buoi smallint
  )
  WHERE (x.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_from_date
    AND (x.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_to_date
    AND (v_mssv = '' OR x.mssv = v_mssv);

  GET DIAGNOSTICS v_count = row_count;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'deleted', v_deleted,
    'from_date', p_from_date,
    'to_date', p_to_date,
    'mssv', CASE WHEN v_mssv = '' THEN NULL ELSE v_mssv END
  );
END;
$function$;

-- =====================================================================
-- 7. TRIGGERS (Total: 10 verified triggers across 5 tables)
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

-- =====================================================================
-- 8. STUDENT FACE DATA (5-angle face training for attendance)
-- =====================================================================
create table if not exists public.student_face_data (
  mssv text not null references public.students(mssv) on delete cascade,
  descriptors jsonb not null default '[]'::jsonb,
  thumbnails jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone default now() not null,
  constraint student_face_data_pkey primary key (mssv)
);

grant select, insert, update, delete on table public.student_face_data to authenticated;

alter table public.student_face_data enable row level security;

drop policy if exists "student_face_data_select" on public.student_face_data;
create policy "student_face_data_select" on public.student_face_data
  for select to authenticated
  using (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  );

drop policy if exists "student_face_data_upsert" on public.student_face_data;
create policy "student_face_data_upsert" on public.student_face_data
  for all to authenticated
  using (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  );

drop policy if exists "student_face_data_delete" on public.student_face_data;
create policy "student_face_data_delete" on public.student_face_data
  for delete to authenticated
  using (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  );

-- =====================================================================
-- 9. KIOSK FACE CHECKIN RPC
-- =====================================================================
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

  select status into v_old_status from public.attendance where session_id = v_sid and mssv = v_mssv;
  if v_old_status in ('có mặt', 'đi muộn') then
    -- Đã điểm danh trước đó: vẫn cập nhật created_at = now() để Kiosk nhận tín hiệu và hiển thị tên xác nhận!
    update public.attendance
    set created_at = now(),
        full_name = coalesce(full_name, v_name)
    where session_id = v_sid and mssv = v_mssv;

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
    full_name = coalesce(excluded.full_name, attendance.full_name, v_name),
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

create or replace function public.kiosk_upsert_face_data(
  p_mssv text,
  p_descriptors jsonb,
  p_thumbnails jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mssv text := btrim(coalesce(p_mssv, ''));
begin
  if not public.is_admin() then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORBIDDEN',
      'message', 'Chỉ quản trị viên mới được cập nhật dữ liệu khuôn mặt.'
    );
  end if;

  if v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MSSV', 'message', 'MSSV không hợp lệ.');
  end if;

  if p_descriptors is null or jsonb_typeof(p_descriptors) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DATA', 'message', 'Dữ liệu khuôn mặt không hợp lệ.');
  end if;

  if p_thumbnails is not null and jsonb_typeof(p_thumbnails) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DATA', 'message', 'Dữ liệu ảnh mẫu không hợp lệ.');
  end if;

  if not exists (select 1 from public.students where mssv = v_mssv) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'MSSV không tồn tại trong danh sách sinh viên.');
  end if;

  insert into public.student_face_data (mssv, descriptors, thumbnails, updated_at)
  values (v_mssv, p_descriptors, coalesce(p_thumbnails, '[]'::jsonb), now())
  on conflict (mssv) do update
  set descriptors = excluded.descriptors,
      thumbnails = excluded.thumbnails,
      updated_at = now();

  return jsonb_build_object('ok', true, 'mssv', v_mssv);
end;
$function$;

grant execute on function public.kiosk_upsert_face_data(text, jsonb, jsonb) to authenticated;

-- Table students
alter table if exists public.students add column if not exists avatar text;
alter table if exists public.students add column if not exists class text;
alter table if exists public.students add column if not exists phone text;

grant select on public.students to authenticated;
grant all on public.students to authenticated, service_role;

-- =====================================================================
-- 10. STUDENT AVATAR (Storage bucket) & FACE DATA TRAINING EXPORT
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_read_public" on storage.objects;
create policy "avatars_read_public" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
  );

create or replace function public.student_set_my_avatar(p_avatar text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_mssv text;
  v_avatar text := nullif(btrim(coalesce(p_avatar, '')), '');
begin
  select p.mssv into v_mssv from public.profiles p where p.user_id = auth.uid();
  if v_mssv is null or v_mssv = '' then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV. Vui lòng liên hệ Admin.');
  end if;

  if v_avatar is not null and v_avatar !~* '^(https?://|images/|/)' then
    return jsonb_build_object('ok', false, 'message', 'Đường dẫn ảnh không hợp lệ.');
  end if;

  update public.students set avatar = v_avatar where mssv = v_mssv;
  return jsonb_build_object('ok', true, 'avatar', v_avatar);
end;
$function$;

grant execute on function public.student_set_my_avatar(text) to authenticated;

create or replace function public.admin_update_avatar(
  p_mssv text,
  p_avatar text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_target_mssv text := btrim(coalesce(p_mssv, ''));
  v_avatar text := nullif(btrim(coalesce(p_avatar, '')), '');
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên mới có quyền thực hiện.');
  end if;

  if v_target_mssv = '' then
    select p.mssv into v_target_mssv from public.profiles p where p.user_id = auth.uid();
  end if;

  if v_target_mssv is null or v_target_mssv = '' then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  if v_avatar is not null and char_length(v_avatar) > 2000000 then
    return jsonb_build_object('ok', false, 'message', 'Ảnh đại diện quá lớn.');
  end if;

  update public.students set avatar = v_avatar where mssv = v_target_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên có MSSV: ' || v_target_mssv);
  end if;

  update public.profiles set avatar_url = v_avatar where mssv = v_target_mssv;

  return jsonb_build_object('ok', true, 'mssv', v_target_mssv, 'avatar', v_avatar);
end;
$function$;

grant execute on function public.admin_update_avatar(text, text) to authenticated;

create or replace function public.admin_set_my_avatar(p_avatar text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_mssv text;
  v_avatar text := nullif(btrim(coalesce(p_avatar, '')), '');
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên mới có quyền thực hiện.');
  end if;

  select p.mssv into v_mssv from public.profiles p where p.user_id = auth.uid();
  if v_mssv is null or v_mssv = '' then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  if v_avatar is not null and char_length(v_avatar) > 2000000 then
    return jsonb_build_object('ok', false, 'message', 'Ảnh đại diện quá lớn.');
  end if;

  update public.students set avatar = v_avatar where mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên có MSSV: ' || v_mssv);
  end if;

  update public.profiles set avatar_url = v_avatar where mssv = v_mssv;

  return jsonb_build_object('ok', true, 'avatar', v_avatar, 'mssv', v_mssv);
end;
$function$;

grant execute on function public.admin_set_my_avatar(text) to authenticated;

create or replace function public.admin_export_face_data()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên được phép xuất dữ liệu.');
  end if;

  select jsonb_build_object(
    'ok', true,
    'exported_at', now(),
    'count', count(*),
    'students', coalesce(jsonb_agg(jsonb_build_object(
      'mssv', s.mssv,
      'name', s.name,
      'class', s.class,
      'avatar', s.avatar,
      'updated_at', f.updated_at,
      'descriptors', coalesce(f.descriptors, '[]'::jsonb),
      'thumbnails', coalesce(f.thumbnails, '[]'::jsonb)
    ) order by s.mssv), '[]'::jsonb)
  )
  into v_result
  from public.student_face_data f
  join public.students s on s.mssv = f.mssv
  where (f.descriptors is not null and jsonb_array_length(f.descriptors) > 0)
     or (f.thumbnails is not null and jsonb_array_length(f.thumbnails) > 0);

  return v_result;
end;
$function$;

grant execute on function public.admin_export_face_data() to authenticated;

-- =====================================================================
-- 11. SIẾT RLS BẢNG students (chỉ admin ghi qua RPC definer)
-- Bỏ lỗ hổng: mọi authenticated (kể cả sinh viên) tự do thêm/sửa/xóa.
-- =====================================================================
drop policy if exists "students_write_all" on public.students;

revoke all on table public.students from anon;
revoke all on table public.students from authenticated;
grant select on table public.students to authenticated;
grant all on table public.students to service_role;

-- =====================================================================
-- 12. YÊU CẦU ĐẶT LẠI MẬT KHẨU (RPC có giới hạn tần suất)
-- =====================================================================
create or replace function public.request_password_reset(p_mssv text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mssv text := upper(btrim(coalesce(p_mssv, '')));
begin
  if v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MSSV', 'message', 'Vui lòng nhập MSSV.');
  end if;

  if not exists (select 1 from public.students where mssv = v_mssv) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'MSSV không tồn tại trong hệ thống.');
  end if;

  if exists (
    select 1 from public.password_reset_requests
    where mssv = v_mssv and status = 'pending'
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'PENDING',
      'message', 'Yêu cầu của bạn đang chờ Admin xử lý. Không thể gửi thêm.'
    );
  end if;

  if exists (
    select 1 from public.password_reset_requests
    where mssv = v_mssv and created_at > now() - interval '5 minutes'
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'COOLDOWN',
      'message', 'Bạn vừa gửi yêu cầu. Vui lòng thử lại sau ít phút.'
    );
  end if;

  insert into public.password_reset_requests (mssv) values (v_mssv);

  return jsonb_build_object(
    'ok', true,
    'message', 'Đã gửi yêu cầu đến Admin. Vui lòng nhận mật khẩu tạm từ Admin.'
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'code', 'PENDING',
      'message', 'Yêu cầu của bạn đang chờ Admin xử lý. Không thể gửi thêm.'
    );
end;
$function$;

grant execute on function public.request_password_reset(text) to anon, authenticated;

drop policy if exists "Anon can insert requests" on public.password_reset_requests;
revoke insert, update, delete on table public.password_reset_requests from anon;
