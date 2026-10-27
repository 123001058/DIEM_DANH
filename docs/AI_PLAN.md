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
---

### [TASK-007] Chống phát âm thanh liên tục (Global Debounce) và bổ sung nút Bật/Tắt âm thanh Loa & Còi

- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Khắc phục triệt để tình trạng loa máy tính / còi ESP32 phát âm thanh liên tục khi AI nhận diện khuôn mặt; bổ sung cooldown toàn cục và nút toggle tắt âm thanh trực tiếp trên giao diện.
- **Phạm vi tác động:**
  - `js/admin/admin.face.js`
  - `admin.html`
- **Phân tích kỹ thuật & Hiện trạng:**
  - `adminTrackingFrames >= REQUIRED_CONFIRM_FRAMES` không được reset về 0 sau khi gọi `executeFaceCheckin`, dẫn đến frame tiếp theo vẫn tiếp tục kích hoạt logic điểm danh.
  - Bộ đệm `adminLastCheckinTime[mssv]` chỉ kiểm tra theo từng MSSV. Khi khoảng cách AI dao động giữa 2 người khác nhau ở các frame liên tiếp, loa sẽ phát bíp liên hồi.
  - Giao diện chưa có nút Bật/Tắt âm thanh để người dùng chủ động tắt loa khi kiểm thử.
- **Các bước triển khai:**
  1. Thêm `adminLastGlobalBeepTime` với cooldown tối thiểu 4000ms cho mọi âm thanh phát ra.
  2. Reset `adminTrackingFrames = 0` sau khi chốt nhận diện.
  3. Thêm biến `adminSoundMuted` và hàm `toggleAdminSound()`, tự động ngắt còi ESP32 khi bấm tắt âm.
  4. Thêm nút `btnAdminSoundToggle` trên thanh điều khiển camera trong `admin.html`.
  5. Tăng version script lên `admin.face.js?v=5`.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Khoảng cách giữa 2 lần phát âm thanh bất kỳ tối thiểu 4 giây (không còn tình trạng kêu liên hồi).
  - [ ] Nút Mute trên giao diện hoạt động mượt mà, lưu trạng thái vào localStorage.
  - [ ] Cú pháp file JS hợp lệ 100% (`node -c`).
---

### [TASK-008] Khắc phục triệt để lỗi còi Buzzer chân G14 (GPIO 14) kêu liên tục bằng chuẩn hóa Active Level
- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** Critical
- **Mục tiêu:** Sửa tận gốc nguyên nhân còi gắn ở chân G14 (GPIO 14) kêu liên tục sau khi khởi động. Chuẩn hóa mức kích hoạt còi (Active LOW / Active HIGH) trong cấu hình phần cứng và bổ sung cơ chế bảo vệ ngắt còi dứt khoát.
- **Phạm vi tác động:**
  - `esp32_cam_ai/board_config.h`
  - `esp32_cam_ai/esp32_cam_ai.ino`
  - `esp32_cam_ai/app_httpd.cpp`
  - `js/admin/admin.face.js`
- **Phân tích kỹ thuật & Hiện trạng:**
  - Đa số module còi Buzzer 3 chân cho ESP32/Arduino trên thị trường là loại **Active LOW** (kích mức LOW 0V thì còi kêu; kích mức HIGH 3.3V thì còi tắt).
  - Trước đó, code đã ngộ nhận còi là Active HIGH và set `digitalWrite(BUZZER_PIN, LOW)` trong `setup()` cũng như sau khi beep. Hậu quả: còi bị dính ở mức LOW và hú liên tục không ngắt.
  - Khi có lệnh điều khiển mức 1 hoặc lúc nạp code, chân 14 lên HIGH nên còi "có tắt thật", nhưng sau đó lại bị kéo về LOW nên "lại kêu liên tục".
  - Ngoài ra, frontend gửi đồng thời lệnh `/beep` tới cả port 80 và port 81 (đang kẹt stream MJPEG) gây tắc nghẽn hàng đợi socket.
- **Các bước triển khai:**
  1. Thêm macro định nghĩa `BUZZER_ACTIVE_LOW 1` cùng `BUZZER_ON` / `BUZZER_OFF` vào `esp32_cam_ai/board_config.h`.
  2. Cập nhật `setup()` trong `esp32_cam_ai.ino` dùng `digitalWrite(BUZZER_PIN, BUZZER_OFF)` đảm bảo còi tắt hoàn toàn khi khởi động.
  3. Cập nhật `beep_handler()` trong `esp32_cam_ai/app_httpd.cpp` dùng `BUZZER_ON` / `BUZZER_OFF`, bổ sung debounce 1200ms và đảm bảo chốt ngắt `BUZZER_OFF`.
  4. Tối ưu `triggerEspBuzzer` trong `js/admin/admin.face.js`: chỉ gửi tới port 80, loại bỏ gửi port 81 để tránh nghẽn luồng stream.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Khởi động ESP32 còi hoàn toàn im lặng (`BUZZER_OFF = HIGH`).
  - [ ] Khi có sự kiện nhận diện người thật, còi chỉ kêu đúng 1 tiếng tít ngắn (120ms) rồi ngắt dứt khoát.
  - [ ] Cú pháp JS hợp lệ 100% (`node -c`).
- **Phương án kiểm thử:** Dùng Node.js kiểm tra cú pháp JS, review diff mã nguồn C++ firmware.

---

### [TASK-010] Khắc phục triệt để lỗi không reset được mật khẩu sinh viên (Edge Function admin-reset-password)
- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** Critical
- **Mục tiêu:** Sửa tận gốc nguyên nhân Admin không reset được mật khẩu cho sinh viên (cụ thể là yêu cầu vừa phát sinh của MSSV 123000432 và lỗi chung của Edge Function `admin-reset-password`).
- **Phạm vi tác động:**
  - `supabase/functions/admin-reset-password/index.ts`
  - `js/admin/admin.tasks.js`
- **Phân tích kỹ thuật & Hiện trạng:**
  - **Nguyên nhân 1 (Chặn nhầm Admin con):** MSSV 123000432 (Trần Thành Long) vừa gửi yêu cầu lúc 18:14 UTC+7. Do MSSV này có trong bảng `admin_mssv`, Edge Function chặn cứng bằng kiểm tra `if (targetAdmin)` trả về 403 `Cannot reset another Admin's password`. Admin chính (`123001058`) phải có quyền cấp lại mật khẩu cho sinh viên/tài khoản này.
  - **Nguyên nhân 2 (Lệch schema DB trên cloud):** Bản Edge Function version 8 đang chạy trên Supabase Cloud chưa được deploy bản mới, vẫn cố ghi cột `is_admin: false` vào bảng `profiles` (cột này đã bị xóa khỏi `profiles` và chuyển sang bảng `admin_mssv`), khiến mọi sinh viên chưa có profile bị lỗi 500 `column "is_admin" of relation "profiles" does not exist`.
  - **Nguyên nhân 3 (Phân trang và chuẩn hóa email):** Hàm `listUsers()` trong Edge Function chỉ lấy mặc định 50 users và so sánh chuỗi email phân biệt hoa-thường, gây miss user khi MSSV có chữ in hoa hoặc danh sách Auth vượt quá 50 người.
  - **Nguyên nhân 4 (Bắt lỗi client):** `admin.tasks.js` khi nhận lỗi từ Edge Function chưa parse JSON body, dẫn đến thông điệp lỗi chung chung dạng `Edge Function returned a non-2xx status code`.
- **Các bước triển khai:**
  1. Cập nhật logic `supabase/functions/admin-reset-password/index.ts`:
     - Kiểm tra quyền Admin của caller trực tiếp qua `supabaseAdmin` từ bảng `admin_mssv`.
     - Cho phép reset mật khẩu cho sinh viên dù có tên trong `admin_mssv` (chỉ chặn nếu cố tình reset Admin chính `123001058` khi không phải chính họ).
     - Loại bỏ hoàn toàn trường `is_admin` khi upsert profile.
     - Chuẩn hóa email `${target_mssv.toLowerCase()}@sv.local`, so sánh case-insensitive, tăng `perPage: 1000`.
     - Bổ sung fallback tự tạo auth nếu profile có `user_id` nhưng trong `auth.users` đã bị xóa.
  2. Deploy Edge Function mới lên Supabase Cloud: `supabase functions deploy --project-ref nhjkpknhybenkxwadvzv --use-api admin-reset-password`.
  3. Cập nhật `js/admin/admin.tasks.js` để parse chi tiết thông điệp lỗi JSON từ Edge Function trả về.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Edge Function `admin-reset-password` deploy thành công lên Supabase Cloud (version mới > 8).
  - [ ] Gọi thử nghiệm API hoặc reset mật khẩu cho MSSV `123000432` thành công, không còn bị lỗi 403 `Cannot reset another Admin's password` hay lỗi 500 `is_admin`.
  - [ ] Toàn bộ file JS frontend hợp lệ cú pháp (`node -c`).
- **Phương án kiểm thử:** Dùng `supabase functions deploy`, curl kiểm tra endpoint và kiểm tra cú pháp bằng Node.js.


---

### [TASK-009] Khắc phục vuốt/cuộn danh sách lịch sử quét trên màn hình cảm ứng

- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Đảm bảo người dùng vuốt hoặc cuộn được danh sách lịch sử quét trong khung camera, kể cả khi danh sách dài hơn chiều cao hiển thị.
- **Phạm vi tác động:** `admin.html`, `css/admin.css`.
- **Phân tích kỹ thuật & Hiện trạng:**
  - Danh sách `#adminRecentScansList` có `overflow-y:auto` và `max-height:300px`, nhưng nằm trong các flex container lồng nhau, thiếu `min-height:0` và cấu hình cuộn cảm ứng.
  - Khi chiều cao bị giới hạn, mục lịch sử phía dưới bị cắt; trên màn hình cảm ứng thao tác vuốt có thể không cuộn trong vùng danh sách.
- **Các bước triển khai:**
  1. Cho phép card lịch sử và vùng danh sách co đúng trong flex layout.
  2. Bổ sung cuộn dọc native cho cảm ứng, giới hạn overscroll trong danh sách.
  3. Kiểm tra markup/CSS và tương tác cuộn trong trình duyệt nếu có thể.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Danh sách vượt quá 300px có thể cuộn tới các lượt quét phía dưới.
  - [ ] Vuốt dọc trên thiết bị cảm ứng cuộn danh sách, không chỉ cuộn trang.
  - [ ] Không làm thay đổi thao tác mở nhóm ngày hoặc xem chi tiết lượt quét.
- **Phương án kiểm thử:** Kiểm tra markup/CSS và thử cuộn trong trình duyệt; ghi lại bằng chứng thực tế vào Test Log.

---

### [TASK-011] Hiển thị tên sinh viên vừa quét QR trên LCD ESP32 Kiosk
- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Sau khi QR điểm danh thành công, LCD kiosk tạm hiện họ tên sinh viên rồi tự trở lại mã QR.
- **Phạm vi tác động:** `esp32_kiosk/esp32_kiosk.ino`, `esp32_kiosk/qr_display.h`, migration Supabase mới và `supabase/schema.sql`.
- **Phân tích kỹ thuật & Hiện trạng:**
  - ESP32 hiện gọi `get_open_session()` mỗi giây nhưng chỉ đọc `id` và `qr_token`; thiết bị chưa nhận được sự kiện điểm danh.
  - `attendance` lưu `full_name`, `session_id`, `status`, `created_at`. RPC công khai hiện tại đã phục vụ QR kiosk, nên phản hồi mở rộng chỉ trả tên của lượt hợp lệ mới nhất trong khoảng thời gian ngắn, không trả MSSV hay danh sách lịch sử.
  - LCD vẽ QR phủ toàn màn hình; sau lượt mới sẽ thay tạm bằng thông báo tên trong 3 giây rồi vẽ lại QR để kiosk tiếp tục nhận quét.
- **Các bước triển khai:**
  1. Mở rộng `get_open_session()` để trả `last_checkin` tối giản, giới hạn lượt điểm danh thành công trong 20 giây gần nhất.
  2. Cập nhật firmware nhận diện `attendance.id` mới, tạm hiển thị tên và tự khôi phục QR.
  3. Chuẩn hóa dấu tiếng Việt về ký tự Latin để tương thích font mặc định TFT_eSPI.
  4. Kiểm tra cú pháp/build firmware và SQL migration; ghi bằng chứng thật vào Test Log.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] QR tiếp tục hiển thị bình thường khi chưa có lượt quét mới.
  - [ ] Lượt điểm danh hợp lệ mới nhất làm LCD hiện họ tên trong 3 giây, sau đó QR trở lại.
  - [ ] Payload kiosk không trả MSSV hoặc danh sách attendance.
  - [ ] Firmware biên dịch được và SQL migration hợp lệ.
- **Phương án kiểm thử:** Build sketch ESP32 nếu toolchain có sẵn; kiểm tra JSON/RPC và SQL migration bằng script cục bộ. Không deploy migration hay nạp firmware trong task này.
