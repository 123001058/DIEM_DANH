begin;

-- Device credentials stay private; consumers only see a fresh LAN address via RPC.
create table public.camera_endpoints (
  device_id text primary key check (device_id ~ '^[a-z0-9-]{1,48}$'),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  ip inet,
  updated_at timestamptz,
  constraint camera_lan_ipv4 check (
    ip is null or (family(ip) = 4 and masklen(ip) = 32 and
      (ip << inet '10.0.0.0/8' or ip << inet '172.16.0.0/12' or ip << inet '192.168.0.0/16'))
  )
);
alter table public.camera_endpoints enable row level security;
revoke all on table public.camera_endpoints from public, anon, authenticated;

create function public.report_camera_endpoint(p_device_id text, p_token text, p_ip text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  address inet;
begin
  if p_token is null or length(p_token) <> 64 or not exists (
    select 1 from public.camera_endpoints
    where device_id = p_device_id
      and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'Invalid camera credential' using errcode = '42501';
  end if;
  if p_ip is null or p_ip !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' then
    raise exception 'Invalid LAN IPv4 address' using errcode = '22023';
  end if;
  begin
    address := p_ip::inet;
  exception when invalid_text_representation then
    raise exception 'Invalid LAN IPv4 address' using errcode = '22023';
  end;
  if not (address << inet '10.0.0.0/8' or address << inet '172.16.0.0/12' or
          address << inet '192.168.0.0/16') then
    raise exception 'Invalid LAN IPv4 address' using errcode = '22023';
  end if;
  update public.camera_endpoints
    set ip = address, updated_at = clock_timestamp()
    where device_id = p_device_id
      and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  return found;
end;
$function$;

create function public.get_camera_endpoint(p_device_id text default 'lh-navix-cam')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object('device_id', device_id, 'ip', host(ip), 'updated_at', updated_at)
  from public.camera_endpoints
  where device_id = p_device_id and ip is not null
    and updated_at >= now() - interval '180 seconds';
$function$;

revoke all on function public.report_camera_endpoint(text, text, text) from public, anon, authenticated;
revoke all on function public.get_camera_endpoint(text) from public, anon, authenticated;
grant execute on function public.report_camera_endpoint(text, text, text) to anon, authenticated;
grant execute on function public.get_camera_endpoint(text) to anon, authenticated;

-- Add the address to the existing poll without changing QR or check-in fields.
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
    'camera', public.get_camera_endpoint('lh-navix-cam'),
    'last_checkin', (
      select jsonb_build_object(
        'id', e.event_id::text,
        'event_id', e.event_id::text,
        'name', a.full_name,
        'mssv', e.mssv,
        'avatar', coalesce(st.avatar, '')
      )
      from public.kiosk_checkin_display_events e
      join public.attendance a on a.session_id = e.session_id and a.mssv = e.mssv
      left join public.students st on st.mssv = e.mssv
      where e.session_id = s.id
        and e.event_at >= now() - interval '20 seconds'
        and a.status in ('có mặt', 'đi muộn')
        and nullif(btrim(a.full_name), '') is not null
      limit 1
    )
  )
  from public.sessions s
  where s.is_open
    and (s.duration_min is null or s.started_at + s.duration_min * interval '1 minute' > now())
  order by s.started_at desc
  limit 1;
$function$;

notify pgrst, 'reload schema';
commit;
