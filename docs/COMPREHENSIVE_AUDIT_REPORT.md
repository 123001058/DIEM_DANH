# BÁO CÁO KIỂM TOÁN VÀ KIỂM ĐỊNH TOÀN DIỆN HỆ THỐNG LH-NAVIX
## COMPREHENSIVE E2E VERIFICATION & SUPABASE BACKEND AUDIT REPORT

- **Dự án:** LH-NaviX — Hệ thống Điểm danh & Quản trị Xưởng Thông minh
- **Mã kiểm toán:** COMPREHENSIVE-AUDIT-2026-M4
- **Ngày hoàn thành:** 2026-10-31
- **Đơn vị thực hiện:** Nhóm Kỹ thuật & Kiểm định Độc lập LH-NaviX (Teamwork M1 - M4)
- **Tiêu chuẩn kiểm toán:** Bám sát tuyệt đối yêu cầu kỹ thuật tại `ORIGINAL_REQUEST.md`, kiến trúc hệ thống `PROJECT.md`, và hiến chương `AGENTS.md`.

---

## MỤC LỤC
1. [Tóm Tắt Thực Thi (Executive Summary)](#1-tóm-tắt-thực-thi-executive-summary)
2. [Phạm Vi & Kiến Trúc Hệ Thống Được Kiểm Toán](#2-phạm-vi--kiến-trúc-hệ-thống-được-kiểm-toán)
3. [R1: Kiểm Định Toàn Diện Phân Hệ Quản Trị (Admin Subsystem)](#3-r1-kiểm-định-toàn-diện-phân-hệ-quản-trị-admin-subsystem)
4. [R2: Kiểm Định Toàn Diện Phân Hệ Sinh Viên (Student Subsystem)](#4-r2-kiểm-định-toàn-diện-phân-hệ-sinh-viên-student-subsystem)
5. [R3: Bảng Danh Mục Phân Loại Lỗi & Điểm Nghẽn Backend (Taxonomy Matrix)](#5-r3-bảng-danh-mục-phân-loại-lỗi--điểm-nghẽn-backend-taxonomy-matrix)
6. [Ma Trận Nghiệm Thu Tiêu Chí (Acceptance Criteria Matrix)](#6-ma-trận-nghiệm-thu-tiêu-chí-acceptance-criteria-matrix)
7. [Bằng Chứng Thực Nghiệm Bộ Kiểm Thử Tổng Hợp Master Runner](#7-bằng-chứng-thực-nghiệm-bộ-kiểm-thử-tổng-hợp-master-runner)
8. [Tuân Thủ Quy Chuẩn & Bảo Toàn Tính Năng Đóng Băng (Frozen Features)](#8-tuân-thủ-quy-chuẩn--bảo-toàn-tính-năng-đóng-băng-frozen-features)
9. [Kết Luận & Khuyến Nghị Vận Hành](#9-kết-luận--khuyến-nghị-vận-hành)

---

## 1. TÓM TẮT THỰC THI (EXECUTIVE SUMMARY)

Đợt kiểm toán toàn diện hệ thống LH-NaviX được tiến hành nhằm rà soát toàn bộ các chức năng của hai phân hệ chính: **Quản trị viên (Admin)** và **Sinh viên (Student)**, cùng tương tác mạng và cơ sở dữ liệu với nền tảng **Supabase Cloud (PostgreSQL 17, PostgREST, RLS, Storage, Realtime, Edge Functions)**.

### Kết quả then chốt:
1. **Kiểm tra cú pháp & AST**: 100% file JavaScript (10 files) và HTML (6 files) đạt cú pháp hợp lệ, không có lỗi runtime crash khi khởi tạo.
2. **Khắc phục lỗi thực thi mã nguồn Client (Frontend Bugs)**:
   - Đã xử lý triệt để lỗi thiếu hàm `confirmReopenSession()` tại `admin.html:355` gây `Uncaught ReferenceError` khi mở lại phiên đã đóng.
   - Đã hợp nhất hàm `focusAddStudentMssv()` bị khai báo trùng lặp (function shadowing) tại `js/admin/admin.students.js:206` và `721`, đảm bảo thẻ form luôn mở trước khi focus input.
   - Đã dọn dẹp biến và khai báo dư thừa hàm `sleep()` tại `admin.students.js:13`.
   - Đã loại bỏ hoàn toàn dead code tham chiếu phần tử không tồn tại `#fbModal` trong `checkin.html:1332` và `1564`.
   - Đã xóa bỏ lệnh đột biến trực tiếp `.from('students').upsert` vi phạm chính sách bảo mật RLS trong `js/admin/admin.tasks.js:1513`.
3. **Khắc phục lỗi phản hồi & Thiếu hụt cấu trúc Supabase Backend (Backend Gaps)**:
   - Triển khai thành công migration `20261031030000_enable_realtime_sessions_and_read_policy.sql`: bổ sung bảng `public.sessions` vào publication `supabase_realtime`, cấp policy SELECT an toàn (`USING (true)`) cho cả role `anon` và `authenticated`. Khắc phục hoàn toàn lỗi sinh viên không nhận được cập nhật đổi mã QR / đóng phiên qua WebSocket, và lỗi câu query join `sessions(session_name)` trong đơn xin nghỉ bị trả về `null`.
4. **Kiểm chứng độc lập qua Master Runner (`scratch/run_full_system_verification.js`)**:
   - Tích hợp 11 bộ kiểm thử tự động độc lập từ các đội Worker, Challenger và Forensic Auditor.
   - Tổng cộng **257/257 kiểm tra chi tiết (granular assertions) đạt PASS 100%** (0 lỗi, 0 regression), thời gian thực thi: **38.55 giây**.

---

## 2. PHẠM VI & KIẾN TRÚC HỆ THỐNG ĐƯỢC KIỂM TOÁN

### 2.1. Phân tầng kiến trúc ứng dụng (Application Stack)
```
+-----------------------------------------------------------------------------------+
|                                 CLIENT TIER                                       |
|  [Admin Subsystem]              [Student Subsystem]        [Shared Client Libs]   |
|  - admin.html (10 views, 16 modals) - checkin.html (6 views)    - js/config.js    |
|  - js/admin/admin.core.js       - face-sinhvien.html       - js/auth.js           |
|  - js/admin/admin.leave.js      - lichhoc.html / lichhoc.js- js/lichhoc.js        |
|  - js/admin/admin.schedules.js  - index.html (Auth Portal)                        |
|  - js/admin/admin.tasks.js      - change-password.html                            |
|  - js/admin/admin.students.js                                                     |
|  - js/admin/admin.attendance.js                                                   |
|  - js/admin/admin.face.js                                                         |
+-----------------------------------------------------------------------------------+
                                         │
                   HTTPS REST (PostgREST) / WSS (Realtime)
                                         │
+-----------------------------------------------------------------------------------+
|                        SUPABASE BACKEND TIER (Cloud PG 17)                        |
|  - 28 Bảng Cơ sở dữ liệu (100% RLS Enabled, 49 RLS Policies)                      |
|  - 74 Stored Procedures / RPCs (100% SECURITY DEFINER, search_path hardened)      |
|  - 2 Storage Buckets: 'avatars' (Public), 'leave-evidence' (Private Signed URLs)  |
|  - 8 Business Triggers (đồng bộ nghỉ phép, đối chiếu TKB ME & Lịch ngoài, audit)  |
|  - 1 Edge Function (admin-reset-password với Service Role Key)                    |
|  - Supabase Realtime Channels ('attendance', 'sessions')                          |
+-----------------------------------------------------------------------------------+
                                         │
                        Local Network Stream / Hardware
                                         │
+-----------------------------------------------------------------------------------+
|                         IOT & HARDWARE PERIPHERALS                                |
|  - ESP32 Kiosk (TFT LCD 320x240, QR Code Dynamic Polling, Split Screen, Avatars)  |
|  - ESP32 Cam AI (OV2640, MJPEG Stream Port 81, Active LOW Buzzer Port 80)        |
+-----------------------------------------------------------------------------------+
```

---

## 3. R1: KIỂM ĐỊNH TOÀN DIỆN PHÂN HỆ QUẢN TRỊ (ADMIN SUBSYSTEM)

Phân hệ Quản trị vận hành theo kiến trúc SPA trên nền tảng `admin.html` kết hợp cùng 7 module JavaScript chuyên biệt tại thư mục `js/admin/`.

### 3.1. Rà soát 10 View Giao Diện Chính
| STT | View Selector | Tên Chức Năng | Mục Đích Nghiệp Vụ & Trạng Thái Thực Thi | Kết Quả Rà Soát |
|---|---|---|---|---|
| 1 | `#view-overview` | Bảng điều khiển Tổng quan | Hiển thị thống kê tổng quan toàn xưởng, trạng thái phiên điểm danh hiện hành, tiến độ nhiệm vụ các nhóm kỹ thuật. | PASS — Dữ liệu nạp mượt, không lỗi console |
| 2 | `#view-attendance` | Bảng điều khiển Điểm danh | Hiển thị đồng hồ đếm ngược, mã QR động, bảng điểm danh realtime, thẻ báo cáo lịch sử `#attendanceReportCard`, xuất file Excel phân loại màu sắc. | PASS — Realtime channel `admin-changes` bắt nhịp chuẩn |
| 3 | `#view-face-cam` | Điểm danh Camera AI | Kết nối luồng stream ESP32/Webcam, nhận diện khuôn mặt qua Face-API (128-d descriptor), kiểm tra người thật MiniFASNet, chống kêu còi liên tục. | PASS — Tham số threshold 0.40 và debounce 4s an toàn |
| 4 | `#view-students` | Quản trị Sinh viên | Danh mục hồ sơ sinh viên, thiết lập ngày học kỳ, tra cứu/đồng bộ lịch ME Đại học Lạc Hồng, ma trận phân nhóm Robocon, xóa sinh viên có cảnh báo. | PASS — Đã sửa lỗi nút "+ Thêm sinh viên" |
| 5 | `#view-tasks` | Quản trị Nhiệm vụ | Danh sách việc xưởng/nhóm/cá nhân, bộ lọc theo phạm vi, cập nhật tiến độ hoàn thành, drawer xem nhật ký hoạt động. | PASS — Đã gỡ bỏ lệnh upsert vi phạm RLS |
| 6 | `#view-leave` | Quản lý Đơn xin nghỉ | Bảng danh sách đơn theo ngày/tuần, ma trận trạng thái, duyệt/từ chối đơn, chat trao đổi 2 chiều kèm xem ảnh minh chứng từ bucket `leave-evidence`. | PASS — Signed URL và RPC chat hoạt động chính xác |
| 7 | `#view-schedules` | Thời khóa biểu & Nội quy | Nhúng iframe thời khóa biểu ME (`lichhoc.html?embed=1`) và quản trị CRUD nội quy xưởng Robocon (`workshop_rules`). | PASS — Giao diện nhúng mượt mà, phân quyền rõ ràng |
| 8 | `#view-feedback` | Hòm thư Góp ý ẩn danh | Xem danh sách ý kiến đóng góp, báo cáo sự cố ẩn danh từ sinh viên, cập nhật trạng thái xử lý (đang xem xét, đã xử lý). | PASS — Tải dữ liệu qua RPC bảo mật, không lộ MSSV |
| 9 | `#view-password-reset` | Cấp lại Mật khẩu | Hàng đợi yêu cầu cấp lại mật khẩu của sinh viên, kích hoạt Edge Function `admin-reset-password`, modal hiển thị mật khẩu tạm. | PASS — Phân quyền Admin được kiểm tra nghiêm ngặt |
| 10 | `#view-zalo` | Ma trận Phân ca Zalo | Tính toán ma trận Rảnh/Bận của sinh viên theo từng ca (Sáng, Chiều, Tối), tạo cú pháp caption gửi nhóm Zalo hoặc xuất Excel. | PASS — Tính toán chính xác theo lịch ME và lịch ngoài |

### 3.2. Rà soát 16 Modal Giao Diện Quản Trị
Toàn bộ 16 Modal đã được kiểm tra khớp nối ID giữa thẻ HTML và sự kiện JavaScript:
1. `teamsListModal`: Quản trị danh sách nhóm kỹ thuật.
2. `ruleEditModal`: Thêm / sửa nội quy xưởng.
3. `taskCreateModal`: Giao nhiệm vụ cho xưởng/nhóm/cá nhân.
4. `taskDetailModal`: Xem chi tiết nhiệm vụ và tiến độ.
5. `taskDeleteConfirmModal`: Xác nhận xóa nhiệm vụ.
6. `assignTeamModal`: Gán sinh viên vào nhóm chuyên môn.
7. `teamCreateModal`: Tạo nhóm Robocon mới.
8. `teamModal`: Sửa thông tin nhóm.
9. `closeModal`: Xác nhận kết thúc và chốt vắng phiên điểm danh.
10. `bulkModal`: Điểm danh hàng loạt (tất cả có mặt / vắng).
11. `resetPwdModal`: Hiển thị mật khẩu tạm thời sau khi reset.
12. `reasonModal`: Nhập lý do điều chỉnh trạng thái điểm danh thủ công.
13. `noteEditModal`: Chỉnh sửa ghi chú sinh viên cho buổi học.
14. `studentDeleteModal`: Cảnh báo và yêu cầu gõ lại MSSV trước khi xóa vĩnh viễn sinh viên.
15. `adminFaceEnrollModal`: Chụp ảnh webcam / tải file ảnh để nạp khuôn mặt sinh viên.
16. `faceScanDetailModal`: Xem thông tin chi tiết lượt nhận diện khuôn mặt (độ tương đồng, liveness score, ảnh đối chiếu).

### 3.3. Rà soát Tương tác Supabase Backend Phía Admin
- **14 Bảng dữ liệu được truy vấn trực tiếp**: `attendance`, `in_app_notifications`, `leave_requests`, `password_reset_history`, `password_reset_requests`, `profiles`, `sessions`, `student_external_schedules`, `student_face_data`, `student_schedules`, `students`, `team_group_members`, `team_groups`, `workshop_rules`. (100% bảng đều tồn tại, đúng cấu trúc cột và có RLS policy phù hợp).
- **37 Hàm RPC được gọi**: Toàn bộ 37 hàm RPC đều có định nghĩa hợp lệ trong PostgreSQL backend với `SECURITY DEFINER` và `search_path` cứng:
  `admin_add_student`, `admin_batch_set_status`, `admin_clear_password_reset_history`, `admin_close_session`, `admin_complete_reset_request`, `admin_delete_anonymous_feedback`, `admin_delete_history`, `admin_delete_leave_request`, `admin_delete_session`, `admin_delete_student`, `admin_delete_team_task`, `admin_get_anonymous_feedback`, `admin_get_attendance_record_history`, `admin_get_audit_logs`, `admin_get_student_delete_impact`, `admin_get_task_activity_logs`, `admin_get_team_tasks`, `admin_open_session`, `admin_regenerate_qr`, `admin_reopen_session`, `admin_save_semester_settings`, `admin_set_my_avatar`, `admin_set_status`, `admin_set_student_active`, `admin_sync_student_schedules`, `admin_sync_student_schedules_for_date`, `admin_sync_student_schedules_for_range`, `admin_today_sessions`, `admin_update_anonymous_feedback`, `admin_update_attendance_note`, `admin_update_avatar`, `create_team_task`, `get_open_session`, `get_semester_settings`, `is_admin`, `kiosk_record_face_checkin`, `submit_leave_comment`.
- **Storage Buckets**: `avatars` (lưu ảnh Admin và sinh viên), `leave-evidence` (lưu minh chứng nghỉ phép).
- **Edge Function**: `admin-reset-password` dùng Service Role Key để cập nhật mật khẩu trên `auth.users`.

### 3.4. Các Lỗi Thực Thi Đã Được Khắc Phục Ở Phân Hệ Admin
1. **Lỗi `confirmReopenSession` (Admin Runtime Error)**:
   - *Hiện tượng*: Khi admin xem phiên đã đóng (`viewPastSession`), nút `#btnReopenSession` hiện lên. Click vào nút sẽ ném lỗi `Uncaught ReferenceError: confirmReopenSession is not defined`.
   - *Nguyên nhân*: Thuộc tính `onclick="confirmReopenSession()"` được đặt trong `admin.html:355`, nhưng trong toàn bộ code JS chỉ có hàm `quickReopenSession(sid)`.
   - *Khắc phục*: Triển khai hàm `confirmReopenSession()` trong `js/admin/admin.tasks.js:2988`, gắn vào `window.confirmReopenSession`, kiểm tra an toàn `currentSession` trước khi gọi `quickReopenSession(currentSession.id)` và bổ sung cảnh báo khi chưa chọn phiên.
2. **Lỗi Function Shadowing `focusAddStudentMssv` (Admin UI Logic Bug)**:
   - *Hiện tượng*: Bấm nút "+ Thêm sinh viên" ở tiêu đề thì ô nhập không mở ra nếu form đang đóng.
   - *Nguyên nhân*: Hàm `focusAddStudentMssv()` bị định nghĩa 2 lần trong `js/admin/admin.students.js`: lần 1 ở dòng 206 gọi `toggleAddStudentCard(true)`, lần 2 ở dòng 721 chỉ scroll và focus. Định nghĩa thứ 2 đè hoàn toàn định nghĩa thứ 1.
   - *Khắc phục*: Hợp nhất 2 logic thành một hàm duy nhất tại dòng 206 (mở thẻ trước, scroll và focus input sau), xóa bỏ hoàn toàn định nghĩa trùng lặp ở dòng 721.
3. **Khai báo thừa `sleep`**:
   - *Hiện tượng*: `admin.students.js:13` định nghĩa lại `function sleep(ms)` dù `admin.core.js:17` đã định nghĩa trên `window`.
   - *Khắc phục*: Thay bằng guard an toàn kiểm tra `typeof window.sleep !== 'function'`.

---

## 4. R2: KIỂM ĐỊNH TOÀN DIỆN PHÂN HỆ SINH VIÊN (STUDENT SUBSYSTEM)

Phân hệ Sinh viên phục vụ việc điểm danh, xin nghỉ phép, nhận việc xưởng, đăng ký khuôn mặt và tra cứu thời khóa biểu.

### 4.1. Rà soát 6 View Giao Diện Chính trong `checkin.html`
| STT | View Selector | Tên Chức Năng | Mục Đích Nghiệp Vụ & Trạng Thái Thực Thi | Kết Quả Rà Soát |
|---|---|---|---|---|
| 1 | `#view-checkin` | Quét QR Điểm Danh | Xem thông tin phiên mở, tích hợp `Html5Qrcode` quét camera phong cách iOS, chọn lĩnh vực (Cơ khí, Điện, Lập trình, Thiết kế), nhập ghi chú, gửi yêu cầu qua `submit_attendance`, bật Wake Lock giữ sáng màn hình. | PASS — Đã kích hoạt Realtime xoay mã QR |
| 2 | `#view-history` | Lịch Sử Điểm Danh | Tra cứu 30 bản ghi điểm danh gần nhất của cá nhân qua RPC `get_my_attendance_history`. | PASS — Tải dữ liệu nhanh, định dạng ngày giờ chuẩn |
| 3 | `#view-leave` | Đơn Xin Nghỉ Phép | Tạo đơn nghỉ theo ngày/buổi, kiểm tra trùng TKB trường theo thời gian thực (`student_schedules`), tải ảnh minh chứng lên bucket `leave-evidence`, xem lịch sử sửa đơn, hủy đơn chờ duyệt, chat 2 chiều qua `submit_leave_comment`. | PASS — Đã sửa lỗi hiển thị tên phiên khi join |
| 4 | `#view-tasks` | Nhiệm Vụ Của Tôi | Quản lý nhiệm vụ cá nhân/nhóm/toàn xưởng qua `get_my_tasks`, cập nhật trạng thái làm việc qua `update_my_task`, cơ chế khóa nhận việc toàn xưởng (`claim_my_global_task`, `release_my_global_task`), trưởng nhóm giao việc (`create_team_task`). | PASS — Luồng cập nhật trạng thái hoạt động chính xác |
| 5 | `#view-rules` | Nội Quy Xưởng | Đọc quy định an toàn lao động và kỷ luật xưởng từ bảng `public.workshop_rules`. | PASS — Phân quyền đọc công khai an toàn |
| 6 | `#view-feedback` | Góp Ý Ẩn Danh | Gửi phản hồi sự cố ẩn danh qua `submit_anonymous_feedback`, sinh mã tra cứu `FB-XXXXXXXX`. | PASS — Đã gỡ sạch dead code `#fbModal` cũ |

### 4.2. Rà soát Phân Hệ Khuôn Mặt & Ảnh Đại Diện (`face-sinhvien.html`)
- **Thuật toán AI**: Sử dụng `@vladmandic/face-api` (TinyFaceDetector, FaceLandmark68TinyNet, FaceRecognitionNet).
- **Quy trình nạp 5 góc khuôn mặt**: Hướng dẫn sinh viên tự chụp hoặc tải ảnh chân dung qua 5 góc: Thẳng, Nghiêng trái, Nghiêng phải, Ngẩng/cúi, Cười nhẹ.
- **Ràng buộc chuẩn hóa ảnh đại diện**: Hàm `makeSquareAvatarBlob(file, 512)` tự động crop vuông và scale về đúng độ phân giải chuẩn 512x512 pixel trước khi tải lên Storage bucket `avatars` tại đường dẫn `${myMssv}/avatar.jpg`.
- **Lưu trữ dữ liệu**: 5 vector đặc trưng 128 chiều (`descriptors`) và ảnh thu nhỏ (`thumbnails`) được lưu trữ bảo mật vào bảng `public.student_face_data` và đồng bộ cục bộ vào `localStorage`.

### 4.3. Rà soát Phân Hệ Thời Khóa Biểu & Lịch Ngoài (`lichhoc.html` & `js/lichhoc.js`)
- **Tự động bảo vệ danh tính**: Khi sinh viên đăng nhập, hệ thống tự động khóa chế độ chỉ xem lịch học của chính mình, ẩn các tab chọn sinh viên khác, ẩn tab xem lịch cả lớp và tab lọc người rảnh.
- **Hiển thị linh hoạt**: Chế độ xem Lưới tuần (Grid View) phân màu sắc trực quan theo môn học, và chế độ xem Danh sách toàn kỳ (List View).
- **Quản lý Lịch ngoài (External Schedules)**: Sinh viên có thể tự thêm hoặc xóa lịch học ngoài trường (luyện thi TOEIC, thực tập, kỹ năng) vào bảng `public.student_external_schedules`. Trigger backend tự động đối chiếu ca xưởng để ghi nhận vắng có phép "Lịch ngoài".
- **Xuất dữ liệu**: Xuất lịch ra tệp iCalendar (`.ics`), file Excel tuần (`.xlsx`), hoặc in ấn/lưu PDF khổ A4.

### 4.4. Rà soát 15 Hàm RPC Thuộc Phân Hệ Sinh Viên
Toàn bộ 15 RPC được phân hệ Sinh viên sử dụng đều đã được kiểm chứng tồn tại và cấp quyền đầy đủ:
1. `is_admin`: Kiểm tra vai trò tài khoản.
2. `request_password_reset`: Gửi yêu cầu cấp lại mật khẩu (mở quyền `anon`, có cooldown chống spam).
3. `student_set_my_avatar`: Cập nhật avatar vào bảng `students` và `profiles`.
4. `get_semester_settings`: Lấy ngày bắt đầu và kết thúc học kỳ.
5. `get_open_session`: Lấy thông tin phiên mở và token QR động (cấp quyền `anon`, `authenticated`).
6. `submit_attendance`: Điểm danh quét QR bảo mật, kiểm tra token xoay vòng, gian lận thiết bị.
7. `get_session_summary`: Lấy thống kê số người có mặt, vắng sau khi điểm danh.
8. `get_my_attendance_history`: Lấy 30 bản ghi điểm danh gần nhất của sinh viên.
9. `submit_leave_comment`: Trao đổi chat 2 chiều trên đơn xin nghỉ phép.
10. `get_my_tasks`: Tải danh sách nhiệm vụ được giao.
11. `update_my_task`: Cập nhật tiến độ nhiệm vụ cá nhân/nhóm.
12. `claim_my_global_task`: Nhận nhiệm vụ chung toàn xưởng.
13. `release_my_global_task`: Hủy nhận việc toàn xưởng.
14. `create_team_task`: Trưởng nhóm kỹ thuật giao việc cho thành viên.
15. `submit_anonymous_feedback`: Gửi phản hồi/báo hỏng ẩn danh sinh mã `FB-XXXXX`.

### 4.5. Các Lỗi Thực Thi & Điểm Nghẽn Backend Đã Được Khắc Phục Ở Phân Hệ Sinh Viên
1. **Lỗi WebSocket Realtime Kênh `sessions` Không Hoạt Động (Backend Gap)**:
   - *Hiện tượng*: Khi Admin đổi mã QR xoay vòng hoặc đóng phiên điểm danh, màn hình điện thoại sinh viên không nhận được cập nhật tức thời qua WebSocket, dẫn đến tình trạng sinh viên quét phải mã QR cũ vừa hết hạn.
   - *Nguyên nhân gốc rễ*: Bảng `public.sessions` chưa từng được thêm vào publication `supabase_realtime` của PostgreSQL. Ngoài ra, bảng `sessions` chỉ có policy `admin_all_sessions` (yêu cầu `is_admin()`), sinh viên không có quyền SELECT trên bảng này nên CDC WebSocket của Supabase không gửi payload.
   - *Khắc phục*: Ban hành migration `20261031030000_enable_realtime_sessions_and_read_policy.sql` thực thi:
     - `ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;`
     - Bổ sung policy `sessions_read_policy` cấp quyền SELECT cho `anon` và `authenticated` với điều kiện `USING (true)`.
2. **Lỗi Join `sessions(session_name)` Trong Đơn Xin Nghỉ Bị Null (Backend RLS Gap)**:
   - *Hiện tượng*: Tại `checkin.html:1473`, câu truy vấn `supabase.from('leave_requests').select('*,sessions(session_name,started_at)...')` luôn trả về `sessions: null`, khiến cột tên phiên trong lịch sử đơn nghỉ luôn hiển thị fallback `'Phiên cũ'`.
   - *Nguyên nhân gốc rễ*: Do bảng `sessions` thiếu policy SELECT cho sinh viên, PostgREST tự động trả về `null` cho quan hệ join theo quy định của RLS.
   - *Khắc phục*: Policy `sessions_read_policy` mới đã cấp quyền SELECT an toàn, giúp PostgREST giải mã chính xác `session_name` và `started_at`.
3. **Dead Code `#fbModal` Trong `checkin.html` (Client Code Cleanup)**:
   - *Hiện tượng*: Tại `checkin.html:1332` và `1564` có đoạn code kiểm tra và ẩn `#fbModal`. Phần tử này không còn tồn tại trong DOM do form góp ý đã chuyển sang View SPA `#view-feedback`.
   - *Khắc phục*: Xóa bỏ hoàn toàn mã mồ côi này, giữ code tinh gọn và sạch sẽ.
4. **Lỗi Đột Biến Trực Tiếp Bảng `students` Trong `admin.tasks.js` (RLS Violation Bug)**:
   - *Hiện tượng*: Tại `js/admin/admin.tasks.js:1513`, có đoạn mã gọi `supabase.from('students').upsert(...)` và `.delete()`.
   - *Nguyên nhân gốc rễ*: Migration `20261017093000_tighten_students_rls.sql` đã thu hồi toàn bộ quyền INSERT/UPDATE/DELETE trực tiếp trên bảng `students` từ client để chống giả mạo hồ sơ, yêu cầu mọi thay đổi phải qua RPC. Đoạn mã này sẽ bị Supabase từ chối với lỗi `42501 permission denied`.
   - *Khắc phục*: Loại bỏ hoàn toàn khối mã vi phạm, chuyển việc chuẩn hóa MSSV sang xử lý bộ nhớ an toàn.

---

## 5. R3: BẢNG DANH MỤC PHÂN LOẠI LỖI & ĐIỂM NGHẼN BACKEND (TAXONOMY MATRIX)

Bảng dưới đây phân loại rạch ròi giữa **Lỗi mã nguồn Client (Client Code Bugs)** và **Thiếu hụt / Sai lệch cấu trúc Supabase Backend (Supabase Backend Gaps)**:

| STT | Mã Lỗi | Phân Loại | Vị Trí File & Dòng Code | Hiện Tượng / Triệu Chứng (Symptom) | Nguyên Nhân Gốc Rễ (Root Cause) | Trạng Thái Khắc Phục | Phương Án Xử Lý & Đoạn Code Khắc Phục |
|---|---|---|---|---|---|---|---|
| 1 | `BUG-ADM-001` | **Client Code Bug** | `admin.html:355` | Bấm nút "Mở lại phiên" khi xem phiên cũ ném lỗi: `Uncaught ReferenceError: confirmReopenSession is not defined`. | Nút `#btnReopenSession` gọi inline handler `confirmReopenSession()` nhưng hàm này chưa từng được định nghĩa trong bất kỳ file JavaScript nào. | **ĐÃ KHẮC PHỤC (100%)** | Bổ sung hàm `confirmReopenSession()` tại `js/admin/admin.tasks.js:2988`, gắn vào `window`, kiểm tra an toàn `currentSession` và gọi `quickReopenSession(currentSession.id)`. |
| 2 | `BUG-ADM-002` | **Client Code Bug** | `js/admin/admin.students.js:206 & 721` | Bấm nút "+ Thêm sinh viên" trên thanh công cụ không mở được form nhập nếu form đang đóng (`display: none`). | Hàm `focusAddStudentMssv()` bị định nghĩa 2 lần trong cùng 1 file. Lần 2 ở dòng 721 ghi đè hoàn toàn lần 1 ở dòng 206 (mất lệnh `toggleAddStudentCard(true)`). | **ĐÃ KHẮC PHỤC (100%)** | Hợp nhất 2 hàm thành 1 tại dòng 206 (mở thẻ trước, scrollIntoView và focus sau). Xóa bỏ định nghĩa thừa ở dòng 721. |
| 3 | `BUG-ADM-003` | **Client Code Bug** | `js/admin/admin.students.js:13` | Khai báo trùng lặp hàm `sleep(ms)` trên phạm vi toàn cục. | `admin.core.js:17` đã định nghĩa và gán `window.sleep`, việc định nghĩa lại gây dư thừa và tiềm ẩn xung đột hoisting. | **ĐÃ KHẮC PHỤC (100%)** | Thay thế bằng guard an toàn kiểm tra `if (typeof window.sleep !== 'function')`. |
| 4 | `BUG-STU-001` | **Client Code Bug** | `checkin.html:1332 & 1564` | Dead code tham chiếu DOM phần tử không tồn tại `document.getElementById('fbModal')`. | Tàn dư của giao diện pop-up cũ trước khi chuyển đổi sang SPA View `#view-feedback`. | **ĐÃ KHẮC PHỤC (100%)** | Xóa sạch hoàn toàn các dòng code kiểm tra và ẩn `#fbModal` trong listener phím Escape và hàm gửi phản hồi. |
| 5 | `BUG-ADM-004` | **Client Code Bug** | `js/admin/admin.tasks.js:1513` | Lệnh gọi `supabase.from('students').upsert(...)` bị từ chối với lỗi Postgres `42501 (permission denied for table students)`. | Client cố tình ghi trực tiếp vào bảng `students` trong khi migration `20261017093000` đã khóa chặt quyền INSERT/UPDATE để bảo mật hồ sơ sinh viên. | **ĐÃ KHẮC PHỤC (100%)** | Xóa bỏ khối mã mutation trực tiếp; chuẩn hóa MSSV trên bộ nhớ JavaScript của client mà không can thiệp trái phép vào database. |
| 6 | `GAP-BE-001` | **Supabase Backend Gap** | `supabase/schema.sql` & PostgreSQL Catalog | Kênh Realtime `supabase.channel('session_changes')` phía sinh viên không nhận được thông báo khi Admin đổi QR hoặc đóng phiên. | Bảng `public.sessions` chưa được thêm vào publication `supabase_realtime` của cơ sở dữ liệu PostgreSQL. | **ĐÃ KHẮC PHỤC (100%)** | Ban hành và chạy migration `20261031030000`: `ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;`. |
| 7 | `GAP-BE-002` | **Supabase Backend Gap** | `supabase/schema.sql:610` & PostgreSQL Catalog | Truy vấn join `sessions(session_name)` trong danh sách đơn nghỉ phép trả về `null`; sinh viên bị chặn nghe sự kiện Realtime `sessions`. | Bảng `public.sessions` chỉ có policy `admin_all_sessions` (yêu cầu `is_admin()`), không có policy SELECT cho vai trò `authenticated` (sinh viên) hoặc `anon`. | **ĐÃ KHẮC PHỤC (100%)** | Tạo migration `20261031030000`: thiết lập policy `sessions_read_policy` cho phép `anon` và `authenticated` SELECT với điều kiện `USING (true)`. |

---

## 6. MA TRẬN NGHIỆM THU TIÊU CHÍ (ACCEPTANCE CRITERIA MATRIX)

Đối chiếu trực tiếp với các tiêu chí nghiệm thu đề ra tại `ORIGINAL_REQUEST.md`:

| # | Tiêu Chí Nghiệm Thu (Acceptance Criteria) | Tình Trạng | Bằng Chứng Thực Nghiệm & Chi Tiết Nghiệm Thu |
|---|---|---|---|
| **AC-1** | **Tính toàn diện Admin Subsystem**: Rà soát và kiểm tra luồng thực thi toàn bộ 10 view, 16 modals, và các chức năng chính của vai trò Admin. | **PASS** | 100% 10 View (`view-overview` đến `view-zalo`) và 16 Modal được kiểm tra DOM, logic kích hoạt, tính toàn vẹn cú pháp và luồng gọi API. Đã sửa lỗi `confirmReopenSession` và `focusAddStudentMssv`. Bộ test `test_admin_fixes.js`, `test_admin_fixes.py`, và `stress_test_admin_challenger.js` chạy đạt 100%. |
| **AC-2** | **Tính toàn diện Student Subsystem**: Rà soát và kiểm tra luồng thực thi toàn bộ 6 view, quét QR, đăng ký 5 góc khuôn mặt, và thời khóa biểu ME của vai trò Sinh viên. | **PASS** | Đã rà soát 6 View trong `checkin.html`, quy trình chụp 5 góc mặt và crop 512x512 trong `face-sinhvien.html`, lưới tuần/danh sách TKB trong `lichhoc.html`. Đã sửa lỗi Realtime session update và join đơn nghỉ. Bộ test `test_student_and_db_fixes.js`, `stress_test_student_challenger.js`, `test_student_subsystem_challenger.js` chạy đạt 100%. |
| **AC-3** | **Đối soát triệt để Supabase Backend**: Mọi lệnh gọi API / SDK Supabase trong codebase được đối chiếu với schema và logic backend để xác định chính xác các điểm thiếu hụt (missing tables, missing RPCs, missing policies). | **PASS** | Đã quét và đối chiếu 135 lời gọi SDK Supabase: xác nhận 28 bảng và 74 hàm RPC đều tồn tại và hợp lệ trong Postgres DDL. Không có RPC nào bị thiếu (0 missing RPCs). Đã bổ sung thành công bảng `sessions` vào `supabase_realtime` publication và bổ sung policy SELECT công khai. |
| **AC-4** | **Phân định rõ ràng Bug vs Backend Gap**: Danh sách lỗi phân định rõ ràng giữa lỗi do code client và lỗi do backend Supabase chưa hoàn thiện. | **PASS** | Xây dựng Bảng phân loại có cấu trúc (Taxonomy Matrix) tại Mục 5 của báo cáo này: phân định rạch ròi 5 lỗi Client Code (`BUG-ADM-001` đến `004`, `BUG-STU-001`) và 2 điểm nghẽn Backend (`GAP-BE-001`, `GAP-BE-002`). |
| **AC-5** | **Báo cáo nghiệm thu hoàn chỉnh**: Báo cáo kiểm thử liệt kê đầy đủ từng lỗi với đường dẫn file, dòng code, thông điệp lỗi, nguyên nhân gốc rễ và hướng dẫn/mã khắc phục tương ứng. | **PASS** | Báo cáo `docs/COMPREHENSIVE_AUDIT_REPORT.md` trình bày chi tiết từng lỗi, trích dẫn chính xác số dòng, nguyên nhân gốc rễ, đoạn code vá lỗi, cùng lệnh chạy kiểm chứng độc lập. |

---

## 7. BẰNG CHỨNG THỰC NGHIỆM BỘ KIỂM THỬ TỔNG HỢP MASTER RUNNER

Kỹ sư kiểm định đã phát triển và thực thi bộ chạy kiểm thử hợp nhất tối cao:
**`scratch/run_full_system_verification.js`**

Bộ điều phối này triệu hồi tuần tự 11 bộ test suites độc lập, kiểm tra từ tầng cú pháp AST, unit test, stress test cho đến kiểm toán bảo mật độc lập:

```text
================================================================================
       LH-NaviX MASTER UNIFIED FULL-SYSTEM VERIFICATION RUNNER (M4)            
       Repository: C:\Users\ACER\Documents\GitHub\DIEM_DANH
       Timestamp : 2026-10-31T03:22:16.435Z
================================================================================

[1/11] RUNNING: [Syntax Validation] Node.js Direct Syntax Validation (node -c)
Command: node -c js/config.js js/auth.js js/lichhoc.js js/admin/admin.core.js js/admin/admin.leave.js js/admin/admin.schedules.js js/admin/admin.tasks.js js/admin/admin.students.js js/admin/admin.attendance.js js/admin/admin.face.js
>>> RESULT: [PASS] (1 checks passed, duration: 0.05s)

[2/11] RUNNING: [Syntax Validation] Comprehensive Syntax & HTML Tag AST Validation (test_syntax.py)
Command: python scratch/test_syntax.py
>>> RESULT: [PASS] (1 checks passed, duration: 1.36s)

[3/11] RUNNING: [Worker Verification Suites] Worker M1: Admin Subsystem Remediation Verification (Node.js)
Command: node scratch/test_admin_fixes.js
>>> RESULT: [PASS] (23 checks passed, duration: 0.59s)

[4/11] RUNNING: [Worker Verification Suites] Worker M1: Admin Subsystem Remediation Verification (Python)
Command: python scratch/test_admin_fixes.py
>>> RESULT: [PASS] (17 checks passed, duration: 0.43s)

[5/11] RUNNING: [Worker Verification Suites] Worker M2: Student Subsystem & Supabase Alignment (Node.js)
Command: node scratch/test_student_and_db_fixes.js
>>> RESULT: [PASS] (53 checks passed, duration: 5.98s)

[6/11] RUNNING: [Challenger Suites] Challenger M1_1: Admin Adversarial & Stress Suite
Command: node scratch/challenger_m1_1.js
>>> RESULT: [PASS] (22 checks passed, duration: 0.12s)

[7/11] RUNNING: [Challenger Suites] Challenger M1_2: Admin Empirical Stress & Handler Suite
Command: node scratch/stress_test_admin_challenger.js
>>> RESULT: [PASS] (31 checks passed, duration: 0.30s)

[8/11] RUNNING: [Challenger Suites] Challenger M2_1: Student Live RLS & Realtime Stress Suite
Command: node scratch/stress_test_student_challenger.js
>>> RESULT: [PASS] (50 checks passed, duration: 20.57s)

[9/11] RUNNING: [Challenger Suites] Challenger M2_2: Student Subsystem Challenge Suite
Command: node scratch/test_student_subsystem_challenger.js
>>> RESULT: [PASS] (29 checks passed, duration: 5.49s)

[10/11] RUNNING: [Auditor Independent Suites] Forensic Auditor M1: Independent Static & VM Audit Check
Command: node scratch/auditor_m1_test.js
>>> RESULT: [PASS] (14 checks passed, duration: 0.06s)

[11/11] RUNNING: [Auditor Independent Suites] Forensic Auditor M2: Independent DB & Frozen Code Audit
Command: node scratch/auditor_m2_independent_check.js
>>> RESULT: [PASS] (16 checks passed, duration: 3.58s)

================================================================================
                       MASTER VERIFICATION SUMMARY REPORT                       
================================================================================
Total Suites Executed : 11
Total Granular Checks : 257
Total Passed Checks   : 257
Total Failed Checks   : 0
Overall Execution Time: 38.55s
--------------------------------------------------------------------------------
ID                        Category                    Checks        Duration  Status
--------------------------------------------------------------------------------
SYNTAX_NODE_CHECK         Syntax Validation           1P / 0F       0.05s     [PASS]
SYNTAX_FULL_PY            Syntax Validation           1P / 0F       1.36s     [PASS]
WORKER_M1_ADMIN_JS        Worker Verification Suites  23P / 0F      0.59s     [PASS]
WORKER_M1_ADMIN_PY        Worker Verification Suites  17P / 0F      0.43s     [PASS]
WORKER_M2_STUDENT_DB_JS   Worker Verification Suites  53P / 0F      5.98s     [PASS]
CHALLENGER_M1_1           Challenger Suites           22P / 0F      0.12s     [PASS]
CHALLENGER_M1_2_STRESS    Challenger Suites           31P / 0F      0.30s     [PASS]
CHALLENGER_M2_1_STRESS    Challenger Suites           50P / 0F      20.57s    [PASS]
CHALLENGER_M2_2_SUBSYSTEM Challenger Suites           29P / 0F      5.49s     [PASS]
AUDITOR_M1                Auditor Independent Suites  14P / 0F      0.06s     [PASS]
AUDITOR_M2                Auditor Independent Suites  16P / 0F      3.58s     [PASS]
================================================================================
>>> ALL 11 VERIFICATION SUITES PASSED FLAWLESSLY. 0 REGRESSIONS DETECTED.
```

---

## 8. TUÂN THỦ QUY CHUẨN & BẢO TOÀN TÍNH NĂNG ĐÓNG BĂNG (FROZEN FEATURES)

Theo quy định nghiêm ngặt tại Điều 4 của `AGENTS.md`, mọi tính năng đã được kiểm chứng hoạt động tốt trong `docs/FROZEN_FEATURES.md` đều là bất khả xâm phạm. Quá trình kiểm toán độc lập của Forensic Auditor (`scratch/auditor_m2_independent_check.js`) xác nhận:

1. **FRZ-001 (Firmware ESP32 Kiosk)**: Thư mục `esp32_kiosk/` không bị sửa đổi bất kỳ dòng code nào trong đợt kiểm tra này.
2. **FRZ-003 (Edge Function admin-reset-password)**: Mã nguồn `supabase/functions/admin-reset-password/` được giữ nguyên vẹn 100%.
3. **FRZ-004 (Firmware ESP32 Cam AI)**: Thư mục `esp32_cam_ai/` được bảo toàn nguyên vẹn.
4. **FRZ-005 (Buzzer & Face AI Debounce)**: Các tham số nhạy cảm trong `js/admin/admin.face.js` gồm ngưỡng Euclidean FaceMatcher (`0.40`), số frame xác thực (`REQUIRED_CONFIRM_FRAMES = 4`), và thời gian cooldown còi toàn cục (`adminLastGlobalBeepTime` 4000ms) được giữ nguyên, không xảy ra hiện tượng phá vỡ tính năng (regression).

---

## 9. KẾT LUẬN & KHUYẾN NGHỊ VẬN HÀNH

### 9.1. Kết Luận Chung
Hệ thống **LH-NaviX** đã hoàn thành xuất sắc toàn bộ các mục tiêu kiểm toán đề ra:
- Toàn bộ các luồng giao diện của vai trò Admin và Sinh viên đã được rà soát và khắc phục triệt để các lỗi cú pháp, runtime và logic giao diện.
- Backend Supabase Cloud đã được đối soát 100% tài nguyên (28 bảng, 74 RPC, 2 Storage Bucket, 49 RLS Policies), đồng thời được vá lỗ hổng Realtime WebSocket và RLS policy của bảng `sessions`.
- 11 bộ kiểm thử với 257 ca kiểm tra thực nghiệm độc lập đã xác nhận hệ thống vận hành ổn định, chính xác và an toàn.

### 9.2. Khuyến Nghị Vận Hành Cho Đội Quản Trị Hệ Thống
1. **Đồng bộ DDL Snapshot**: Khi bàn giao cho môi trường mới, khuyến nghị sử dụng file migration mới nhất `supabase/migrations/20261031030000_enable_realtime_sessions_and_read_policy.sql` để đảm bảo tính năng Realtime của `sessions` luôn được kích hoạt.
2. **Giám sát Quota Supabase Realtime**: Kênh `sessions` hiện đã phát payload cho cả `anon` và `authenticated`. Khi số lượng sinh viên quét đồng thời lên tới hàng trăm người, WebSocket connection count sẽ tăng tương ứng; hệ thống nên giữ nhịp polling 15s (`setInterval(loadSession, 15000)`) làm cơ chế dự phòng an toàn nếu kết nối WebSocket bị gián đoạn.
3. **Quy tắc sửa đổi dữ liệu sinh viên**: Nhắc nhở toàn bộ các kỹ sư phát triển tiếp theo: **Tuyệt đối không sử dụng lệnh `.from('students').upsert()` hoặc `.delete()` trực tiếp từ client**, mọi can thiệp hồ sơ bắt buộc phải thông qua các hàm RPC Security Definer đã được kiểm định.

---
*Báo cáo được lập và chứng thực bởi Worker M4 — LH-NaviX Engineering Team.*
