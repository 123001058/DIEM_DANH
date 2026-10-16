-- Allow admins to edit attendance from both active sessions and session history.
-- The attendance update trigger records the complete old and new values.
create or replace function public.admin_set_status(
  p_session_id text,
  p_mssv text,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
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
$$;

revoke all on function public.admin_set_status(text, text, text, text) from public, anon;
grant execute on function public.admin_set_status(text, text, text, text) to authenticated;
