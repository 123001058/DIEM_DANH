-- Migration: 20261027200500_restore_stable_kiosk_display.sql
-- Khôi phục cấu trúc get_open_session chuẩn nhẹ ban đầu đã được người dùng kiểm chứng chạy chữ tốt.

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
    'qr_token', s.qr_token,
    'qr_born_at', s.qr_born_at,
    'last_checkin', (
      select jsonb_build_object(
        'id', a.id,
        'name', a.full_name
      )
      from public.attendance a
      where a.session_id = s.id
        and a.status in ('có mặt', 'đi muộn')
        and a.created_at >= now() - interval '20 seconds'
        and nullif(btrim(a.full_name), '') is not null
      order by a.created_at desc, a.id desc
      limit 1
    )
  )
  from public.sessions s
  where s.is_open
    and (s.duration_min is null or s.started_at + s.duration_min * interval '1 minute' > now())
  order by s.started_at desc
  limit 1;
$function$;

grant execute on function public.get_open_session() to anon, authenticated, service_role;
