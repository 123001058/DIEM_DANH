-- ====================================================================
-- MIGRATION: TÍCH HỢP ĐỐI CHIẾU LỊCH HỌC TRƯỜNG & CHỐNG GIAN LẬN ĐIỂM DANH
-- Chạy script này trên Supabase SQL Editor
-- ====================================================================

-- 1. BẢNG LƯU LỊCH HỌC TRƯỜNG CỦA SINH VIÊN
create table if not exists public.student_schedules (
  id           uuid primary key default gen_random_uuid(),
  mssv         text not null references public.students(mssv) on delete cascade,
  subject_name text not null,
  room_name    text,
  teacher_name text,
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  day_of_week  int,
  created_at   timestamptz not null default now()
);

create index if not exists idx_student_schedules_lookup
  on public.student_schedules (mssv, start_time, end_time);

alter table public.student_schedules enable row level security;

drop policy if exists "Allow read student_schedules" on public.student_schedules;
create policy "Allow read student_schedules" on public.student_schedules
  for select to authenticated using (true);

-- Đảm bảo sinh viên 125001343 có trong bảng students nếu chưa có
insert into public.students (mssv, name)
values ('125001343', 'Dương Công Mạnh')
on conflict (mssv) do nothing;

-- 2. CẬP NHẬT admin_open_session:
-- Khi Admin mở phiên xưởng: Tự động ghi nhận "vắng có phép (Học trường)" cho SV có lịch học trùng ca này
create or replace function public.admin_open_session(
  p_name text, p_duration_min int, p_warn_before_min int default 5
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_new_id uuid;
  v_token text;
  v_sess_start timestamptz := now();
  v_sess_end timestamptz;
  v_dur int := coalesce(p_duration_min, 240);
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'Tên phiên không được để trống.');
  end if;

  update public.sessions set is_open = false where is_open = true;

  v_sess_end := v_sess_start + (v_dur * interval '1 minute');
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.sessions (session_name, duration_min, warn_before_min, qr_token, qr_born_at, started_at)
  values (v_name, p_duration_min, greatest(1, coalesce(p_warn_before_min, 5)), v_token, v_sess_start, v_sess_start)
  returning id into v_new_id;

  -- Tự động đánh dấu "vắng có phép" cho các sinh viên có lịch học trường trùng ca này
  insert into public.attendance (session_id, mssv, full_name, status, category, note)
  select distinct on (st.mssv)
    v_new_id,
    st.mssv,
    st.name,
    'vắng có phép',
    'Học trường',
    'Lịch học: ' || sch.subject_name || coalesce(' (' || sch.room_name || ')', '')
  from public.students st
  join public.student_schedules sch on sch.mssv = st.mssv
  where sch.start_time < v_sess_end
    and sch.end_time > v_sess_start
  order by st.mssv, sch.start_time asc
  on conflict (session_id, mssv) do nothing;

  return jsonb_build_object('ok', true, 'session_id', v_new_id, 'qr_token', v_token);
end;
$$;

revoke all on function public.admin_open_session(text, int, int) from public, anon;
grant execute on function public.admin_open_session(text, int, int) to authenticated;

-- 3. CẬP NHẬT submit_attendance:
-- Khi SV quét QR ở xưởng: TỪ CHỐI nếu SV đang có lịch học trên trường trong ca này
create or replace function public.submit_attendance(
  p_session_id text, p_token text, p_mssv text,
  p_category text, p_note text, p_device_id text
)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s record;
  v_mssv text;
  v_name text;
  v_existing_status text;
  v_cat text := left(btrim(coalesce(p_category, '')), 60);
  v_note text := left(btrim(coalesce(p_note, '')), 200);
  v_dev text := btrim(coalesce(p_device_id, ''));
  v_sess_end timestamptz;
  v_sch_sub text;
  v_sch_room text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NO_AUTH',
      'message', 'Vui lòng đăng nhập trước khi điểm danh.');
  end if;

  select btrim(mssv) into v_mssv from public.profiles where user_id = v_uid;
  if v_mssv is null or v_mssv = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_MSSV',
      'message', 'Tài khoản chưa liên kết MSSV.');
  end if;

  if p_token is null or length(p_token) < 20 or v_cat = '' or v_dev = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_INPUT',
      'message', 'Thiếu thông tin điểm danh.');
  end if;

  select * into s from public.sessions where id::text = btrim(p_session_id);
  if not found or not s.is_open
     or (s.duration_min is not null
         and s.started_at + (s.duration_min * interval '1 minute') <= now()) then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED',
      'message', 'Phiên đã đóng hoặc hết giờ.');
  end if;

  if s.qr_token <> p_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN_INVALID',
      'message', 'Mã QR không còn hiệu lực. Vui lòng quét mã mới.');
  end if;

  select name into v_name from public.students where mssv = v_mssv;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_CLASS',
      'message', 'MSSV không có trong danh sách lớp.');
  end if;

  -- KIỂM TRA TRÙNG LỊCH HỌC TRƯỜNG:
  v_sess_end := s.started_at + (coalesce(s.duration_min, 240) * interval '1 minute');
  select subject_name, room_name into v_sch_sub, v_sch_room
  from public.student_schedules
  where mssv = v_mssv
    and start_time < v_sess_end
    and end_time > s.started_at
  order by start_time asc limit 1;

  if v_sch_sub is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'HAS_CLASS_SCHEDULE',
      'message', 'Theo lịch đào tạo, bạn đang có tiết học môn "' || v_sch_sub || '"' ||
                 coalesce(' tại phòng ' || v_sch_room, '') ||
                 '. Không được điểm danh ở xưởng!'
    );
  end if;

  select status into v_existing_status from public.attendance
    where session_id = s.id and mssv = v_mssv;
  if found then
    if v_existing_status = 'có mặt' then
      return jsonb_build_object('ok', false, 'code', 'ALREADY',
        'message', 'Bạn đã điểm danh phiên này rồi.');
    else
      update public.attendance
        set status = 'có mặt', category = v_cat, note = v_note,
            device_id = v_dev, created_at = now()
        where session_id = s.id and mssv = v_mssv;
      return jsonb_build_object('ok', true, 'code', 'OK',
        'name', v_name, 'mssv', v_mssv);
    end if;
  end if;

  if exists (
    select 1 from public.attendance
    where session_id = s.id and device_id = v_dev and mssv <> v_mssv
  ) then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_USED',
      'message', 'Thiết bị này đã điểm danh cho sinh viên khác.');
  end if;

  insert into public.attendance (session_id, mssv, full_name, status, category, note, device_id)
  values (s.id, v_mssv, v_name, 'có mặt', v_cat, v_note, v_dev);

  return jsonb_build_object('ok', true, 'code', 'OK',
    'name', v_name, 'mssv', v_mssv, 'session_id', s.id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'ALREADY',
    'message', 'Bạn đã điểm danh phiên này rồi.');
end;
$$;

revoke all on function public.submit_attendance(text,text,text,text,text,text) from public, anon;
grant execute on function public.submit_attendance(text,text,text,text,text,text) to authenticated;

-- 4. CẬP NHẬT admin_close_session:
-- Khi đóng phiên: Tự động đánh "vắng không phép" cho các bạn còn lại chưa quét
create or replace function public.admin_close_session(p_session_id text default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_sid uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;

  if p_session_id is not null and btrim(p_session_id) <> '' then
    select id into v_sid from public.sessions where id::text = btrim(p_session_id);
  else
    select id into v_sid from public.sessions where is_open = true limit 1;
  end if;

  if v_sid is not null then
    -- Tự động đánh "vắng không phép" cho các sinh viên rảnh mà không quét QR
    insert into public.attendance (session_id, mssv, full_name, status, category, note)
    select
      v_sid,
      st.mssv,
      st.name,
      'vắng không phép',
      'Xưởng',
      'Không có lịch trường & không quét QR'
    from public.students st
    where not exists (
      select 1 from public.attendance a
      where a.session_id = v_sid and a.mssv = st.mssv
    )
    on conflict (session_id, mssv) do nothing;

    update public.sessions set is_open = false where id = v_sid;
  end if;

  update public.sessions set is_open = false where is_open = true;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_close_session(text) from public, anon;
grant execute on function public.admin_close_session(text) to authenticated;
