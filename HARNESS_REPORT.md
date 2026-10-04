# BÁO CÁO PHÂN TÍCH TỔNG THỂ DỰ ÁN DIEM_DANH (DURABLE REPORT)

*Được sinh ra bởi Antigravity Lead Analyzer (Manual Bypass)*

---

## 1. TỔNG QUAN KIẾN TRÚC (ARCHITECTURE SUMMARY)
- **Frontend**: Vanilla JS, CSS (custom, hiện đại với dark/glass mode) + HTML thuần.
- **Backend/DB**: Supabase (PostgreSQL).
- **Authentication**: Supabase Auth, phân quyền bằng Allowlist và bảng `profiles`.
- **Triển khai (Deployment)**: Static Web Hosting kết nối API thông qua CDN Supabase JS.
- **Mức độ phức tạp**: Nhỏ gọn gọn gàng, phù hợp để mở rộng nhưng chưa có mô hình Component hóa (VD: React/Vue).

---

## 2. PHÂN TÍCH BẢO MẬT & DỮ LIỆU (SECURITY & DATABASE)

### 🟢 Các Điểm Tốt (Đã hoàn thiện)
1. **Kiểm soát Truy cập (RLS - Row Level Security)**:
   - Các bảng cốt lõi (`sessions`, `attendance`, `students`) đều bị khoá đọc/ghi từ public (`anon`).
   - Profile người dùng được phân tách rõ (chỉ được đọc thông tin của chính mình).
2. **Cơ chế QR Token**:
   - Áp dụng cấu trúc `HMAC-SHA256` bằng khóa Server-side bí mật (`qr_secret`).
   - Gắn liền với cửa sổ thời gian hẹp (Time window) ngăn ngừa kẻ xấu tự generate mã (đã fix dung sai xuống mức cực thấp `3s`).
3. **Quản lý Tài khoản Admin**:
   - Sử dụng Edge Function (Admin API) để khởi tạo user, không ghi trực tiếp vào schema `auth` thông qua SQL thuần (ngăn rủi ro hỏng hệ thống khi Supabase nâng cấp).
4. **Tính Idempotent của CSDL**:
   - Toàn bộ `schema.sql` đã được bọc `IF NOT EXISTS` và `DO $$ BEGIN ... END` một cách chặt chẽ. Đảm bảo chạy lại script không phá hỏng dữ liệu gốc.

### 🔴 Các Điểm Yếu & Khuyến nghị (Vulnerabilities & Findings)

> [!WARNING]
> **Finding 1: Kẽ hở "Điểm danh hộ" thông qua ảnh chụp màn hình QR**
> - **Nguyên nhân**: Token QR đang hoạt động dưới dạng Bearer Token tĩnh theo thời gian ngắn. Tuy nhiên, thời gian để chụp màn hình và gửi qua Zalo/Messenger cho bạn bè thường chỉ mất từ 3-5 giây. Với refresh_time = 3s (và sai số 3s), vẫn có tỷ lệ nhỏ token được accept.
> - **Đề xuất nâng cấp (Optimize Track)**: 
>   1. Bổ sung `navigator.geolocation` ở client (`checkin.js`). Yêu cầu sinh viên phải ở bán kính < 50m so với tọa độ của thiết bị Admin (Gửi tọa độ lên RPC).
>   2. Chặn các trình duyệt/thiết bị cố tình từ chối cung cấp quyền truy cập Vị trí.

> [!WARNING]
> **Finding 2: Định danh thiết bị (Device Fingerprinting) lỏng lẻo**
> - **Nguyên nhân**: `device_id` hiện tại đang được tạo bằng chuỗi ngẫu nhiên (`Math.random()`) lưu vào `localStorage`. Sinh viên rành công nghệ có thể dùng chế độ Ẩn danh (Incognito) hoặc xóa `localStorage` để tạo `device_id` mới và điểm danh cho nhiều người.
> - **Đề xuất nâng cấp (Operationalize Track)**:
>   - Ghi nhận thêm IP Address hoặc sử dụng thư viện FingerprintJS để nhận diện phần cứng/trình duyệt, tăng độ tin cậy của thiết bị quét.

---

## 3. PHÂN TÍCH GIAO DIỆN & TRẢI NGHIỆM NGƯỜI DÙNG (UI/UX)

- **Ưu điểm**: Thiết kế Dark mode cực kỳ hiện đại, sử dụng font chữ Plus Jakarta Sans tạo cảm giác thanh lịch, cao cấp. Hệ thống badge báo lỗi / thành công (OK, ERR, WARN) xử lý trực quan và phản hồi nhanh chóng.
- **Điểm nghẽn tiềm ẩn**: 
  - Khung Dropdown trạng thái ở phần Admin (`admin_set_status`) đang thao tác bằng chuột/cảm ứng từng dòng. Nếu sĩ số lớp lên tới 100-200 sinh viên, thao tác click chuyển trạng thái thủ công sẽ khá mỏi. **Nên thêm tính năng "Đánh dấu tất cả là Có mặt" hoặc "Đánh dấu tất cả người chưa quét là Vắng"**.

---

## 4. KHUYẾN NGHỊ VÒNG ĐỜI DỰ ÁN (LIFECYCLE CONTROLS)

- Dự án hiện tại toàn bộ code Frontend nằm ở thư mục root. Khuyến nghị bạn có thể chuyển dự án sang dạng **Vite + Vanilla JS** để:
  1. Giảm dung lượng file khi build (Minification).
  2. Không để lộ comment code hoặc logic gốc (`admin.js`, `auth.js`) lên Production.
  3. Dễ dàng cài đặt các thư viện mã hóa (ví dụ thư viện GeoLocation hoặc Fingerprint).

---
*Tài liệu này được sinh tự động bởi Antigravity Lead Analyzer. Bất kỳ Findings nào ở mục 2 đều có thể được sửa chữa nếu bạn ra lệnh cho AI Agent thực thi.*
