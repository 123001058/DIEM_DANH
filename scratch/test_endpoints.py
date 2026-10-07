import urllib.request, json
endpoints = [
    'https://api.supabase.com/v1/projects/nhjkpknhybenkxwadvzv/database/query',
    'https://nhjkpknhybenkxwadvzv.supabase.co/rest/v1/rpc/exec_sql',
    'https://nhjkpknhybenkxwadvzv.supabase.co/rest/v1/rpc/execute_sql',
]
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oamtwa25oeWJlbmt4d2Fkdnp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDk2MzU4OCwiZXhwIjoyMTA2NTM5NTg4fQ.CbvybW-QVviePnrCfIeoABGSl-S0ZPcfKpsCtjtF6Rk'
for ep in endpoints:
    try:
        data = json.dumps({'query': 'SELECT 1;'}).encode()
        req = urllib.request.Request(ep, data=data, headers={'Authorization': f'Bearer {key}', 'apikey': key, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as resp:
            print(ep, '->', resp.status)
    except Exception as e:
        print(ep, '->', e)
