# KẾ HOẠCH CÔNG VIỆC AI (AI_PLAN.MD)

> **Mục đích:** Tài liệu quản lý kế hoạch kỹ thuật, phân tích yêu cầu, xác định phạm vi và tiêu chí nghiệm thu cho mọi tác vụ được AI thực hiện trên repository **DIEM_DANH (LH-NaviX)**.

---

## 1. QUY ƯỚC ĐẶT MÃ & CẤU TRÚC NHIỆM VỤ

Mọi nhiệm vụ (task) mới phải được đăng ký theo cấu trúc chuẩn bên dưới trước khi triển khai mã nguồn:

```markdown
### [TASK-XXX] Tiêu đề ngắn gọn của nhiệm vụ

- **Ngày tạo:** YYYY-MM-DD
- **Mức độ ưu tiên:** Critical | High | Medium | Low
- **Mục tiêu:** Mô tả ngắn gọn kết quả cần đạt được.
- **Phạm vi tác động:** Danh sách file / module / bảng database liên quan.
- **Phân tích kỹ thuật & Hiện trạng:**
  - Hiện trạng code đang làm gì?
  - Điểm nghẽn / Rủi ro tiềm ẩn (break RLS, ảnh hưởng ESP32, lệch format, v.v.).
- **Các bước triển khai (Step-by-step):**
  1. Bước 1: ...
  2. Bước 2: ...
- **Tiêu chí nghiệm thu (Acceptance Criteria / Definition of Done - DoD):**
  - [ ] Tiêu chuẩn 1 (phải kiểm chứng được bằng output hoặc hành động cụ thể).
  - [ ] Tiêu chuẩn 2.
- **Phương án kiểm thử (Test Strategy):**
  - Lệnh hoặc công cụ dùng để test (Node script, curl, browser DOM check, v.v.).
```

---

## 2. DANH SÁCH NHIỆM VỤ HIỆN HÀNH & KẾ HOẠCH

### [TASK-001] Thiết lập hệ sinh thái quản lý công việc AI cho workspace

- **Ngày tạo:** 2026-10-24
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Tạo dựng bộ khung quản lý tác vụ AI minh bạch, phòng chống ảo giác (hallucination), bắt buộc quy trình READ → PLAN → IMPLEMENT → TEST → VERIFY → LOG.
- **Phạm vi tác động:**
  - `AGENTS.md` (Thư mục gốc)
  - `docs/AI_PLAN.md`
  - `docs/AI_PROGRESS.md`
  - `docs/AI_TEST_LOG.md`
- **Phân tích kỹ thuật & Hiện trạng:**
  - Workspace chưa có file `AGENTS.md` tại root; chưa có tài liệu theo dõi tiến độ chuẩn hóa cho các Agent làm việc đa phiên.
  - Cần đảm bảo hệ thống không xung đột với các quy tắc người dùng hiện có (nguyên tắc Ponytail: tối giản, không bloat, sửa tận gốc; tính trung thực: không bịa test log).
- **Các bước triển khai:**
  1. [x] Kiểm tra cấu trúc thư mục và quy tắc hiện hữu để tránh ghi đè hoặc xung đột.
  2. [x] Tạo `AGENTS.md` quy định 6 bước làm việc và 3 điều cấm tuyệt đối.
  3. [x] Tạo `docs/AI_PLAN.md` thiết lập chuẩn lập kế hoạch và nạp các task nền tảng.
  4. [x] Tạo `docs/AI_PROGRESS.md` quản lý trạng thái luồng công việc.
  5. [x] Tạo `docs/AI_TEST_LOG.md` lưu trữ nhật ký kiểm thử thật.
  6. [x] Thực thi kiểm tra xác minh các file đã tạo, cấu trúc markdown và tính hợp lệ.
- **Tiêu chí nghiệm thu (DoD):**
  - [x] 4 file tồn tại đúng đường dẫn, nội dung rõ ràng, liên kết clickable hợp lệ.
  - [x] Không có quy tắc nào xung đột với `user_global` và `always-use-ponytail`.
  - [x] Nhật ký kiểm thử `AI_TEST_LOG.md` có bản ghi kiểm tra thực tế (kiểm tra tồn tại, kích thước file, cú pháp).
- **Phương án kiểm thử:** Dùng lệnh PowerShell / file inspection tool để kiểm tra sự tồn tại và tính nguyên vẹn của cả 4 file.

---

### [TASK-002] Rà soát và đồng bộ checklist đổi tên GitHub (123001058 -> LH-NaviX)

- **Ngày tạo:** 2026-10-24
- **Mức độ ưu tiên:** Medium
- **Mục tiêu:** Đảm bảo toàn bộ tài liệu hướng dẫn đổi username GitHub phản ánh đúng các vị trí quan trọng trong mã nguồn (đặc biệt là ESP32 Kiosk và Git remote).
- **Phạm vi tác động:**
  - `docs/doi-ten-github-checklist.md`
  - `esp32_kiosk/esp32_kiosk.ino`
- **Phân tích kỹ thuật & Hiện trạng:**
  - File checklist đã được tạo tại `docs/doi-ten-github-checklist.md`.
  - Cần đối chiếu xem dòng 12 của `esp32_kiosk/esp32_kiosk.ino` có đúng là `const char* web_domain = "https://123001058.github.io/DIEM_DANH";` hay không.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Đối chiếu mã nguồn thực tế khớp chính xác với checklist.
  - [ ] Ghi lại kết quả rà soát vào `AI_TEST_LOG.md`.
- **Phương án kiểm thử:** Dùng `grep_search` hoặc `view_file` trên `esp32_kiosk/esp32_kiosk.ino`.

---

### [TASK-003] Rà soát bảo mật Supabase RLS & Tính toàn vẹn của Stored Procedures

- **Ngày tạo:** 2026-10-24
- **Mức độ ưu tiên:** Low (Backlog)
- **Mục tiêu:** Kiểm tra các file migration mới trong `supabase/migrations/` và `supabase/schema.sql` để phát hiện lỗ hổng phân quyền hoặc function thiếu security definer.
- **Phạm vi tác động:** `supabase/schema.sql`, `supabase/migrations/*`.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Báo cáo kiểm toán RLS được ghi vào Test Log khi có yêu cầu kiểm tra.

---

### [TASK-004] Xóa bỏ Dead Code, Orphan Components và Biến không dùng trên toàn bộ Frontend

- **Ngày tạo:** 2026-10-25
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Loại bỏ triệt để các hàm mồ côi (dead functions), biến toàn cục dư thừa, modal mồ côi và file backup không còn sử dụng, đảm bảo tính gọn gàng và không làm ảnh hưởng các luồng hoạt động hiện tại.
- **Phạm vi tác động:**
  - `admin.html`, `checkin.html`
  - `js/admin/admin.core.js`, `js/admin/admin.face.js`, `js/admin/admin.students.js`, `js/admin/admin.tasks.js`, `js/admin/admin.leave.js`
  - `js/config.js`, `js/lichhoc.js`
  - `js/admin/admin.face.legacy.js.bak` (xóa file)
- **Phân tích kỹ thuật & Hiện trạng:**
  - Qua rà soát tĩnh, có 23 hàm dead code, 12 biến/window props dư thừa, 3 phần tử/modal mồ côi trong admin.html/checkin.html.
  - Dự án không dùng `package.json` (dùng CDN thuần), không có file CSS/SCSS riêng của các component mồ côi này.
  - Rủi ro tiềm ẩn: Cú pháp JS sau khi xóa khối code bị thiếu dấu ngoặc hoặc break các hàm phụ thuộc.
- **Các bước triển khai:**
  1. Xóa các hàm và biến dead code trong `js/admin/admin.core.js`.
  2. Xóa các hàm và biến dead code trong `js/admin/admin.face.js`.
  3. Xóa các hàm dead code trong `js/admin/admin.students.js`.
  4. Xóa các hàm và biến dead code trong `js/admin/admin.tasks.js`.
  5. Xóa biến `totalRate` trong `js/admin/admin.leave.js`.
  6. Xóa các window props dư thừa trong `js/config.js` và `js/lichhoc.js`.
  7. Xóa các hàm dead code trong `checkin.html`.
  8. Xóa các modal/button mồ côi trong `admin.html` (`#studentFeedbackModal`, `#reopenModal`, `#filterUnmarked`).
  9. Xóa file backup `js/admin/admin.face.legacy.js.bak`.
  10. Kiểm tra cú pháp toàn bộ file JS/HTML bằng Node.js script.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Toàn bộ các hàm, biến và component mục tiêu được loại bỏ sạch sẽ khỏi codebase.
  - [ ] Tất cả các file JS và HTML qua kiểm tra syntax không có lỗi parse (SyntaxError = 0).
  - [ ] Không có tham chiếu bị gãy (broken reference).
  - [ ] Kết quả kiểm thử được ghi nhận vào `docs/AI_TEST_LOG.md` (TLOG-002).
- **Phương án kiểm thử:** Chạy script Node.js kiểm tra cú pháp và rà soát regex không còn khai báo dead code.

---

### [TASK-005] Cập nhật địa chỉ IP Camera ESP32 sang 192.168.2.168 và chuẩn hóa kết nối luồng stream

- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Cập nhật địa chỉ IP mặc định của Camera ESP32 thành `192.168.2.168` trên trang Điểm danh bằng cam (`admin.html`, `js/admin/admin.face.js`) và trang benchmark (`test_facex_raw.html`), đồng thời tự động chuẩn hóa chuỗi URL (xử lý prefix `http://`, `ttp://`), sửa lỗi phát hiện frame rỗng khi camera offline.
- **Phạm vi tác động:**
  - `js/admin/admin.face.js`
  - `admin.html`
  - `test_facex_raw.html`
- **Phân tích kỹ thuật & Hiện trạng:**
  - `test_facex_raw.html` đang chứa giá trị hardcoded cũ `10.96.38.99`.
  - `admin.face.js` đọc `localStorage.getItem('esp_cam_ip')`, nếu trình duyệt từng lưu IP cũ `10.96.38.99` sẽ tiếp tục lấy IP cũ này đè lên `adminEspIpInput`.
  - Hàm `formatEspStreamUrl` và `triggerEspCamBeep` chỉ xử lý `^https?:\/\/`. Khi người dùng gõ `ttp://192.168.2.168` (lỗi gõ nhanh thiếu h), URL stream bị biến thành `http://ttp::81/stream`.
  - Vòng lặp `runAdminDetectionLoop` dùng điều kiện `(media.naturalWidth > 0 || media.width > 0)`. Khi ảnh bị vỡ (offline), `media.width` vẫn > 0 do CSS nên vòng lặp vẫn xử lý khung rỗng và ghi đè trạng thái HUD thành "Đang quan sát..." khiến người dùng không biết camera bị lỗi kết nối.
- **Các bước triển khai:**
  1. Chuẩn hóa `initFaceCamInAdmin`: gán mặc định `192.168.2.168`, tự động làm sạch IP (hỗ trợ `ttp://`, `http://`), migrate IP cũ `10.96.38.99`.
  2. Nâng cấp `formatEspStreamUrl` và `triggerEspCamBeep` bóc tách sạch hostname và port.
  3. Sửa điều kiện `hasFrame` chỉ chấp nhận `media.naturalWidth > 0` cho thẻ `img`, để `img.onerror` hiển thị trạng thái mất kết nối trung thực.
  4. Cập nhật `admin.html` tăng version script `admin.face.js?v=3` để trình duyệt xóa cache.
  5. Cập nhật `test_facex_raw.html` đổi `espIpInput` sang `192.168.2.168` và chuẩn hóa input.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Mặc định `192.168.2.168` xuất hiện nhất quán trên `admin.html` và `test_facex_raw.html`.
  - [ ] Nhập `ttp://192.168.2.168` hoặc `http://192.168.2.168` tự động chuyển đổi thành luồng chuẩn `http://192.168.2.168:81/stream`.
  - [ ] Khi camera offline (naturalWidth = 0), HUD hiển thị cảnh báo kết nối thay vì báo ảo "Đang quan sát...".
  - [ ] Script kiểm tra cú pháp JS/HTML chạy thành công 100% không có lỗi.
---

### [TASK-006] Cập nhật IP Camera sang 192.168.2.169 và khắc phục triệt để lỗi còi Buzzer kêu liên tục

- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** Critical
- **Mục tiêu:**
  1. Đồng bộ IP camera mặc định mới `192.168.2.169` (theo router thực tế cấp cho ESP32-S3), gom về hằng số `DEFAULT_ESP_CAM_IP` và tự động migrate các IP cũ (`10.96.38.99`, `192.168.2.168`).
  2. Khắc phục nguyên nhân gốc rễ còi Buzzer GPIO 14 kêu liên tục không ngừng: chuyển logic điều khiển từ Active LOW sang Active HIGH (LOW = Tắt, HIGH = Kêu).
- **Phạm vi tác động:**
  - `js/admin/admin.face.js`
  - `admin.html`
  - `test_facex_raw.html`
  - `esp32_cam_ai/esp32_cam_ai.ino`
  - `esp32_cam_ai/app_httpd.cpp`
- **Phân tích kỹ thuật & Hiện trạng:**
  - Board ESP32-S3 kết nối Wi-Fi "Robocon Sinh Vien" nhận IP `192.168.2.169`. Cổng 80 và 81 đều mở và phản hồi.
  - Còi buzzer gắn trên chân GPIO 14 là loại Active HIGH (cần 3.3V/HIGH để kêu, 0V/LOW để tắt). Code cũ viết theo Active LOW và set `digitalWrite(BUZZER_PIN, HIGH)` ngay trong `setup()`, khiến còi bị kích hoạt kêu liên tục từ lúc cấp nguồn.
- **Các bước triển khai:**
  1. Gửi lệnh HTTP `http://192.168.2.169/test_pin?pin=14&val=0` để tắt còi tức thì từ xa.
  2. Sửa `esp32_cam_ai.ino`: `digitalWrite(BUZZER_PIN, LOW)` trong `setup()`.
  3. Sửa `app_httpd.cpp`: `beep_handler` đổi sang HIGH để kêu, LOW để ngắt.
  4. Đổi `DEFAULT_ESP_CAM_IP = '192.168.2.169'` và cập nhật `admin.html`, `test_facex_raw.html`, tăng cache-buster lên `v=4`.
  5. Kiểm tra kết nối TCP và lấy frame `/capture` từ IP mới.
- **Tiêu chí nghiệm thu (DoD):**
  - [x] Còi câm/tắt thành công khi chân 14 về mức LOW.
  - [x] Board phản hồi HTTP 200 tại `http://192.168.2.169/capture` với ảnh JPEG hợp lệ.
  - [x] Mã nguồn frontend và firmware được đồng bộ chuẩn xác.
- **Phương án kiểm thử:** Dùng lệnh PowerShell gửi lệnh tắt còi qua `/test_pin` và tải frame qua `/capture`.



