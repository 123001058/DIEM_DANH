# Ảnh đại diện sinh viên & nạp dữ liệu khuôn mặt (Avatar & Face Uploads)

## Chức năng (What it does)

- Sinh viên tự **đổi ảnh đại diện** (avatar) của mình; ảnh hiển thị ở trang điểm danh, trang khuôn mặt và bảng quản trị.
- Sinh viên **nạp mẫu khuôn mặt** cho 5 góc bằng 2 cách: chụp webcam trực tiếp hoặc **tải ảnh có sẵn từ thiết bị** (từng góc hoặc hàng loạt). Ảnh được trích xuất vector 128D (face-api) và lưu vào `student_face_data`.
- Admin **xuất toàn bộ descriptor + thumbnail khuôn mặt** (JSON) để huấn luyện nhận diện cho camera ESP32-S3-CAM / Kiosk.

## Vị trí mã nguồn (Where it lives)

- **Database**: `supabase/migrations/20261017090000_student_avatar_and_face_uploads.sql`
  - Bucket Storage `avatars` (public) + RLS policies trên `storage.objects`.
  - RPC `public.student_set_my_avatar(p_avatar text)`.
  - RPC `public.admin_export_face_data()`.
  - Đồng bộ trong `supabase/schema.sql` (mục 10).
- **Frontend**:
  - `face-sinhvien.html`: thẻ đổi avatar, nút "📁 Tải ảnh" từng góc, "📁 Tải nhiều ảnh từ thiết bị", giữ nguyên chụp webcam.
  - `checkin.html`: hiển thị avatar trong `#userAvatar` (bấm vào để mở trang đổi ảnh).
  - `admin.html`: nút "⬇️ Xuất dữ liệu khuôn mặt (JSON)" ở view Camera Khuôn mặt; `exportAllFaceData()`.

## Nguyên lý hoạt động (How it works)

1. **Avatar**: client nén/cắt vuông ảnh về 512×512 JPEG (`makeSquareAvatarBlob`) rồi upload lên `avatars/<mssv>/avatar.jpg` (`upsert: true`). Sau đó gọi RPC `student_set_my_avatar` để ghi URL (kèm `?t=timestamp` chống cache) vào `students.avatar`.
2. **Phân quyền Storage**: sinh viên chỉ ghi được vào thư mục mang đúng MSSV của mình — policy kiểm tra `(storage.foldername(name))[1]` khớp `profiles.mssv` của `auth.uid()`; admin ghi được mọi thư mục.
3. **Nạp ảnh khuôn mặt**: ảnh tải lên được chạy qua `faceapi.detectSingleFace(...).withFaceLandmarks(true).withFaceDescriptor()`. Nếu tìm thấy đúng 1 khuôn mặt, trích `descriptor` (128D) + `thumbnail` 100×100 và lưu, y hệt ảnh chụp webcam. Vòng lặp tự chuyển sang góc còn trống.
4. **Xuất huấn luyện**: `admin_export_face_data()` (kiểm tra `is_admin()`) gom toàn bộ dòng có descriptor/thumbnail thành JSON để tải về.

## Lỗi thường gặp (Common mistakes)

- **Dùng `students_write_all` để cho sinh viên sửa avatar**: policy này cho phép authenticated sửa *bất kỳ* dòng nào. Luôn dùng RPC `security definer` giới hạn theo `auth.uid()`.
- **Lưu base64 avatar vào `students.avatar`**: làm phình cột DB và chậm tải danh sách. Dùng Storage + URL.
- **Quên `upsert: true`**: upload lại avatar cùng đường dẫn sẽ báo lỗi `Duplicate`.
- **Ảnh nhiều khuôn mặt / không rõ mặt**: bị bỏ qua có chủ đích — chỉ nhận ảnh 1 khuôn mặt để tránh gán sai danh tính.

## Triển khai (Deploy)

Chạy migration mới trên Supabase (SQL Editor dán nội dung file, hoặc `supabase db push`). Migration tạo bucket `avatars`; nếu bucket đã tồn tại sẽ được `on conflict do update`.
