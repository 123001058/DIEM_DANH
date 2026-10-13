-- Drop existing possible duplicates just in case (though CREATE OR REPLACE with same signature handles it)
-- Re-create with correct auth checks
create or replace function public.get_my_attendance_history(p_mssv text)
returns jsonb language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
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

revoke all on function public.get_my_attendance_history(text) from public, anon;
grant execute on function public.get_my_attendance_history(text) to authenticated;
