"""Provision the CAM-only report credential. Never put a Supabase admin key on a board."""
import hashlib
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
secret = ROOT / 'esp32_cam_ai/camera_registry_secret.h'
cli = shutil.which('supabase.cmd') or shutil.which('supabase')
if not cli:
    raise SystemExit('Supabase CLI is required; log in and link this project first.')

if secret.exists():
    match = re.search(r'#define CAM_DEVICE_TOKEN "([a-f0-9]{64})"', secret.read_text())
    if not match:
        raise SystemExit('Existing secret header is invalid; preserve it and repair it before provisioning.')
    token = match[1]
else:
    token = secrets.token_hex(32)
    # Save before provisioning so retries can reuse the credential after a network failure.
    secret.write_text('#pragma once\n#define CAM_DEVICE_TOKEN "' + token + '"\n', encoding='ascii')

digest = hashlib.sha256(token.encode('ascii')).hexdigest()
sql = ("insert into public.camera_endpoints(device_id,token_hash) values "
       f"('lh-navix-cam','{digest}') on conflict(device_id) do update "
       "set token_hash=excluded.token_hash where camera_endpoints.token_hash=excluded.token_hash;\n"
       "do $$ begin if not exists(select 1 from public.camera_endpoints where "
       f"device_id='lh-navix-cam' and token_hash='{digest}') then "
       "raise exception 'A different CAM credential is already provisioned; recover the original secret header.'; "
       "end if; end $$;")
with tempfile.TemporaryDirectory(prefix='camera-provision-') as temp:
    path = Path(temp) / 'provision.sql'
    path.write_text('begin;\n' + sql + '\ncommit;\n', encoding='utf-8')
    subprocess.run([cli, 'db', 'query', '--linked', '-f', str(path)], cwd=ROOT, check=True)
print('PASS CAM credential provisioned; local secret header is ignored by Git. Rebuild CAM before upload.')
