-- =====================================================================
-- Migration: Siết bảo mật dữ liệu khuôn mặt, kiosk, QR và avatar
-- Ngày: 2026-10-20
--
-- Nội dung:
--   1. Không trả qr_token cho người không phải admin.
--   2. Chỉ admin hoặc chính sinh viên được đọc students / student_face_data.
--   3. Kiosk RPC chỉ dành cho tài khoản admin đã đăng nhập.
--   4. Kiểm tra quyền admin + dữ liệu đầu vào cho RPC avatar.
--   5. Bỏ policy storage avatar quá rộng.
--   6. Thống kê phiên tính cả sinh viên đi muộn và bỏ sinh viên ngừng hoạt động.
--   7. Giới hạn tần suất gửi yêu cầu đặt lại mật khẩu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. get_open_session: chỉ admin nhận được qr_token
-- ---------------------------------------------------------------------
create or replace function public.get_open_session()
returns jsonb
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', s.id,
    'session_name', s.session_name,
    'duration_min', s.duration_min,
    'warn_before_min', s.warn_before_min,
    'started_at', s.started_at,
    'qr_token', case when public.is_admin() then s.qr_token else null end,
    'qr_born_at', s.qr_born_at
  )
  from public.sessions s
  where s.is_open
    and (s.duration_min is null or s.started_at + s.duration_min * interval '1 minute' > now())
  order by s.started_at desc
  limit 1;
$function$;

-- ---------------------------------------------------------------------
-- 2. Chỉ admin hoặc chính sinh viên được đọc dữ liệu sinh viên/khuôn mặt
-- ---------------------------------------------------------------------
revoke all on table public.student_face_data from anon;
revoke select on table public.students from anon;

drop policy if exists "student_face_data_select" on public.student_face_data;
create policy "student_face_data_select" on public.student_face_data
  for select to authenticated
  using (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  );

-- Policy students_read_all được tạo bởi migration seed trước đây.
drop policy if exists students_read_all on public.students;

-- ---------------------------------------------------------------------
-- 3. Kiosk điểm danh: chỉ admin đã đăng nhập, phiên còn hạn
-- ---------------------------------------------------------------------
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

  -- Tìm sinh viên
  select name into v_name from public.students where mssv = v_mssv;
  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy sinh viên có MSSV: ' || v_mssv);
  end if;

  -- Tìm phiên
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

  -- Kiểm tra trạng thái hiện tại
  select status into v_old_status from public.attendance where session_id = v_sid and mssv = v_mssv;
  if v_old_status in ('có mặt', 'đi muộn') then
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

  -- Tính toán đi muộn
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

  -- Ghi vào attendance
  insert into public.attendance(session_id, mssv, full_name, status, category, note, created_at)
  values(v_sid, v_mssv, v_name, v_final_status, 'Khuôn mặt', v_note, now())
  on conflict(session_id, mssv) do update set
    status = excluded.status,
    category = excluded.category,
    note = excluded.note,
    created_at = now();

  -- Ghi log audit
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

revoke all on function public.kiosk_record_face_checkin(text, text, text) from public;
grant execute on function public.kiosk_record_face_checkin(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Kiosk nạp dữ liệu khuôn mặt: chỉ admin
-- ---------------------------------------------------------------------
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

  -- Chặn ghi rác: chỉ cho phép lưu vector nếu MSSV đã có trong bảng students
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

revoke all on function public.kiosk_upsert_face_data(text, jsonb, jsonb) from public;
grant execute on function public.kiosk_upsert_face_data(text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. RPC avatar: bắt buộc admin, không tự tạo sinh viên giả
-- ---------------------------------------------------------------------
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

  update public.students
  set avatar = v_avatar
  where mssv = v_target_mssv;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy sinh viên có MSSV: ' || v_target_mssv);
  end if;

  update public.profiles
  set avatar_url = v_avatar
  where mssv = v_target_mssv;

  return jsonb_build_object('ok', true, 'mssv', v_target_mssv, 'avatar', v_avatar);
end;
$function$;

revoke all on function public.admin_update_avatar(text, text) from public;
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

revoke all on function public.admin_set_my_avatar(text) from public;
grant execute on function public.admin_set_my_avatar(text) to authenticated;

revoke all on function public.student_set_my_avatar(text) from public;
grant execute on function public.student_set_my_avatar(text) to authenticated;

-- Chỉ admin được xuất dữ liệu khuôn mặt (hàm đã có kiểm tra admin bên trong)
revoke all on function public.admin_export_face_data() from public;
grant execute on function public.admin_export_face_data() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Storage avatar: bỏ policy cho phép mọi user ghi đè file bất kỳ
-- ---------------------------------------------------------------------
drop policy if exists avatars_insert_auth on storage.objects;
drop policy if exists avatars_update_auth on storage.objects;

-- ---------------------------------------------------------------------
-- 7. Thống kê phiên: tính đi muộn là có mặt, bỏ sinh viên ngừng hoạt động
-- ---------------------------------------------------------------------
create or replace function public.get_session_summary(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_sid uuid;
  v_total int;
  v_present int;
  v_late int;
  v_absent int;
  v_unmarked int;
begin
  select id into v_sid from public.sessions where id::text = btrim(p_session_id);
  if v_sid is null then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy phiên.');
  end if;

  select count(*) into v_total
  from public.students
  where coalesce(is_active, true);

  select count(*) into v_present
  from public.attendance a
  join public.students st on st.mssv = a.mssv and coalesce(st.is_active, true)
  where a.session_id = v_sid
    and a.status in ('có mặt', 'đi muộn');

  select count(*) into v_late
  from public.attendance a
  join public.students st on st.mssv = a.mssv and coalesce(st.is_active, true)
  where a.session_id = v_sid
    and a.status = 'đi muộn';

  select count(*) into v_absent
  from public.attendance a
  join public.students st on st.mssv = a.mssv and coalesce(st.is_active, true)
  where a.session_id = v_sid
    and a.status in ('vắng có phép', 'vắng không phép');

  v_unmarked := greatest(v_total - v_present - v_absent, 0);

  return jsonb_build_object(
    'ok', true,
    'total', v_total,
    'present', v_present,
    'late', v_late,
    'absent', v_absent,
    'unmarked', v_unmarked
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. Yêu cầu đặt lại mật khẩu: RPC có giới hạn tần suất, bỏ insert trực tiếp
-- ---------------------------------------------------------------------
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

revoke all on function public.request_password_reset(text) from public;
grant execute on function public.request_password_reset(text) to anon, authenticated;

drop policy if exists "Anon can insert requests" on public.password_reset_requests;
revoke insert, update, delete on table public.password_reset_requests from anon;
