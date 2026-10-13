# LH-NaviX: Hệ Thống Điểm Danh & Điều Hành Xưởng Robocon (Technical Architecture & System Specification)

## 1. Tổng Quan Kiến Trúc Hệ Thống (System Overview)

Hệ thống LH-NaviX là nền tảng quản trị và vận hành chuyên biệt cho xưởng chế tạo Robocon/câu lạc bộ kỹ thuật sinh viên, giải quyết bài toán:
- Điểm danh ca trực xưởng tự động, hạn chế gian lận điểm danh hộ.
- Đồng bộ và đối chiếu lịch học chính khóa của nhà trường để phân bổ lịch trực tối ưu.
- Quản lý nhiệm vụ theo 4 phân ban kỹ thuật (Cơ khí, Điện, Lập trình, Thiết kế).
- Tự động hóa truyền thông qua bot Zalo và phần cứng Kiosk IoT (ESP32).

### Tech Stack
- **Frontend**: Single Page Application (SPA) xây dựng bằng HTML5, CSS3 hiện đại, Vanilla JavaScript (không phụ thuộc framework nặng như React/Vue để tối ưu tốc độ tải và tính độc lập).
  - `checkin.html` (khoảng 66KB): Cổng thông tin sinh viên (Quét QR, xem lịch trực, nộp đơn xin nghỉ có ảnh minh chứng, nhận/hoàn thành nhiệm vụ, nội quy xưởng, hòm thư ẩn danh).
  - `admin.html` (khoảng 370KB): Bảng điều khiển quản trị viên (Tạo phiên điểm danh kèm QR động, quản lý thành viên 4 đội, Kanban/danh sách nhiệm vụ, duyệt đơn nghỉ phép, ma trận lịch rảnh/bận, tích hợp Zalo, nhật ký kiểm toán).
- **Backend & Database**: Supabase Platform (PostgreSQL 17).
  - Quản lý xác thực qua Supabase Auth kết hợp mã số sinh viên (MSSV).
  - Phân quyền hàng dữ liệu (Row Level Security - RLS) trên toàn bộ 24 bảng.
  - Xử lý nghiệp vụ phức tạp thông qua PostgreSQL Stored Procedures / RPC (Remote Procedure Call) và Triggers phía máy chủ.
  - Supabase Realtime WebSocket cập nhật tức thì danh sách điểm danh khi sinh viên quét mã.
  - Supabase Storage lưu trữ ảnh minh chứng đơn xin nghỉ.
- **Tự động hóa & IoT**:
  - Script Node.js + GitHub Actions tự động quét ma trận lịch rảnh/bận và gửi tin nhắn nhắc ca trực vào nhóm Zalo.
  - Kiosk phần cứng ESP32 hỗ trợ quét mã hoặc hiển thị thông tin ca trực tại cửa xưởng.

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Database Schema Design)

Cơ sở dữ liệu gồm 24 bảng chuẩn hóa trên PostgreSQL 17, được quản lý qua `supabase/schema.sql`:

### 2.1. Nhóm Quản Trị & Người Dùng
- `public.profiles`: Thông tin tài khoản liên kết với `auth.users`, chứa `id`, `mssv`, `role` ('admin' | 'student'), `full_name`.
- `public.students`: Hồ sơ sinh viên chi tiết (MSSV, họ tên, lớp, chuyên ngành, số điện thoại, nhóm chuyên môn, trạng thái hoạt động).
- `public.admin_mssv`: Danh sách MSSV có đặc quyền quản trị viên, dùng để tự động phân quyền khi tài khoản đăng ký/đăng nhập.
- `public.workshop_rules`: Nội quy an toàn lao động và kỷ luật xưởng.
- `public.anonymous_feedback`: Phản hồi, góp ý, báo cáo hư hỏng thiết bị ẩn danh kèm mã biên nhận (`public_code`).
- `public.password_reset_requests`: Yêu cầu cấp lại mật khẩu cho sinh viên quên mật khẩu, quản trị viên duyệt và sinh mật khẩu tạm.

### 2.2. Nhóm Điểm Danh & Phiên Trực (Attendance & Sessions)
- `public.attendance_sessions`: Các phiên điểm danh mở theo ca trực (Sáng, Chiều, Tối). Hỗ trợ thời lượng hết hạn, token bí mật của phiên, cơ chế QR tĩnh hoặc QR xoay vòng liên tục theo chu kỳ thời gian (dynamic rotating QR).
- `public.attendance`: Bản ghi điểm danh của sinh viên (`session_id`, `mssv`, `status`: có mặt / muộn / vắng, `category`: chuyên ban, `device_id`, thời gian quét).
- `public.attendance_audit_logs`: Lịch sử kiểm toán can thiệp dữ liệu điểm danh (khi Admin sửa hoặc điểm danh bù thủ công, ghi nhận ai sửa, lý do và giá trị trước/sau).
- `public.attendance_record_history`: Nhật ký chi tiết trạng thái điểm danh qua các mốc thời gian.
- `public.device_locks`: Bảng ghi nhận định danh phần cứng/trình duyệt (`device_id`) gắn với MSSV để ngăn chặn một thiết bị điểm danh cho nhiều tài khoản khác nhau.

### 2.3. Nhóm Phân Ca & Lịch Học (Schedules & Shifts)
- `public.school_schedules`: Thời khóa biểu chính khóa của sinh viên tại trường đại học (thứ trong tuần, tiết học, phòng học, môn học).
- `public.student_schedules`: Bảng tổng hợp lịch học đã parse theo ngày thực tế để tính toán thời gian rảnh/bận.
- `public.schedule_configs` & `public.duty_schedules`: Cấu hình ca trực cố định và phân công trực xưởng cho từng thành viên.

### 2.4. Nhóm Nhiệm Vụ & Nhật Ký Hoạt Động (Tasks & Audit Trail)
- `public.team_tasks`: Nhiệm vụ kỹ thuật (tiêu đề, mô tả, hạn chót, độ ưu tiên, trạng thái: chưa làm / đang làm / hoàn thành, phạm vi: toàn xưởng, nhóm chuyên môn, hoặc cá nhân).
- `public.team_task_assignments`: Bảng liên kết trung gian giữa nhiệm vụ và sinh viên thực hiện. Sử dụng trigger tự động gán nhiệm vụ nhóm cho thành viên mới gia nhập (`ON CONFLICT DO NOTHING`). Hỗ trợ cơ chế tranh chấp/nhận việc toàn xưởng (Claim lock: chỉ 1 người được nhận việc chung tại một thời điểm, có quyền hủy nhận hoặc hoàn thành cho tất cả).
- `public.team_task_activity_logs`: Nhật ký kiểm toán bất biến (Immutable Audit Log) cho mọi thao tác nhiệm vụ (tạo, đổi trạng thái, hoàn thành, giao lại, xóa). Cột `task_id` dùng `ON DELETE SET NULL` kèm snapshot tiêu đề để lịch sử không bị mất khi xóa task.

### 2.5. Nhóm Đơn Xin Nghỉ Phép (Leave Requests)
- `public.leave_requests`: Đơn xin phép vắng mặt (ngày nghỉ, buổi nghỉ: sáng/chiều/tối/cả ngày, lý do bắt buộc, ảnh minh chứng tải lên Supabase Storage, trạng thái: chờ duyệt / đã duyệt / từ chối).
- `public.leave_notifications`: Thông báo tự động gửi về giao diện sinh viên khi đơn được xử lý.

---

## 3. Cơ Chế Bảo Mật & Chống Gian Lận (Security & Anti-Fraud Mechanisms)

1. **Khóa Thiết Bị (Device Lock)**:
   - Client sinh mã định danh duy nhất (UUID) lưu trong `localStorage`.
   - Lần đầu điểm danh, `device_id` được liên kết cố định với MSSV trong bảng `public.device_locks`.
   - Nếu phát hiện cùng một `device_id` điểm danh cho MSSV thứ 2, hoặc một MSSV điểm danh từ `device_id` lạ chưa được cấp phép, hệ thống từ chối hoặc cảnh báo gian lận.
2. **Mã QR Động Xoay Vòng (Dynamic Rotating QR)**:
   - Trên màn hình máy chiếu/admin xưởng, mã QR được tái tạo sau mỗi chu kỳ (ví dụ 10–30 giây) kèm một mã băm bí mật dựa trên thời gian thực (HMAC / rotating session token).
   - Ngăn chặn sinh viên chụp ảnh mã QR gửi qua Zalo/Messenger cho bạn bè ở nhà quét hộ.
3. **Phân Quyền RLS & Bảo Vệ Dữ Liệu**:
   - Mọi bảng đều bật `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
   - Sinh viên chỉ được đọc dữ liệu cá nhân, đọc nội quy và đọc nhiệm vụ được phân công.
   - Các thao tác cập nhật quan trọng (duyệt đơn, sửa điểm danh, ghi log) bắt buộc thực hiện qua RPC được kiểm tra `auth.uid()` và vai trò admin trên server, không tin tưởng tham số do client gửi lên.

---

## 4. Các Điểm Hạn Chế & Vấn Đề Kỹ Thuật Cần Đánh Giá (Points for Review)

1. **Kiến Trúc Frontend Monolith**:
   - `admin.html` có kích thước ~370KB gộp chung toàn bộ template HTML, style CSS và logic JavaScript của 9 màn hình quản trị vào một file. Điều này giúp dễ chạy trực tiếp không cần build step, nhưng có nguy cơ khó bảo trì khi dự án phình to.
2. **Độ Tin Cậy của Device Lock trên Web**:
   - Cơ chế `device_id` dựa trên `localStorage` của trình duyệt có thể bị sinh viên can thiệp nếu mở ẩn danh hoặc đổi trình duyệt. Có nên bổ sung thêm FingerprintJS, kiểm tra IP mạng nội bộ Wi-Fi xưởng (LAN Subnet), hay Geofencing GPS?
3. **Áp Lực Concurrency khi Điểm Danh**:
   - Khi ca trực bắt đầu, 30–50 sinh viên cùng quét mã QR trong vòng 1-2 phút. Cần đánh giá hiệu năng của các hàm RPC, chỉ mục bảng `attendance`, và kết nối Supabase Free Tier có chịu tải mượt mà không.
4. **Quy Trình Quản Lý Nhiệm Vụ & Phân Ca**:
   - Đánh giá tính khả thi và tiện lợi của ma trận phân ca 3 ca (Sáng/Chiều/Tối) đối chiếu với thời khóa biểu trường so với việc sắp lịch thủ công truyền thống.
