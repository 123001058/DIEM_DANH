-- =====================================================================
-- Migration: Tạm khôi phục qr_token cho ESP32 hiển thị QR
-- Ngày: 2026-10-20
--
-- Bối cảnh:
--   ESP32 (esp32_kiosk.ino) dùng anon key gọi get_open_session() để lấy
--   qr_token và vẽ QR. Migration 20261020150000 đã ẩn qr_token với anon,
--   khiến ESP32 không còn hiển thị được QR.
--
--   Giải pháp device-key đã được thống nhất để làm sau. Trong lúc chờ,
--   tạm khôi phục qr_token cho anon để không làm hỏng kiosk ESP32.
--   Đây là đánh đổi có chủ ý: qr_token hiển thị công khai trên thiết bị,
--   người có quyền truy cập mạng vẫn có thể đọc được token.
-- =====================================================================

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
    'qr_born_at', s.qr_born_at
  )
  from public.sessions s
  where s.is_open
    and (s.duration_min is null or s.started_at + s.duration_min * interval '1 minute' > now())
  order by s.started_at desc
  limit 1;
$function$;
