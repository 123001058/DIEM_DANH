-- Kiosk needs a lightweight signal to show the name after a successful QR check-in.
-- Expose only the newest successful attendee's display name for 20 seconds;
-- do not return an MSSV or an attendance list to the public QR kiosk caller.
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
