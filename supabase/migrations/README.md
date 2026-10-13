# Supabase Migrations Directory

## Structure

- `20261012000000_baseline_schema.sql`:
  Bản schema tổng thể hợp nhất (Baseline) đã được kiểm chứng hoạt động 100% với remote database. Bao gồm đầy đủ:
  - 24 bảng CSDL `public`
  - RLS policies (Row-Level Security)
  - 59 hàm RPC hoạt động
  - Triggers và Sequences

- `../migrations_archive/`:
  Lưu trữ 24 file migration lịch sử dạng vá lỗi từng ngày trong giai đoạn phát triển ban đầu (phục vụ đối chiếu vết, không cần chạy lại).
