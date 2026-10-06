import json
from supabase import create_client, Client

# ================= CONFIGURATION =================
SUPABASE_URL = "https://nhjkpknhybenkxwadvzv.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oamtwa25oeWJlbmt4d2Fkdnp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDk2MzU4OCwiZXhwIjoyMTA2NTM5NTg4fQ.CbvybW-QVviePnrCfIeoABGSl-S0ZPcfKpsCtjtF6Rk"
JSON_FILE = "students.json" 
EMAIL_SUFFIX = "@sv.local"
# =================================================

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def import_students():
    try:
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            students = data.get('students', [])
        
        print(f"🚀 Đang bắt đầu import {len(students)} sinh viên từ file JSON...")

        for s in students:
            mssv = s['mssv']
            name = s['name']
            email = f"{mssv}{EMAIL_SUFFIX}"
            password = mssv # Mật khẩu chính là MSSV
            
            try:
                # 1. Tạo user trong Supabase Auth
                supabase.auth.admin.create_user({
                    "email": email,
                    "password": password,
                    "email_confirm": True
                })
                
                # 2. Thêm vào bảng profiles
                supabase.table("profiles").upsert({
                    "mssv": mssv,
                    "full_name": name,
                    "is_admin": False
                }).execute()
                
                print(f"✅ Thành công: {mssv} - {name}")
            except Exception as e:
                print(f"❌ Lỗi {mssv}: {e}")

        print("\n🎉 Đã hoàn thành import tất cả sinh viên!")

    except Exception as e:
        print(f"❌ Lỗi đọc file: {e}")

if __name__ == "__main__":
    import_students()

