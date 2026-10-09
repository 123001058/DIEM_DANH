


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_qr_sig"("p_secret" "text", "p_session" "text", "p_win" bigint) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select left(
    encode(
      hmac(p_session || ':' || p_win::text, p_secret, 'sha256'),
      'hex'
    ),
    24
  )
$$;


ALTER FUNCTION "public"."_qr_sig"("p_secret" "text", "p_session" "text", "p_win" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_batch_set_status"("p_session_id" "text", "p_mssv_list" "text"[], "p_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "public"."admin_batch_set_status"("p_session_id" "text", "p_mssv_list" "text"[], "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_close_session"("p_session_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_sid uuid;
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 if p_session_id is not null and btrim(p_session_id)<>'' then select id into v_sid from public.sessions where id::text=btrim(p_session_id);
 else select id into v_sid from public.sessions where is_open limit 1; end if;
 if v_sid is not null then
   insert into public.attendance(session_id,mssv,full_name,status,category,note)
   select v_sid,st.mssv,st.name,'vắng không phép','Xưởng','Không có lịch trường & không quét QR'
   from public.students st where not exists(select 1 from public.attendance a where a.session_id=v_sid and a.mssv=st.mssv)
   on conflict(session_id,mssv) do nothing;
   update public.sessions set is_open=false where id=v_sid;
 end if;
 update public.sessions set is_open=false where is_open;
 return jsonb_build_object('ok',true);
end $$;


ALTER FUNCTION "public"."admin_close_session"("p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_complete_reset_request"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_complete_reset_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_team"("p_name" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_create_team"("p_name" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_attendance"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_att_count int; v_sess_count int;
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 delete from public.attendance; get diagnostics v_att_count=row_count;
 delete from public.sessions where is_open=false; get diagnostics v_sess_count=row_count;
 return jsonb_build_object('ok',true,'deleted',v_att_count,'sessions_deleted',v_sess_count);
end $$;


ALTER FUNCTION "public"."admin_delete_attendance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_history"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_count int;
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 delete from public.sessions where is_open=false; get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'deleted',v_count);
end $$;


ALTER FUNCTION "public"."admin_delete_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_session"("p_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_delete_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_team"("p_team_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_delete_team"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_audit_logs"("p_session_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_get_audit_logs"("p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_users"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_list_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_open_session"("p_name" "text", "p_duration_min" integer, "p_warn_before_min" integer DEFAULT 5) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "public"."admin_open_session"("p_name" "text", "p_duration_min" integer, "p_warn_before_min" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_regenerate_qr"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_token text; v_sid uuid;
begin
 if not public.is_admin() then return jsonb_build_object('ok',false,'message','Không có quyền.'); end if;
 v_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 update public.sessions set qr_token=v_token,qr_born_at=now() where is_open returning id into v_sid;
 if v_sid is null then return jsonb_build_object('ok',false,'message','Không có phiên nào đang mở.'); end if;
 return jsonb_build_object('ok',true,'qr_token',v_token,'qr_born_at',now());
end $$;


ALTER FUNCTION "public"."admin_regenerate_qr"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reopen_session"("p_session_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "public"."admin_reopen_session"("p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_revoke_leader"("p_team_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_revoke_leader"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_status"("p_session_id" "text", "p_mssv" "text", "p_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_name text;
  v_sid uuid;
  v_old_status text;
  v_admin_email text := coalesce(auth.jwt() ->> 'email', 'Admin');
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if p_status not in ('có mặt','đi muộn','vắng có phép','vắng không phép') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  select id into v_sid from public.sessions where id::text = p_session_id;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;

  select name into v_name from public.students where mssv = p_mssv;
  if v_name is null then
    select full_name into v_name from public.attendance
    where session_id = v_sid and mssv = p_mssv limit 1;
    v_name := coalesce(v_name, p_mssv);
  end if;

  select status into v_old_status from public.attendance
  where session_id = v_sid and mssv = p_mssv;

  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  values (v_sid, p_mssv, v_name, p_status, 'Admin', coalesce(p_reason, ''))
  on conflict (session_id, mssv) do update set
    status = excluded.status,
    note = case when excluded.note <> '' then excluded.note else public.attendance.note end;

  insert into public.attendance_audit_logs (
    session_id, mssv, student_name, old_status, new_status, changed_by, reason, changed_at
  ) values (
    v_sid, p_mssv, v_name, coalesce(v_old_status, 'chưa điểm danh'), p_status,
    v_admin_email, nullif(btrim(coalesce(p_reason, '')), ''), now()
  );

  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."admin_set_status"("p_session_id" "text", "p_mssv" "text", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_team_leader"("p_team_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_set_team_leader"("p_team_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_sync_student_schedules"("p_schedules" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_count int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Payload lịch học phải là một mảng JSON.');
  end if;

  if jsonb_array_length(p_schedules) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Danh sách lịch học trống.');
  end if;

  delete from public.student_schedules where id is not null;

  insert into public.student_schedules (
    mssv, subject_name, room_name, teacher_name, start_time, end_time, day_of_week
  )
  select
    x.mssv, x.subject_name, x.room_name, x.teacher_name,
    x.start_time, x.end_time, x.day_of_week
  from jsonb_to_recordset(p_schedules) as x(
    mssv text,
    subject_name text,
    room_name text,
    teacher_name text,
    start_time timestamptz,
    end_time timestamptz,
    day_of_week int
  );

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;


ALTER FUNCTION "public"."admin_sync_student_schedules"("p_schedules" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_today_sessions"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "public"."admin_today_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_assignment"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id and public.is_team_leader(t.team_id)
  );
$$;


ALTER FUNCTION "public"."can_manage_assignment"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_attendance_history"("p_mssv" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_my_attendance_history"("p_mssv" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_open_session"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
 select jsonb_build_object('id',s.id,'session_name',s.session_name,'duration_min',s.duration_min,'warn_before_min',s.warn_before_min,'started_at',s.started_at,'qr_token',s.qr_token,'qr_born_at',s.qr_born_at)
 from public.sessions s where s.is_open and (s.duration_min is null or s.started_at+s.duration_min*interval '1 minute'>now()) order by s.started_at desc limit 1
$$;


ALTER FUNCTION "public"."get_open_session"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_summary"("p_session_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_sid uuid; v_total int; v_present int; v_absent int; v_unmarked int;
begin
 select id into v_sid from public.sessions where id::text=btrim(p_session_id);
 if v_sid is null then return jsonb_build_object('ok',false,'message','Không tìm thấy phiên.'); end if;
 select count(*) into v_total from public.students;
 select count(*) into v_present from public.attendance where session_id=v_sid and status='có mặt';
 select count(*) into v_absent from public.attendance where session_id=v_sid and status in ('vắng có phép','vắng không phép');
 v_unmarked:=v_total-v_present-v_absent;
 return jsonb_build_object('ok',true,'total',v_total,'present',v_present,'absent',v_absent,'unmarked',v_unmarked);
end $$;


ALTER FUNCTION "public"."get_session_summary"("p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_availability"("p_team_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_team_availability"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_board"("p_team_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_team_board"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_mssv text; v_name text;
begin
 v_mssv:=coalesce(nullif(btrim(new.raw_user_meta_data->>'mssv'),''),nullif(btrim(split_part(new.email,'@',1)),''));
 v_name:=coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),(select name from public.students where mssv=v_mssv),v_mssv);
 insert into public.profiles(user_id,username,full_name,mssv) values(new.id,v_mssv,v_name,v_mssv)
 on conflict(user_id) do update set full_name=coalesce(excluded.full_name,profiles.full_name),mssv=coalesce(profiles.mssv,excluded.mssv);
 return new;
end $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
 select exists(select 1 from public.profiles p join public.admin_mssv a on a.mssv=p.mssv where p.user_id=auth.uid());
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_assigned_to_task"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.task_assignments
    where task_id = p_task_id and assignee_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_assigned_to_task"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_leader"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('leader', 'deputy')
  );
$$;


ALTER FUNCTION "public"."is_leader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_leader"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."is_team_leader"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_member"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  select public.is_admin()
    or exists (
      select 1 from public.teams
      where id = p_team_id and leader_id = auth.uid()
    )
    or exists (
      select 1 from public.team_members
      where team_id = p_team_id and user_id = auth.uid()
    );
$$;


ALTER FUNCTION "public"."is_team_member"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_qr_token"("p_session_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."issue_qr_token"("p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leader_assign_task"("p_task_id" "uuid", "p_assignee_id" "uuid", "p_note" "text" DEFAULT NULL::"text", "p_force" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."leader_assign_task"("p_task_id" "uuid", "p_assignee_id" "uuid", "p_note" "text", "p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leader_create_task"("p_team_id" "uuid", "p_title" "text", "p_description" "text" DEFAULT NULL::"text", "p_slot_thu" integer DEFAULT NULL::integer, "p_slot_buoi" integer DEFAULT NULL::integer, "p_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_priority" "text" DEFAULT 'normal'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."leader_create_task"("p_team_id" "uuid", "p_title" "text", "p_description" "text", "p_slot_thu" integer, "p_slot_buoi" integer, "p_due_at" timestamp with time zone, "p_priority" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leader_delete_task"("p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."leader_delete_task"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leader_set_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."leader_set_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leader_unassign_task"("p_task_id" "uuid", "p_assignee_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."leader_unassign_task"("p_task_id" "uuid", "p_assignee_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_teams"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."my_teams"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
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
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."server_now_ms"() RETURNS bigint
    LANGUAGE "sql"
    AS $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;


ALTER FUNCTION "public"."server_now_ms"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_availability_block"("p_slot_thu" integer, "p_slot_buoi" integer, "p_busy" boolean, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."set_availability_block"("p_slot_thu" integer, "p_slot_buoi" integer, "p_busy" boolean, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shares_team_with"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."shares_team_with"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_attendance"("p_session_id" "text", "p_token" "text", "p_mssv" "text", "p_category" "text", "p_note" "text", "p_device_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
end $$;


ALTER FUNCTION "public"."submit_attendance"("p_session_id" "text", "p_token" "text", "p_mssv" "text", "p_category" "text", "p_note" "text", "p_device_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_attendance_authenticated"("p_session_id" "text", "p_category" "text" DEFAULT 'Đi học'::"text", "p_note" "text" DEFAULT ''::"text", "p_device_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."submit_attendance_authenticated"("p_session_id" "text", "p_category" "text", "p_note" "text", "p_device_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."team_add_member"("p_team_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."team_add_member"("p_team_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."team_remove_member"("p_team_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."team_remove_member"("p_team_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_task_status"("p_task_id" "uuid", "p_status" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."update_task_status"("p_task_id" "uuid", "p_status" "text", "p_note" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_mssv" (
    "mssv" "text" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_mssv" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "mssv" "text" NOT NULL,
    "full_name" "text",
    "status" "text" DEFAULT 'có mặt'::"text" NOT NULL,
    "category" "text",
    "note" "text",
    "device_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_status_check" CHECK (("status" = ANY (ARRAY['có mặt'::"text", 'đi muộn'::"text", 'vắng có phép'::"text", 'vắng không phép'::"text"])))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "mssv" "text" NOT NULL,
    "student_name" "text",
    "old_status" "text",
    "new_status" "text" NOT NULL,
    "changed_by" "text" DEFAULT 'Admin'::"text" NOT NULL,
    "reason" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attendance_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."password_reset_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mssv" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "handled_at" timestamp with time zone,
    "handled_by" "uuid"
);


ALTER TABLE "public"."password_reset_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "username" "text",
    "full_name" "text",
    "mssv" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_name" "text" NOT NULL,
    "is_open" boolean DEFAULT true NOT NULL,
    "duration_min" integer,
    "warn_before_min" integer DEFAULT 5 NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "qr_token" "text" NOT NULL,
    "qr_born_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mssv" "text" NOT NULL,
    "subject_name" "text" NOT NULL,
    "room_name" "text",
    "teacher_name" "text",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "day_of_week" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."student_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "mssv" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."students" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_mssv"
    ADD CONSTRAINT "admin_mssv_pkey" PRIMARY KEY ("mssv");



ALTER TABLE ONLY "public"."attendance_audit_logs"
    ADD CONSTRAINT "attendance_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_session_mssv_uq" UNIQUE ("session_id", "mssv");



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_mssv_key" UNIQUE ("mssv");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_schedules"
    ADD CONSTRAINT "student_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("mssv");



CREATE UNIQUE INDEX "attendance_session_device_uq" ON "public"."attendance" USING "btree" ("session_id", "device_id") WHERE ("device_id" IS NOT NULL);



CREATE INDEX "attendance_session_idx" ON "public"."attendance" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "idx_attendance_audit_logs_session" ON "public"."attendance_audit_logs" USING "btree" ("session_id", "changed_at" DESC);



CREATE INDEX "idx_student_schedules_lookup" ON "public"."student_schedules" USING "btree" ("mssv", "start_time", "end_time");



CREATE UNIQUE INDEX "idx_unique_pending_reset" ON "public"."password_reset_requests" USING "btree" ("mssv") WHERE ("status" = 'pending'::"text");



ALTER TABLE ONLY "public"."attendance_audit_logs"
    ADD CONSTRAINT "attendance_audit_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."password_reset_requests"
    ADD CONSTRAINT "password_reset_requests_mssv_fkey" FOREIGN KEY ("mssv") REFERENCES "public"."students"("mssv") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_schedules"
    ADD CONSTRAINT "student_schedules_mssv_fkey" FOREIGN KEY ("mssv") REFERENCES "public"."students"("mssv") ON DELETE CASCADE;



CREATE POLICY "Admin full access" ON "public"."password_reset_requests" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can do everything" ON "public"."profiles" TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "Allow read student_schedules" ON "public"."student_schedules" FOR SELECT USING (true);



CREATE POLICY "Anon can insert requests" ON "public"."password_reset_requests" FOR INSERT TO "anon" WITH CHECK ((("status" = 'pending'::"text") AND ("handled_at" IS NULL) AND ("handled_by" IS NULL)));



CREATE POLICY "admin_all_att" ON "public"."attendance" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all_audit" ON "public"."attendance_audit_logs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all_sessions" ON "public"."sessions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."admin_mssv" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."password_reset_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prof_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_students" ON "public"."students" FOR SELECT USING (true);



ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."attendance";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."_qr_sig"("p_secret" "text", "p_session" "text", "p_win" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_qr_sig"("p_secret" "text", "p_session" "text", "p_win" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_batch_set_status"("p_session_id" "text", "p_mssv_list" "text"[], "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_batch_set_status"("p_session_id" "text", "p_mssv_list" "text"[], "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_batch_set_status"("p_session_id" "text", "p_mssv_list" "text"[], "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_close_session"("p_session_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_close_session"("p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_close_session"("p_session_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_complete_reset_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_complete_reset_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_complete_reset_request"("p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_team"("p_name" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_team"("p_name" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_team"("p_name" "text", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_attendance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_attendance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_attendance"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_history"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_history"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_session"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_team"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_team"("p_team_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_delete_team"("p_team_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_audit_logs"("p_session_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_audit_logs"("p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_audit_logs"("p_session_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_users"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_open_session"("p_name" "text", "p_duration_min" integer, "p_warn_before_min" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_open_session"("p_name" "text", "p_duration_min" integer, "p_warn_before_min" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_open_session"("p_name" "text", "p_duration_min" integer, "p_warn_before_min" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_regenerate_qr"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_regenerate_qr"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_regenerate_qr"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_reopen_session"("p_session_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_reopen_session"("p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_reopen_session"("p_session_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_revoke_leader"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_revoke_leader"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_revoke_leader"("p_team_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_status"("p_session_id" "text", "p_mssv" "text", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_status"("p_session_id" "text", "p_mssv" "text", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_status"("p_session_id" "text", "p_mssv" "text", "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_team_leader"("p_team_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_team_leader"("p_team_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_team_leader"("p_team_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_sync_student_schedules"("p_schedules" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_sync_student_schedules"("p_schedules" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_sync_student_schedules"("p_schedules" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_today_sessions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_today_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_today_sessions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_assignment"("p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_assignment"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_assignment"("p_task_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_attendance_history"("p_mssv" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_attendance_history"("p_mssv" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_my_attendance_history"("p_mssv" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_open_session"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_open_session"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_open_session"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_open_session"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_session_summary"("p_session_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_session_summary"("p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_summary"("p_session_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_team_availability"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_availability"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_availability"("p_team_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_team_board"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_board"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_board"("p_team_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_assigned_to_task"("p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_assigned_to_task"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_assigned_to_task"("p_task_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_leader"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_leader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_leader"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_team_leader"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_team_leader"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_leader"("p_team_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_team_member"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_team_member"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_member"("p_team_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_qr_token"("p_session_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_qr_token"("p_session_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_qr_token"("p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_qr_token"("p_session_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leader_assign_task"("p_task_id" "uuid", "p_assignee_id" "uuid", "p_note" "text", "p_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leader_assign_task"("p_task_id" "uuid", "p_assignee_id" "uuid", "p_note" "text", "p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."leader_assign_task"("p_task_id" "uuid", "p_assignee_id" "uuid", "p_note" "text", "p_force" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."leader_create_task"("p_team_id" "uuid", "p_title" "text", "p_description" "text", "p_slot_thu" integer, "p_slot_buoi" integer, "p_due_at" timestamp with time zone, "p_priority" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leader_create_task"("p_team_id" "uuid", "p_title" "text", "p_description" "text", "p_slot_thu" integer, "p_slot_buoi" integer, "p_due_at" timestamp with time zone, "p_priority" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leader_create_task"("p_team_id" "uuid", "p_title" "text", "p_description" "text", "p_slot_thu" integer, "p_slot_buoi" integer, "p_due_at" timestamp with time zone, "p_priority" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leader_delete_task"("p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leader_delete_task"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leader_delete_task"("p_task_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leader_set_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leader_set_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leader_set_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leader_unassign_task"("p_task_id" "uuid", "p_assignee_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leader_unassign_task"("p_task_id" "uuid", "p_assignee_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leader_unassign_task"("p_task_id" "uuid", "p_assignee_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_teams"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_teams"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_teams"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."server_now_ms"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."server_now_ms"() TO "anon";
GRANT ALL ON FUNCTION "public"."server_now_ms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."server_now_ms"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_availability_block"("p_slot_thu" integer, "p_slot_buoi" integer, "p_busy" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_availability_block"("p_slot_thu" integer, "p_slot_buoi" integer, "p_busy" boolean, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_availability_block"("p_slot_thu" integer, "p_slot_buoi" integer, "p_busy" boolean, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."shares_team_with"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shares_team_with"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shares_team_with"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_attendance"("p_session_id" "text", "p_token" "text", "p_mssv" "text", "p_category" "text", "p_note" "text", "p_device_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_attendance"("p_session_id" "text", "p_token" "text", "p_mssv" "text", "p_category" "text", "p_note" "text", "p_device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_attendance"("p_session_id" "text", "p_token" "text", "p_mssv" "text", "p_category" "text", "p_note" "text", "p_device_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_attendance_authenticated"("p_session_id" "text", "p_category" "text", "p_note" "text", "p_device_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_attendance_authenticated"("p_session_id" "text", "p_category" "text", "p_note" "text", "p_device_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_attendance_authenticated"("p_session_id" "text", "p_category" "text", "p_note" "text", "p_device_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."team_add_member"("p_team_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."team_add_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."team_add_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."team_remove_member"("p_team_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."team_remove_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."team_remove_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_task_status"("p_task_id" "uuid", "p_status" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_task_status"("p_task_id" "uuid", "p_status" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_task_status"("p_task_id" "uuid", "p_status" "text", "p_note" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."admin_mssv" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "service_role";
GRANT SELECT ON TABLE "public"."attendance" TO "authenticated";



GRANT ALL ON TABLE "public"."attendance_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."attendance_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."password_reset_requests" TO "anon";
GRANT ALL ON TABLE "public"."password_reset_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."password_reset_requests" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."sessions" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."sessions" TO "authenticated";



GRANT ALL ON TABLE "public"."student_schedules" TO "anon";
GRANT ALL ON TABLE "public"."student_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."student_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "service_role";
GRANT SELECT ON TABLE "public"."students" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































