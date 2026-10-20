-- =====================================================================
-- Fix: quyền xem đơn xin nghỉ + gửi/nhận phản hồi giữa admin và sinh viên
-- 1. Chỉ admin và đúng sinh viên sở hữu đơn mới đọc được đơn/lịch sử/minh chứng.
-- 2. Sửa lỗi RPC submit_leave_comment làm mất tin nhắn đầu tiên khi
--    reviewer_note đang là NULL.
-- 3. Gửi thông báo chuông cho phía còn lại khi có phản hồi mới.
-- 4. Không ghi lịch sử sửa đơn cho các cập nhật chat-only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RLS: đơn xin nghỉ chỉ hiển thị cho admin hoặc chính sinh viên đó
-- ---------------------------------------------------------------------
drop policy if exists "leave_requests_read" on public.leave_requests;
create policy "leave_requests_read" on public.leave_requests
  for select
  to authenticated
  using (
    public.is_admin()
    or requested_by = (select auth.uid())
    or mssv = (
      select p.mssv
      from public.profiles p
      where p.user_id = (select auth.uid())
      limit 1
    )
  );

drop policy if exists "leave_request_history_read" on public.leave_request_history;
create policy "leave_request_history_read" on public.leave_request_history
  for select
  to authenticated
  using (
    public.is_admin()
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

-- Ảnh minh chứng: admin hoặc đúng sinh viên sở hữu đơn/người đã tải ảnh
drop policy if exists "leave_evidence_read" on storage.objects;
create policy "leave_evidence_read" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'leave-evidence'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.leave_requests r
        join public.profiles p on p.user_id = (select auth.uid())
        where r.evidence_path = name
          and (r.requested_by = (select auth.uid()) or r.mssv = p.mssv)
      )
    )
  );

-- ---------------------------------------------------------------------
-- 2. RPC gửi phản hồi: sửa lỗi reviewer_note NULL + thêm thông báo
-- ---------------------------------------------------------------------
create or replace function public.submit_leave_comment(
  p_leave_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $func$
declare
  v_req public.leave_requests%rowtype;
  v_notes jsonb;
  v_new_msg jsonb;
  v_sender_name text;
  v_current_user uuid := auth.uid();
  v_is_admin_user boolean;
  v_is_student_owner boolean;
  v_role text;
  v_text text := btrim(coalesce(p_message, ''));
begin
  if v_current_user is null then
    return jsonb_build_object('ok', false, 'message', 'Vui lòng đăng nhập để gửi tin nhắn.');
  end if;

  if v_text = '' then
    return jsonb_build_object('ok', false, 'message', 'Nội dung tin nhắn không được để trống.');
  end if;

  if length(v_text) > 2000 then
    return jsonb_build_object('ok', false, 'message', 'Tin nhắn quá dài (tối đa 2000 ký tự).');
  end if;

  select * into v_req from public.leave_requests where id = p_leave_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy đơn xin nghỉ.');
  end if;

  v_is_admin_user := public.is_admin();

  select exists (
    select 1
    from public.profiles p
    where p.user_id = v_current_user
      and p.mssv = v_req.mssv
  ) into v_is_student_owner;

  -- Admin, người nộp đơn, hoặc sinh viên đúng MSSV của đơn đều được phản hồi.
  -- Điều này cho phép sinh viên trao đổi trên cả đơn do admin tạo hộ.
  if not (v_is_admin_user or v_req.requested_by = v_current_user or v_is_student_owner) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không có quyền phản hồi đơn này.');
  end if;

  if v_is_admin_user then
    v_role := 'admin';
    v_sender_name := 'Quản lý';
  else
    v_role := 'student';
    select coalesce(nullif(btrim(full_name), ''), v_req.mssv)
      into v_sender_name
      from public.profiles
      where user_id = v_current_user;
    if v_sender_name is null or btrim(v_sender_name) = '' then
      v_sender_name := v_req.mssv;
    end if;
  end if;

  -- Đọc mảng tin nhắn cũ trong reviewer_note (hỗ trợ cả ghi chú text cũ).
  begin
    v_notes := v_req.reviewer_note::jsonb;

    if v_notes is null or jsonb_typeof(v_notes) is distinct from 'array' then
      if v_notes is not null and jsonb_typeof(v_notes) = 'null' then
        v_notes := '[]'::jsonb;
      elsif v_req.reviewer_note is not null and btrim(v_req.reviewer_note) <> '' then
        v_notes := jsonb_build_array(jsonb_build_object(
          'id', 'msg_legacy',
          'sender', 'admin',
          'name', 'Quản lý',
          'text', v_req.reviewer_note,
          'time', to_char(
            coalesce(v_req.reviewed_at, v_req.updated_at, now()) at time zone 'Asia/Ho_Chi_Minh',
            'HH24:MI DD/MM'
          )
        ));
      else
        v_notes := '[]'::jsonb;
      end if;
    end if;
  exception when others then
    if v_req.reviewer_note is not null and btrim(v_req.reviewer_note) <> '' then
      v_notes := jsonb_build_array(jsonb_build_object(
        'id', 'msg_legacy',
        'sender', 'admin',
        'name', 'Quản lý',
        'text', v_req.reviewer_note,
        'time', to_char(
          coalesce(v_req.reviewed_at, v_req.updated_at, now()) at time zone 'Asia/Ho_Chi_Minh',
          'HH24:MI DD/MM'
        )
      ));
    else
      v_notes := '[]'::jsonb;
    end if;
  end;

  -- Đảm bảo luôn có mảng trước khi nối tin nhắn mới (đây là lỗi cũ:
  -- reviewer_note NULL làm tin nhắn đầu tiên bị mất).
  v_notes := coalesce(v_notes, '[]'::jsonb);

  v_new_msg := jsonb_build_object(
    'id', 'msg_' || replace(gen_random_uuid()::text, '-', ''),
    'sender', v_role,
    'name', v_sender_name,
    'text', v_text,
    'time', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
  );

  v_notes := v_notes || jsonb_build_array(v_new_msg);

  update public.leave_requests
  set reviewer_note = v_notes::text,
      updated_at = now()
  where id = p_leave_id;

  -- Thông báo cho phía còn lại.
  if v_is_admin_user then
    insert into public.in_app_notifications(user_id, title, message, leave_request_id)
    select distinct
      p.user_id,
      'Quản lý đã phản hồi đơn xin nghỉ',
      left(v_text, 500),
      p_leave_id
    from public.profiles p
    where p.mssv = v_req.mssv
      and p.user_id <> v_current_user;

    if not exists (select 1 from public.profiles p where p.mssv = v_req.mssv)
       and v_req.requested_by is not null
       and v_req.requested_by <> v_current_user then
      insert into public.in_app_notifications(user_id, title, message, leave_request_id)
      values (
        v_req.requested_by,
        'Quản lý đã phản hồi đơn xin nghỉ',
        left(v_text, 500),
        p_leave_id
      );
    end if;
  else
    insert into public.in_app_notifications(user_id, title, message, leave_request_id)
    select distinct
      p.user_id,
      'Phản hồi mới về đơn xin nghỉ',
      v_sender_name || ' (' || v_req.mssv || '): ' || left(v_text, 500),
      p_leave_id
    from public.profiles p
    join public.admin_mssv a on a.mssv = p.mssv
    where p.user_id <> v_current_user;
  end if;

  return jsonb_build_object('ok', true, 'notes', v_notes);
end;
$func$;

revoke all on function public.submit_leave_comment(uuid, text) from public, anon;
grant execute on function public.submit_leave_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Không ghi lịch sử sửa đơn cho cập nhật chat-only và không nhét
--    nguyên mảng JSON chat vào nội dung thông báo duyệt/từ chối.
-- ---------------------------------------------------------------------
create or replace function public.record_leave_request_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $func$
declare
  v_name text;
begin
  -- Chỉ thay đổi reviewer_note/updated_at (gửi chat) thì không tạo lịch sử sửa đơn.
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'reviewer_note' - 'updated_at')
         is not distinct from (to_jsonb(new) - 'reviewer_note' - 'updated_at') then
    return new;
  end if;

  insert into public.leave_request_history(leave_request_id, changed_by, old_record, new_record)
  values (
    new.id,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );

  if tg_op = 'INSERT' then
    select coalesce(nullif(btrim(p.full_name), ''), new.mssv)
      into v_name
      from public.profiles p
      where p.user_id = new.requested_by;

    insert into public.in_app_notifications(user_id, title, message, leave_request_id)
    values (new.requested_by, 'Đã nhận đơn xin nghỉ', 'Đơn của bạn đã được gửi và đang chờ duyệt.', new.id);

    insert into public.in_app_notifications(user_id, title, message, leave_request_id)
    select p.user_id, 'Có đơn xin nghỉ mới', coalesce(v_name, new.mssv) || ' vừa gửi đơn xin nghỉ.', new.id
    from public.profiles p
    join public.admin_mssv a on a.mssv = p.mssv
    where p.user_id <> new.requested_by;
  elsif old.status is distinct from new.status then
    insert into public.in_app_notifications(user_id, title, message, leave_request_id)
    values (
      new.requested_by,
      case new.status
        when 'approved' then 'Đơn xin nghỉ đã được duyệt'
        when 'rejected' then 'Đơn xin nghỉ chưa được duyệt'
        when 'cancelled' then 'Đơn xin nghỉ đã được hủy'
        else 'Đơn xin nghỉ đã cập nhật'
      end,
      case new.status
        when 'approved' then 'Đơn xin nghỉ của bạn đã được duyệt.'
        when 'rejected' then 'Đơn xin nghỉ của bạn chưa được duyệt.'
        when 'cancelled' then 'Đơn xin nghỉ đã được hủy.'
        else 'Trạng thái đơn xin nghỉ đã thay đổi.'
      end
      || case
           when new.reviewer_note is null or btrim(new.reviewer_note) = '' then ''
           when left(btrim(new.reviewer_note), 1) in ('[', '{') then ''
           else ' Ghi chú: ' || btrim(new.reviewer_note)
         end,
      new.id
    );

    if new.status = 'cancelled' then
      select coalesce(nullif(btrim(p.full_name), ''), new.mssv)
        into v_name
        from public.profiles p
        where p.user_id = new.requested_by;

      insert into public.in_app_notifications(user_id, title, message, leave_request_id)
      select p.user_id, 'Đơn xin nghỉ đã bị hủy', coalesce(v_name, new.mssv) || ' đã hủy đơn xin nghỉ.', new.id
      from public.profiles p
      join public.admin_mssv a on a.mssv = p.mssv
      where p.user_id <> new.requested_by;
    end if;
  end if;

  return new;
end;
$func$;

-- Làm mới schema cache PostgREST để client gọi được RPC mới ngay.
notify pgrst, 'reload schema';
