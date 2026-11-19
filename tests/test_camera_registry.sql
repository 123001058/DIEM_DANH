-- Run after the registry migration. Every fixture and address is rolled back.
begin;
insert into public.camera_endpoints(device_id, token_hash)
values ('camera-discovery-test', encode(extensions.digest(repeat('a',64),'sha256'),'hex'));

set local role anon;
do $test$
declare failed boolean;
begin
  failed := false;
  begin perform * from public.camera_endpoints;
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'anon can read credentials'; end if;
  failed := false;
  begin update public.camera_endpoints set ip='192.168.2.1' where device_id='camera-discovery-test';
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'anon can write registry directly'; end if;
  failed := false;
  begin perform public.report_camera_endpoint('camera-discovery-test',repeat('b',64),'192.168.2.169');
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'bad credential accepted'; end if;
  failed := false;
  begin perform public.report_camera_endpoint('unknown-camera',repeat('a',64),'192.168.2.169');
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'unknown device can register itself'; end if;
  if public.get_camera_endpoint('camera-discovery-test') is not null then
    raise exception 'unreported endpoint is visible'; end if;
  if not public.report_camera_endpoint('camera-discovery-test',repeat('a',64),'192.168.2.168') then
    raise exception 'valid report rejected'; end if;
  if public.get_camera_endpoint('camera-discovery-test')->>'ip' <> '192.168.2.168' then
    raise exception 'first address mismatch'; end if;
  perform public.report_camera_endpoint('camera-discovery-test',repeat('a',64),'10.1.2.42');
  if public.get_camera_endpoint('camera-discovery-test')->>'ip' <> '10.1.2.42' then
    raise exception 'changed address mismatch'; end if;
  if public.get_camera_endpoint('camera-discovery-test') ? 'token_hash' then
    raise exception 'credential hash leaked through read RPC'; end if;
end;
$test$;

do $test$
declare address text; failed boolean;
begin
  foreach address in array array['8.8.8.8','127.0.0.1','0.0.0.0','::1','192.168.2.5/24',
                                '192.168.999.2','http://192.168.2.168','',null] loop
    failed := false;
    begin perform public.report_camera_endpoint('camera-discovery-test',repeat('a',64),address);
    exception when invalid_parameter_value then failed := true; end;
    if not failed then raise exception 'bad IP accepted: %',address; end if;
  end loop;
end;
$test$;
reset role;
update public.camera_endpoints set updated_at=now()-interval '181 seconds'
where device_id='camera-discovery-test';
set local role anon;
do $test$
begin
  if public.get_camera_endpoint('camera-discovery-test') is not null then
    raise exception 'stale endpoint exposed'; end if;
end;
$test$;
reset role;
set local role authenticated;
do $test$
declare failed boolean := false;
begin
  begin perform token_hash from public.camera_endpoints;
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'authenticated can read credentials'; end if;
  if public.get_camera_endpoint('missing-device') is not null then
    raise exception 'missing device returned an endpoint'; end if;
end;
$test$;
reset role;
select 'PASS registry roles, invalid tokens/devices, DHCP address change, LAN validation, TTL, no credential leak' as result;
rollback;
