# Supabase Deployment Checklist - Phase 2 (Change Password System)

## A. MIGRATIONS TO DEPLOY

Cần chạy 2 file migration tuần tự trong thư mục `supabase/migrations/`:

1. **`20261008094600_auth_must_change_password.sql`**
   - *Nhiệm vụ:* Bổ sung cột `must_change_password` vào bảng `public.profiles` và tạo trigger `handle_password_changed` trên bảng `auth.users`.
   - *Loại:* Schema Update (An toàn, không phá vỡ dữ liệu cũ).

2. **`20261008094610_data_mark_old_users.sql`**
   - *Nhiệm vụ:* ONE-TIME DATA MIGRATION. Đánh dấu `must_change_password = true` cho toàn bộ tài khoản hiện hành.
   - *Loại:* Data Update. Chỉ được chạy 1 lần.

## B. EDGE FUNCTIONS TO DEPLOY

1. **`admin-reset-password`**
   - *Thư mục:* `supabase/functions/admin-reset-password/`
   - *Nhiệm vụ:* Tiếp nhận JWT của Admin, bypass RLS qua Service Role Key, kiểm tra Admin Scope, đổi pass cho sinh viên và đẩy `admin_reset_at` vào `app_metadata`.

## C. SECRETS VÀ ENVIRONMENT VARIABLES

Edge Function `admin-reset-password` yêu cầu 3 biến môi trường (mặc định Supabase đã cấu hình sẵn 2 biến đầu tiên, nhưng cần kiểm tra chắc chắn):

1. `SUPABASE_URL`: Đường dẫn API của dự án.
2. `SUPABASE_ANON_KEY`: Khóa công khai ẩn danh (dùng để instantiate client verify JWT).
3. `SUPABASE_SERVICE_ROLE_KEY`: Secret Key quyền cao nhất (dùng để bypass RLS cập nhật auth.users).
   *(Cảnh báo: TUYỆT ĐỐI không được lộ key này ở phía Frontend)*.

## D. THỨ TỰ DEPLOY (EXACT DEPLOY ORDER)

1. Mở SQL Editor trên Supabase Dashboard.
2. Chạy nội dung file `20261008094600_auth_must_change_password.sql`.
3. Chạy nội dung file `20261008094610_data_mark_old_users.sql` (chạy duy nhất 1 lần).
4. Deploy Edge Function thông qua Supabase CLI:
   `supabase functions deploy admin-reset-password`
   *(Ghi chú: Gateway sẽ tự động verify JWT trước khi gọi function, thêm 1 lớp bảo vệ bên cạnh việc tự verify bằng `is_admin()` trong code)*.
5. Kiểm tra và gán secret:
   `supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...` (Thường Supabase tự động inject trên production, có thể bỏ qua bước này trên đám mây, nhưng cần nếu test local).
6. Upload các file HTML/JS/CSS đã sửa (`change-password.html`, `admin.html`, `checkin.html`, `js/auth.js`) lên hosting frontend.

## E. PRODUCTION VERIFICATION (FINAL TEST CHECKLIST)

Sau khi deploy, Admin cần test bắt buộc các kịch bản sau:

- [ ] **Tài khoản cũ:** Đăng nhập một tài khoản sinh viên cũ -> Bắt buộc bị redirect qua màn hình "Đổi mật khẩu".
- [ ] **Saved plaintext removed:** Kiểm tra LocalStorage trên trình duyệt -> Không còn key `saved_creds`, chỉ còn `saved_mssv`.
- [ ] **User tự đổi password:** Nhập mật khẩu cũ, mật khẩu mới (>= 6 ký tự) -> Báo thành công, nhảy vào trang điểm danh.
- [ ] **Login lại với password mới:** Đăng xuất và đăng nhập lại bằng password mới -> Thành công. Mật khẩu cũ -> Báo sai.
- [ ] **Admin reset Student:** Đăng nhập bằng Admin, click nút `🔑 Reset Pass` cho một Sinh viên -> Modal hiện ra báo Password Tạm.
- [ ] **Student bị force change:** Dùng password tạm đăng nhập vào tài khoản sinh viên đó -> Bắt buộc bị đẩy qua trang Đổi mật khẩu.
- [ ] **Student thử reset người khác:** Thử giả mạo JWT gọi POST tới Edge Function `admin-reset-password` -> Phải nhận HTTP 403 Forbidden.
- [ ] **Admin thử reset Admin:** Đăng nhập bằng Admin, thử nhập MSSV của Admin khác (sửa DOM hoặc gọi HTTP) -> Edge Function phải ném lỗi HTTP 403.
- [ ] **Chức năng cũ:** Mở phiên, đóng phiên, đổi QR và điểm danh vẫn hoạt động bình thường, không bị ảnh hưởng.
- [ ] **Frontend Security:** Ctrl+Shift+F tìm kiếm `SUPABASE_SERVICE_ROLE_KEY` trong các file frontend -> Chắc chắn 0 kết quả trả về.

## F. ROLLBACK PLAN

- **Nếu Migration Schema Lỗi:**
  Chạy lệnh: `DROP TRIGGER IF EXISTS on_password_changed ON auth.users; DROP FUNCTION IF EXISTS public.handle_password_changed(); ALTER TABLE public.profiles DROP COLUMN IF EXISTS must_change_password;`
- **Nếu Data Migration Lỗi:** 
  Có thể reset cờ bằng: `UPDATE public.profiles SET must_change_password = false;`
- **Nếu Edge Function Lỗi:**
  Không ảnh hưởng đến luồng chính. Admin tạm thời không dùng được nút Reset, nhưng Sinh viên vẫn đăng nhập và điểm danh được (nếu cờ `must_change_password` là false).
- **Nếu Frontend Lỗi:**
  Revert lại commit code HTML/JS cũ. Hệ thống UI Guard sẽ bị tắt và sinh viên tiếp tục dùng mật khẩu cũ như xưa.
