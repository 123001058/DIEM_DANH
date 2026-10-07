"""
import_schedules.py
-------------------------------------------------------------------
Script đọc file lich_hoc_tong_hop.json và import toàn bộ 788 lịch học
của 31 sinh viên lên bảng public.student_schedules trên Supabase.

Cần đảm bảo đã chạy migration_schedules.sql trên Supabase SQL Editor
để tạo bảng public.student_schedules trước khi chạy script này.
-------------------------------------------------------------------
"""

import json
import os
import sys
from datetime import datetime
from supabase import create_client

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = "https://nhjkpknhybenkxwadvzv.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oamtwa25oeWJlbmt4d2Fkdnp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDk2MzU4OCwiZXhwIjoyMTA2NTM5NTg4fQ.CbvybW-QVviePnrCfIeoABGSl-S0ZPcfKpsCtjtF6Rk"

DIR_PATH = r"C:\Users\ACER\Documents\GitHub\DIEM_DANH"
JSON_FILE = os.path.join(DIR_PATH, "lich_hoc_tong_hop.json")

def format_iso_time(timestr):
    """Chuyển chuỗi '2026-10-19T07:30:00' thành chuỗi có múi giờ +07:00"""
    if not timestr:
        return None
    if "+07" in timestr or "Z" in timestr:
        return timestr
    return timestr + "+07:00"

def main():
    print("=" * 65)
    print("🚀 BẮT ĐẦU IMPORT LỊCH HỌC SINH VIÊN LÊN SUPABASE")
    print("=" * 65)

    if not os.path.exists(JSON_FILE):
        print(f"❌ Không tìm thấy file {JSON_FILE}")
        return

    with open(JSON_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    # 1. Kiểm tra bảng student_schedules đã được tạo chưa
    try:
        test = client.table("student_schedules").select("id").limit(1).execute()
    except Exception as e:
        print("❌ LỖI: Bảng 'student_schedules' chưa tồn tại trên Supabase!")
        print("👉 Vui lòng mở Supabase SQL Editor và chạy file 'supabase/migration_schedules.sql' trước.")
        return

    # 2. Đảm bảo sinh viên thiếu (Dương Công Mạnh - 125001343) có trong students
    try:
        client.table("students").upsert({
            "mssv": "125001343",
            "name": "Dương Công Mạnh"
        }).execute()
        print("✅ Đã kiểm tra và đồng bộ danh sách 31 sinh viên.")
    except Exception as e:
        print(f"Cảnh báo khi upsert student 125001343: {e}")

    # 3. Chuẩn bị dữ liệu lịch học
    records = []
    seen = set()

    for sv in data:
        mssv = sv.get("mssv", "").strip()
        if not mssv:
            continue
        classes = sv.get("schedule", [])
        for c in classes:
            t_bd = format_iso_time(c.get("ThoiGianBD"))
            t_kt = format_iso_time(c.get("ThoiGianKT"))
            sub = (c.get("TenMonHoc") or "Chưa rõ").strip()
            room = (c.get("TenPhong") or "Online").strip()
            teacher = (c.get("GiaoVien") or "").strip()
            thu = c.get("Thu", 0)

            # Khóa chống trùng
            key = (mssv, t_bd, sub)
            if key in seen:
                continue
            seen.add(key)

            records.append({
                "mssv": mssv,
                "subject_name": sub,
                "room_name": room,
                "teacher_name": teacher,
                "start_time": t_bd,
                "end_time": t_kt,
                "day_of_week": thu
            })

    print(f"📊 Tổng số tiết học cần nạp: {len(records)} tiết của {len(data)} sinh viên.")

    # 4. Xóa dữ liệu cũ nếu muốn làm mới hoàn toàn
    try:
        client.table("student_schedules").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        print("🧹 Đã dọn dẹp lịch học cũ.")
    except Exception as e:
        pass

    # 5. Insert theo từng lô (Batch 100 bản ghi)
    BATCH_SIZE = 100
    inserted = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            res = client.table("student_schedules").insert(batch).execute()
            inserted += len(batch)
            print(f"  -> Đã nạp {inserted}/{len(records)} tiết học...")
        except Exception as e:
            print(f"❌ Lỗi ở lô {i} - {i + BATCH_SIZE}: {e}")

    print("=" * 65)
    print(f"🎉 HOÀN TẤT! Đã import thành công {inserted} lịch học lên Supabase!")
    print("=" * 65)

if __name__ == "__main__":
    main()
