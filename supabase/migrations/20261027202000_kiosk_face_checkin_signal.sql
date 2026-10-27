-- Migration: 20261027202000_kiosk_face_checkin_signal.sql
-- Mô tả: Trả về last_checkin id dạng <mssv>_<epoch_timestamp> ngắn gọn (20 ký tự).
-- Giúp ESP32 Kiosk luôn nhận biết được lượt quét mới (kể cả cùng một người quét lại nhiều lần bằng Mặt hoặc QR).
-- Không thay đổi bất kỳ logic giao diện hay delay nào của firmware ESP32.

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
        'id', a.mssv || '_' || extract(epoch from a.created_at)::bigint::text,
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
