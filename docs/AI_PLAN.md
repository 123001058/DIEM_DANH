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
- **Phạm vi tác động:** `admin.html`, `css/admin.css`, `js/admin/admin.face.js`.
- **Phân tích kỹ thuật & Hiện trạng:**
  - Danh sách `#adminRecentScansList` là flex container lồng nhau chứa các nhóm ngày dạng accordion. Khi render, thẻ nhóm ngày thiếu `flex-shrink: 0` và có `overflow: hidden`, khiến flexbox co rút toàn bộ nhóm xuống ~210px và cắt cụt nội dung bên trong, làm `scrollHeight` không vượt quá `clientHeight`, triệt tiêu hoàn toàn khả năng cuộn.
  - Khắc phục triệt để bằng cách thêm `flex-shrink: 0 !important; min-height: min-content;` trên `.scan-date-group-card`, bỏ `overflow: hidden` trên nhóm ngày để hỗ trợ `position: sticky; top: 0` cho header thư mục, hỗ trợ `touch-action: pan-y` cho thao tác vuốt cuộn cảm ứng.
- **Các bước triển khai:**
  1. Thêm quy tắc CSS `.scan-date-group-card` với `flex-shrink: 0 !important; min-height: min-content; touch-action: pan-y;`.
  2. Cập nhật `renderAdminRecentScansGrouped` và `toggleScanDateGroup` trong `js/admin/admin.face.js` sử dụng class `.scan-date-group-card`, header dính (sticky) và bo góc mượt mà.
  3. Bổ sung `padding-right: 2px` cho `#adminRecentScansList` trong `admin.html` để thanh cuộn hiển thị đẹp mắt, không đè viền thẻ.
  4. Kiểm tra markup/CSS và tương tác cuộn runtime bằng Chromium qua CDP, ghi nhận vào TLOG-014.
- **Tiêu chí nghiệm thu (DoD):**
  - [x] Danh sách vượt quá 300px có thể cuộn tới các lượt quét phía dưới (đã test 17 lượt quét, scrollHeight = 1055px, cuộn scrollTop mượt mà).
  - [x] Vuốt dọc trên thiết bị cảm ứng cuộn danh sách, không chỉ cuộn trang (`touch-action: pan-y`, `-webkit-overflow-scrolling: touch`).
  - [x] Không làm thay đổi thao tác mở nhóm ngày hoặc xem chi tiết lượt quét (đã test toggle collapse/expand và modal chi tiết).
- **Phương án kiểm thử:** Đã kiểm thử runtime thực tế trong Chromium Headless qua CDP và ghi nhận bằng chứng vào [TLOG-014](file:///c:/Users/ACER/Documents/GitHub/DIEM_DANH/docs/AI_TEST_LOG.md#tlog-014-khắc-phục-vuốtcuộn-danh-sách-lịch-sử-quét-phân-nhóm-ngày-trong-face-cam-task-009).

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

---

### [TASK-012] Sửa tín hiệu lượt điểm danh mới cho LCD Kiosk (QR và nhận diện mặt)

- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Đảm bảo LCD nhận ra lượt điểm danh vừa cập nhật và hiện đúng họ tên cho các luồng QR và nhận diện mặt.
- **Phạm vi tác động:** `supabase/migrations/` và `supabase/schema.sql` (định nghĩa `get_open_session`); kiểm tra tương thích với `esp32_kiosk/esp32_kiosk.ino`, `esp32_kiosk/qr_display.h`, `checkin.html`, `js/admin/admin.face.js`.
- **Phân tích kỹ thuật & Hiện trạng:**
  - Firmware đang so sánh `last_checkin.id` với mã trước đó để phát hiện lượt mới.
  - Migration hiện hành trả về `attendance.id` làm mã sự kiện. UUID giữ nguyên khi dòng attendance được cập nhật, nên lượt cập nhật lại cùng dòng có thể không tạo tín hiệu mới cho LCD.
  - Luồng web QR gọi `submit_attendance`; luồng nhận diện mặt gọi `kiosk_record_face_checkin`. Hai luồng vẫn giữ nguyên kết quả nghiệp vụ và thông báo hiện có.
  - FRZ-001 khóa chu kỳ polling 1000ms, URL QR và cách hiển thị hiện tại; yêu cầu sửa lỗi này cho phép sửa tương thích tối thiểu nhưng không đổi các chi tiết đó.
- **Các bước triển khai:**
  1. Tạo migration cập nhật `get_open_session` để mã sự kiện kết hợp ID attendance và thời điểm `created_at` mili giây; chỉ trả tên cùng mã sự kiện gần nhất, không trả MSSV/danh sách.
  2. Giữ nguyên polling, thời lượng hiển thị LCD, URL QR và các RPC ghi nhận hiện hữu.
  3. Đồng bộ định nghĩa schema chuẩn, build firmware, kiểm tra migration và rà soát tương thích với hai luồng giao diện; ghi log kết quả thật.
- **Tiêu chí nghiệm thu (DoD):**
  - [x] `last_checkin.id` đổi khi cùng dòng attendance được cập nhật thời điểm ghi nhận (kiểm tra bằng truy vấn SQL trên cloud).
  - [x] Payload chỉ chứa ID sự kiện nội bộ, tên và thông tin phiên hiện hữu; không trả MSSV hoặc danh sách attendance.
  - [x] Firmware build thành công và không đổi tham số/luồng QR đã đóng băng.
  - [x] Tương thích tĩnh với QR và Face AI; màn LCD vật lý chưa xác minh do COM10 được nhận diện là `Unknown`.
- **Phương án kiểm thử:** Build bằng `arduino-cli`; kiểm tra định nghĩa migration và diff; truy vấn read-only `pg_get_functiondef`/RPC nếu Supabase CLI đã liên kết. Không ghi attendance giả vào dữ liệu thật.

---

### [TASK-013] Bố trí lại giao diện LCD Kiosk: Hiển thị đồng thời mã QR và thông báo điểm danh trên cùng khung hình
- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** Critical
- **Mục tiêu:**
  1. Hiển thị mã QR và thông báo điểm danh đồng thời trong một khung hình 320x240, không che các ô của QR.
  2. Mã QR luôn nhìn thấy và tiếp tục quét được ngay cả khi thông báo điểm danh đang hiện.
  3. Khi có lượt điểm danh thành công (quét QR hoặc Face AI), hiện "ĐÃ ĐIỂM DANH" cùng họ tên ở vùng riêng trên màn hình.
  4. Hết thời gian (3 giây), chỉ xóa thông báo trở về trạng thái chờ, mã QR vẫn giữ nguyên liên tục.
  5. Tuyệt đối không dùng thao tác xóa toàn màn hình (`fillScreen`) để tráo đổi giữa QR và thông báo.
  6. Vòng lặp kiểm tra Supabase mỗi giây không vẽ lại QR nếu token không đổi và việc cập nhật QR không xóa thông báo.
- **Phạm vi tác động:**
  - `esp32_kiosk/qr_display.h`
  - `esp32_kiosk/esp32_kiosk.ino`
- **Các bước triển khai:**
  1. Thiết kế lại layout 320x240 trong `qr_display.h`:
     - Vùng QR (bên trái): X: 0..210, Y: 0..240, nền trắng Quiet Zone, module đen, scale nguyên, căn giữa vùng.
     - Vùng thông báo (bên phải): X: 210..320, Y: 0..240, nền đen, đường phân cách màu tối.
     - Hàm `drawQRCode(String text)` chỉ vẽ trong vùng QR, không đụng tới vùng thông báo.
     - Hàm `drawCheckinNotice(String name)` chỉ cập nhật vùng thông báo bên phải ("DA DIEM DANH", họ tên ngắt dòng chuẩn).
     - Hàm `clearCheckinNotice()` chỉ xóa vùng thông báo bên phải về màn hình chờ ("LH-NaviX KIOSK / SAN SANG / QUET QR HOAC MAT").
  2. Cập nhật `esp32_kiosk.ino`:
     - Khi mở phiên / có QR: Vẽ QR bên trái và vẽ trạng thái chờ bên phải.
     - Khi có lượt điểm danh mới: Gọi `drawCheckinNotice(...)` (QR bên trái giữ nguyên 100%).
     - Khi hết 3 giây: Gọi `clearCheckinNotice()` (QR bên trái giữ nguyên 100%, không vẽ lại QR).
     - Khi vòng lặp polling mỗi 1s chạy: Nếu `qrToken == currentQrToken`, không vẽ lại QR.
  3. Biên dịch firmware bằng `arduino-cli` và kiểm tra tĩnh tính toàn vẹn.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Vùng QR và Vùng thông báo tách biệt, không chồng lấn.
  - [ ] QR luôn nhìn thấy liên tục, không bị xóa khi hiện tên hoặc xóa tên.
  - [ ] Tên sinh viên và "DA DIEM DANH" hiện rõ ràng ở vùng thông báo.
  - [ ] Không có lệnh xóa toàn màn hình `fillScreen` trong chu trình hiển thị điểm danh.
  - [ ] Firmware biên dịch thành công 100% bằng `arduino-cli`.
- **Phương án kiểm thử:** Biên dịch firmware bằng Arduino CLI; kiểm tra phân vùng tọa độ bằng script Node.js; review diff C++.

---

### [TASK-014] Chuẩn hóa quy tắc bảo vệ luồng cốt lõi đã kiểm chứng

- **Ngày tạo:** 2026-10-27
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Ghi rõ cách nhận diện và bảo vệ đúng luồng cốt lõi đã chạy tốt trong `FROZEN_FEATURES.md`, để khi thêm tính năng có liên quan code cũ, AI giới hạn thay đổi ở phạm vi cần thiết và không sửa lan man.
- **Phạm vi tác động:** `docs/FROZEN_FEATURES.md`, `docs/AI_PLAN.md`, `docs/AI_PROGRESS.md`, `docs/AI_TEST_LOG.md`.
- **Phân tích kỹ thuật & Hiện trạng:**
  - `FROZEN_FEATURES.md` đã cấm sửa tùy tiện và yêu cầu giữ luồng cũ, nhưng chưa nói rõ cách khoanh ranh giới khi code mới dùng chung file/module với luồng cũ.
  - Một số task hiện còn `[IN_PROGRESS]` hoặc `[VERIFYING]`; không được suy diễn chúng đã chạy tốt hoặc tự thêm chúng vào danh sách đóng băng.
  - Có mục đóng băng cần đối chiếu lại nếu bằng chứng mới trong code/test log mâu thuẫn; task này chỉ bổ sung quy tắc chung, không tự sửa nội dung tính năng đã có.
- **Các bước triển khai:**
  1. Bổ sung tiêu chí chỉ đóng băng luồng cốt lõi có bằng chứng và ghi rõ phạm vi hành vi.
  2. Bổ sung quy trình khoanh vùng thay đổi, mở rộng tương thích, xử lý ngoại lệ và kiểm thử hồi quy.
  3. Kiểm tra nội dung/diff tài liệu và ghi kết quả thật vào Test Log.
- **Tiêu chí nghiệm thu (Acceptance Criteria / Definition of Done - DoD):**
  - [x] Quy định nêu rõ không sửa lan sang code cũ chỉ vì có liên quan; phải khoanh phần dùng chung và thay đổi tối thiểu.
  - [x] Chỉ thêm luồng đã có bằng chứng chạy tốt; không suy diễn từ build hoặc trạng thái đang xác minh.
  - [x] Quy định xử lý khi buộc phải chạm luồng đóng băng và yêu cầu kiểm thử hồi quy.
  - [x] Diff sạch và có bản ghi kiểm tra tài liệu trong Test Log.
- **Phương án kiểm thử:** Kiểm tra diff tài liệu bằng `git diff --check` và chạy PowerShell assertions xác nhận các quy định bắt buộc hiện diện trong `docs/FROZEN_FEATURES.md`.

---

### [TASK-015] Tối ưu giao diện mobile-first responsive và khắc phục lỗi xem luồng Camera ESP32 trên điện thoại

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** Critical
- **Mục tiêu:**
  1. Tối ưu giao diện mobile-first responsive thực sự trên điện thoại di động (không bị co cụm thu nhỏ như desktop thu nhỏ, không tràn ngang, touch targets chuẩn, thanh điều hướng dưới hỗ trợ trực tiếp Camera, bố cục cuộn trang mượt mà).
  2. Sửa tận gốc nguyên nhân điện thoại không tải được luồng camera từ địa chỉ `192.168.2.169` trong khi laptop xem được: xử lý CORS/PNA preflight OPTIONS, Mixed Content (HTTPS vs HTTP), khả năng kết nối mạng di động/Wi-Fi LAN, giải phóng nghẽn socket server ESP32 và cơ chế fallback luồng trực tiếp linh hoạt.
  3. Tuyệt đối tôn trọng các tính năng đóng băng trong `docs/FROZEN_FEATURES.md` (FRZ-004 còi Active LOW, FRZ-005 Debounce 4000ms & Mute).
- **Phạm vi tác động:**
  - `admin.html`
  - `css/admin.css`
  - `js/admin/admin.face.js`
  - `js/admin/admin.core.js`
  - `esp32_cam_ai/app_httpd.cpp`
- **Phân tích kỹ thuật & Hiện trạng:**
  - **Về giao diện mobile:**
    - Thẻ meta viewport có `minimum-scale=0.5`. Khi nội dung hoặc bảng có chiều ngang rộng hơn màn hình điện thoại, trình duyệt mobile sẽ auto-zoom-out xuống 0.5 khiến toàn bộ giao diện bị teo nhỏ như phiên bản laptop thu nhỏ.
    - Thiếu kiểm soát tràn ngang (`overflow-x: hidden`) trên cấp độ app-wrapper / body, khiến một số bảng dữ liệu hoặc flex toolbar đẩy to bề ngang màn hình di động.
    - Khung camera và toolbar camera (`#view-face-cam`): các nút bấm chưa được căn chỉnh tối ưu cho thao tác một tay bằng ngón cái, thanh trạng thái HUD bị phình to khi thông báo lỗi dài làm che khung hình.
    - Thanh dock điều hướng đáy (`#mobileBottomNav`) chưa có nút truy cập nhanh đến tab Camera Điểm danh ESP32 (`face-cam`).
  - **Về luồng xem Camera trên điện thoại:**
    - **Nguyên nhân 1 (CORS & Private Network Access - PNA):** Trình duyệt Chrome Android và Safari iOS gửi preflight `OPTIONS` khi truy cập IP nội bộ `192.168.2.169` từ origin khác. Firmware ESP32 `app_httpd.cpp` không đăng ký handler `HTTP_OPTIONS` và thiếu các header PNA (`Access-Control-Allow-Private-Network: true`), dẫn đến request bị hủy ngay lập tức trên mobile.
    - **Nguyên nhân 2 (Mixed Content HTTPS):** Nếu trang web được mở qua `https://` (GitHub Pages), trình duyệt mobile chặn cứng mọi kết nối `http://` đến camera nội bộ. Cần cơ chế phát hiện và cảnh báo thông minh, hướng dẫn người dùng kết nối qua HTTP nội bộ.
    - **Nguyên nhân 3 (Nghẽn socket / Single client lock):** Cổng 81 của ESP32 phục vụ luồng `multipart/x-mixed-replace` bằng vòng lặp vô tận `while(true)`. Nếu laptop đang mở xem, socket bị chiếm giữ khiến điện thoại vào sau bị từ chối kết nối.
    - **Nguyên nhân 4 (Cơ chế fallback trực tiếp):** Khi luồng stream cổng 81 bị nghẽn hoặc bị chặn trên một số trình duyệt di động, frontend chưa có cơ chế tự động fallback sang luồng snapshot trực tiếp cổng 80 (`/capture` polling ở tốc độ cao), vốn nhẹ hơn và không bị kẹt socket.
- **Các bước triển khai:**
  1. **Bước 1: Tối ưu thẻ Viewport và triệt tiêu tràn ngang:**
     - Chuẩn hóa thẻ `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">` trong `admin.html`.
     - Thêm `overflow-x: hidden` trên `html, body, .app-wrapper` và thiết lập cuộn ngang cảm ứng chuẩn cho toàn bộ bảng.
  2. **Bước 2: Nâng cấp Mobile UI & Bottom Navigation:**
     - Bổ sung nút **Camera ESP32** vào thanh `.mobile-bottom-nav` để người dùng chạm 1 chạm ngón cái truy cập ngay camera.
     - Đồng bộ trạng thái active của bottom nav khi chuyển sang tab `face-cam`.
     - Tối ưu toolbar camera trên mobile: bố cục gọn gàng, input IP co giãn linh hoạt, các nút hành động lớn dễ bấm ngón tay cái, khoảng cách và cỡ chữ chuẩn touch.
     - Tối ưu thanh HUD dưới camera: co giãn tốt, không làm vỡ khung hình khi text dài.
  3. **Bước 3: Sửa lỗi kết nối và nâng cấp server ESP32 (app_httpd.cpp):**
     - Đăng ký handler `HTTP_OPTIONS` cho cả cổng 80 và 81, phản hồi mã 204 kèm đầy đủ header:
       `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: *`, `Access-Control-Allow-Private-Network: true`.
     - Bổ sung `Access-Control-Allow-Private-Network: true` vào cả phản hồi của `/stream` và `/capture`.
     - Nâng cấp cấu hình socket: `lru_purge_enable = true` giúp tự động đóng socket ngắt kết nối.
  4. **Bước 4: Nâng cấp client frontend camera (admin.face.js):**
     - Phát hiện Mixed Content khi chạy ở HTTPS và hiển thị hướng dẫn người dùng rõ ràng, dễ hiểu.
     - Thêm cơ chế tự động kết nối luồng trực tiếp thông minh: Ưu tiên luồng `/stream` cổng 81; nếu gặp lỗi kết nối/từ chối trên mobile, tự động chuyển đổi mượt mà sang chế độ Fast Stream qua cổng 80 (`/capture`) để đảm bảo người dùng luôn xem được trực tiếp trên điện thoại mà không bị gián đoạn hay phải đổi sang ảnh tĩnh thủ công.
     - Đảm bảo giữ nguyên vẹn 100% chức năng nhận diện AI, Debounce 4000ms và nút Mute còi (FRZ-004, FRZ-005).
  5. **Bước 5: Kiểm thử và lập tài liệu:**
     - Kiểm tra cú pháp JS (`node -c`), kiểm tra biên dịch ESP32 firmware nếu có toolchain, kiểm tra layout responsive bằng script kiểm tra kích thước/DOM.
     - Ghi nhận đầy đủ vào `AI_TEST_LOG.md`.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Giao diện `admin.html` hiển thị tự nhiên trên điện thoại di động: không bị co cụm thu nhỏ như màn hình laptop, không tràn ngang, thanh điều hướng đáy có tab Camera ESP32 hoạt động tốt.
  - [ ] Các nút bấm trên toolbar camera dễ thao tác bằng cảm ứng (min 38px), cuộn trang và cuộn danh sách lịch sử mượt mà.
  - [ ] Luồng camera ESP32 hỗ trợ đầy đủ CORS, PNA preflight OPTIONS, có cơ chế live stream fallback cổng 80 chống kẹt socket.
  - [ ] Có cảnh báo Mixed Content rõ ràng khi mở qua HTTPS.
  - [ ] Tuyệt đối không ảnh hưởng đến tính năng đã đóng băng (FRZ-004, FRZ-005).
  - [ ] Toàn bộ cú pháp file JS hợp lệ 100%.
- **Phương án kiểm thử:** Dùng script Node.js kiểm tra cú pháp, DOM elements, CSS rules và curl/test server mô phỏng request OPTIONS/CORS.

---

### [TASK-016] Tô màu trạng thái điểm danh trong Excel và hiển thị lịch học trường là Đi học

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Trong các file Excel điểm danh chi tiết, tô đỏ sinh viên vắng không phép, tô vàng sinh viên đi muộn, tô xanh sinh viên có lịch học trường; trường hợp trạng thái `vắng có phép` với phân loại `Học trường` hiển thị là `Đi học`.
- **Phạm vi tác động:** `admin.html` (thư viện xuất Excel có hỗ trợ style), `js/admin/admin.students.js` (xuất Excel phiên), `js/admin/admin.attendance.js` (xuất Excel theo nhóm), `docs/AI_PLAN.md`, `docs/AI_PROGRESS.md`, `docs/AI_TEST_LOG.md`.
- **Phân tích kỹ thuật & Hiện trạng:** Các exporter dùng SheetJS CE, không ghi được fill màu từng ô. Dữ liệu lịch học trường được đánh dấu qua `category='Học trường'`; xin nghỉ có phép thông thường có category khác. Cần giữ nguyên dữ liệu trong database và chỉ đổi nhãn khi dựng file Excel.
- **Quy tắc hiển thị:** `vắng không phép` ưu tiên đỏ; `đi muộn` ưu tiên vàng; `category='Học trường'` tô xanh. Khi trạng thái là `vắng có phép` và category là `Học trường`, xuất nhãn `Đi học`. Trạng thái có phép do xin nghỉ giữ nguyên.
- **Các bước triển khai:**
  1. Dùng thư viện tương thích SheetJS có hỗ trợ cell styles.
  2. Áp dụng màu cho toàn dòng dữ liệu ở các sheet chi tiết xuất theo phiên và theo nhóm.
  3. Chuẩn hóa nhãn `vắng có phép` + `Học trường` thành `Đi học` trong file xuất, không sửa dữ liệu gốc.
  4. Kiểm tra cú pháp, kiểm thử quy tắc phân loại với bộ dữ liệu đại diện và xác minh style trong workbook XLSX được tạo.
  5. Ghi bằng chứng vào `AI_TEST_LOG.md`; chưa đánh dấu DONE nếu chưa kiểm chứng việc tạo workbook styled.
- **Tiêu chí nghiệm thu (DoD):**
  - [x] Vắng không phép có dòng đỏ; đi muộn có dòng vàng; học trường có dòng xanh trong các sheet chi tiết.
  - [x] `vắng có phép` phân loại `Học trường` hiển thị `Đi học`; xin nghỉ có phép vẫn là `vắng có phép`.
  - [x] Workbook XLSX round-trip được và giữ nguyên header, ghi chú/chức năng dữ liệu đã kiểm tra.
  - [x] Kết quả kiểm thử runtime với fixture được ghi vào test log.
- **Phương án kiểm thử:** Chạy kiểm tra syntax JS; tạo workbook bằng thư viện dự án với các trạng thái đại diện; đọc lại workbook để xác nhận nhãn và fill màu từng dòng; chạy `git diff --check`.

---

### [TASK-017] Sửa ghi chú điểm danh và giữ nguyên vắng có phép khi camera quét

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Cho phép Admin sửa/xóa ghi chú điểm danh ở phiên hiện tại hoặc lịch sử; không để nhận diện khuôn mặt ghi đè trạng thái `vắng có phép` đã được ghi nhận.
- **Phạm vi tác động:** `js/admin/admin.tasks.js`, một migration Supabase mới cập nhật RPC `kiosk_record_face_checkin` và thêm RPC Admin `admin_update_attendance_note`, `docs/AI_PLAN.md`, `docs/AI_PROGRESS.md`, `docs/AI_TEST_LOG.md`.
- **Phân tích kỹ thuật & Hiện trạng:** Nút sửa ghi chú dùng lệnh REST `UPDATE attendance` trực tiếp; kết quả cập nhật 0 dòng có thể không được báo lỗi và phụ thuộc quyền bảng/RLS. RPC camera hiện chỉ chặn hàng đã `có mặt` hoặc `đi muộn`, vì vậy một hàng `vắng có phép` có thể bị chuyển thành có mặt/đi muộn sau khi quét.
- **Rủi ro và giới hạn:** Không đổi ngưỡng nhận diện, điểm confidence, liveness, debounce hoặc hành vi còi/âm thanh đã đóng băng. Migration cần được áp dụng vào Supabase trước khi RPC mới hoạt động trên hệ thống thật; không tự chạy migration lên production trong phiên này.
- **Các bước triển khai:**
  1. Thêm RPC bảo vệ bằng `SECURITY DEFINER` và `is_admin()` để cập nhật riêng cột `attendance.note`, trả kết quả lỗi rõ khi không có hàng.
  2. Chuyển `saveStudentNote()` sang gọi RPC; chỉ báo thành công và cập nhật UI nếu RPC xác nhận lưu.
  3. Cập nhật `kiosk_record_face_checkin` để trả mã `EXCUSED` và không ghi đè hàng đang `vắng có phép`.
  4. Kiểm tra cú pháp JS/SQL, chạy fixture xác nhận note được gửi đúng RPC và trạng thái có phép được bảo vệ; ghi bằng chứng vào test log.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Sửa hoặc xóa note cập nhật đúng hàng theo `session_id` + `mssv`; giao diện chỉ báo thành công khi RPC trả `ok=true`.
  - [ ] Lượt quét camera không biến hàng `vắng có phép` thành có mặt hoặc đi muộn; các trạng thái khác giữ hành vi cũ.
  - [ ] Không thay đổi thuật toán nhận diện hoặc tính năng FRZ-005.
  - [ ] Có bằng chứng kiểm thử; ghi rõ migration chưa áp dụng trên Supabase thật nếu chưa deploy.
- **Phương án kiểm thử:** Node syntax/runtime harness cho hàm lưu note; kiểm tra migration bằng Supabase CLI/local database nếu môi trường có sẵn; assertions cho các nhánh status trong RPC camera; `git diff --check`.

---

### [TASK-018] Bật/tắt camera tùy ý độc lập và phân tách chế độ Giám sát vs Điểm danh AI (Mức A)

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** High
- **Mục tiêu:**
  1. Cho phép Admin chủ động bật/tắt camera ESP32 xem trực tiếp (Live View) mọi lúc độc lập với phiên điểm danh.
  2. Phân tách rạch ròi 2 chế độ hoạt động:
     - `Chế độ Điểm danh AI (Face Scan)`: Bật cam + nhận diện mặt + ghi điểm danh + còi báo khi khớp (tự động kích hoạt khi có phiên điểm danh, giữ nguyên 100% tính năng cũ).
     - `Chế độ Giám sát (Chỉ xem)`: Bật cam xem luồng trực tiếp từ ESP32 mọi lúc tùy ý, không chạy nhận diện mặt, không kêu còi, không ghi điểm danh nhầm, nhẹ máy và tiết kiệm pin.
  3. Tôn trọng thao tác Admin: Khi Admin bấm "Tắt camera", hệ thống ghi nhớ trạng thái dừng (`adminUserManuallyStopped = true`), không tự động bật lại đè lên ý Admin khi chuyển tab qua lại.
  4. Đảm bảo giao diện responsive, không xung đột với các tính năng đóng băng (FRZ-004 còi Buzzer Active LOW, FRZ-005 Debounce & Mute).
- **Phạm vi tác động:** `admin.html`, `js/admin/admin.face.js`, `css/admin.css`.
- **Phân tích kỹ thuật & Hiện trạng:**
  - Hiện tại, `startAdminCamera()` luôn kích hoạt luồng nhận diện AI Face-API/MiniFASNet, khiến người dùng muốn xem cam thông thường bị tiêu tốn CPU/GPU và có thể kích hoạt còi/lưu điểm danh nhầm.
  - Mỗi khi chuyển sang tab `face-cam`, hàm `initFaceCamInAdmin(false)` tự ý gọi `startAdminCamera()` khiến Admin bấm tắt cam xong chuyển tab quay lại bị tự bật lại.
  - Cần bổ sung biến trạng thái `adminCameraMode` ('ai' | 'monitor') và `adminUserManuallyStopped`, cùng bộ chọn chế độ trực quan trên toolbar.
- **Tiêu chí nghiệm thu (DoD):**
  - [x] Bật/tắt camera độc lập ở chế độ "Chỉ xem" (Monitor) thành công: luồng stream hiển thị bình thường, KHÔNG chạy loop nhận diện AI, KHÔNG kêu còi, canvas không vẽ bounding box (xác minh qua Chromium CDP).
  - [x] Chuyển đổi qua lại giữa "Điểm danh AI" và "Chỉ xem" linh hoạt ngay khi camera đang phát luồng.
  - [x] Khi Admin bấm "Dừng camera", camera tắt hoàn toàn; chuyển tab và quay lại KHÔNG bị tự động bật lại.
  - [x] Khi có phiên điểm danh mở (`autoStartAdminCameraOnSession()`), camera tự động kích hoạt ở chế độ "Điểm danh AI" bảo toàn 100% luồng cũ.
  - [x] Giao diện responsive trên mobile và desktop, không vỡ khung.
  - [x] Toàn bộ cú pháp file JS hợp lệ 100% (`node -c`).
- **Phương án kiểm thử:** Đã kiểm thử tự động với suite script Chromium CDP ghi nhận tại [TLOG-017](file:///c:/Users/ACER/Documents/GitHub/DIEM_DANH/docs/AI_TEST_LOG.md#tlog-017-bật-tắt-camera-tùy-ý-độc-lập-và-phân-tách-chế-độ-giám-sát-vs-điểm-danh-ai-task-018).

---

### [TASK-019] Loại bỏ nút mở luồng camera trong tab mới và làm gọn giao diện quản trị

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** Medium
- **Mục tiêu:**
  1. Loại bỏ hoàn toàn nút "↗ Tab mới" trên thanh công cụ camera và nút "↗️ Mở xem luồng trong Tab mới" trong banner cảnh báo Mixed Content của `admin.html`.
  2. Dọn dẹp hàm `openEspCamInNewTab()` và các export thừa trong `js/admin/admin.face.js` nhằm giữ giao diện tối giản, sạch sẽ theo đúng tinh thần Ponytail (YAGNI & Deletion over addition).
  3. Giữ nguyên hướng dẫn người dùng kích hoạt "Insecure content" trực tiếp trên trình duyệt di động qua icon ổ khóa/cài đặt trang (🎚️) để camera nhúng phát mượt mà nội bộ.
- **Phạm vi tác động:** `admin.html`, `js/admin/admin.face.js`, `docs/AI_PLAN.md`, `docs/AI_PROGRESS.md`, `docs/AI_TEST_LOG.md`.
- **Tiêu chí nghiệm thu (DoD):**
  - [x] Không còn nút `openEspCamInNewTab` trên toolbar hoặc alert banner trong `admin.html`.
  - [x] Xóa hàm `openEspCamInNewTab()` và `window.openEspCamInNewTab` khỏi `js/admin/admin.face.js`.
  - [x] Không có lỗi cú pháp JavaScript (`node -c js/admin/admin.face.js` exit code 0).
  - [x] Các tính năng camera: bật/tắt camera, chuyển chế độ AI/Chỉ xem, lật gương, toàn màn hình, bật tắt âm thanh hoạt động bình thường, không vỡ layout.
- **Phương án kiểm thử:** Script kiểm tra tính toàn vẹn UI (`scratch/check_ui_cleanup.js`), kiểm tra cú pháp node, ghi nhận tại [TLOG-018](file:///c:/Users/ACER/Documents/GitHub/DIEM_DANH/docs/AI_TEST_LOG.md#tlog-018-loại-bỏ-nút-mở-luồng-camera-tab-mới-và-làm-gọn-giao-diện-quản-trị-task-019).

---

### [TASK-020] Đồng bộ Lịch ngoài (External Schedules) với Điểm danh và Giao diện Quản trị

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** Critical
- **Mục tiêu:**
  1. Khắc phục triệt để lỗi sinh viên đăng ký Lịch ngoài (khóa học tiếng Nhật, IELTS, thực tập...) nhưng khi mở/đóng phiên điểm danh bị hệ thống bỏ qua và tự động đánh "vắng không phép".
  2. Bổ sung hàm helper `external_schedule_covers_session(...)` để kiểm tra chính xác tính bao phủ của lịch ngoài theo ngày, thứ trong tuần (`days_of_week`) và khung giờ.
  3. Cập nhật `admin_open_session` và `admin_close_session` để tự động ghi nhận `vắng có phép`, phân loại `Lịch ngoài`, ghi chú tên môn và địa điểm khi trùng ca học ngoài.
  4. Tạo Trigger `reconcile_external_schedule_with_attendance` trên bảng `student_external_schedules` để tự động rà soát và lật các phiên điểm danh trong 7 ngày gần nhất từ "vắng không phép" sang "vắng có phép" khi sinh viên tạo/cập nhật lịch ngoài.
  5. Đồng bộ giao diện Quản trị (`admin.tasks.js`): nạp lịch ngoài vào widget thời khóa biểu hôm nay và bảng danh sách, hiển thị badge `📚 Lịch ngoài`.
  6. Đồng bộ xuất Excel (`admin.students.js`): phân loại `Lịch ngoài` được đánh dấu "Đi học" và tô màu xanh tương đương `Học trường`.
- **Phạm vi tác động:** `supabase/migrations/20261028170000_sync_external_schedules_with_attendance.sql`, `js/admin/admin.tasks.js`, `js/admin/admin.students.js`, `docs/AI_PLAN.md`, `docs/AI_PROGRESS.md`, `docs/AI_TEST_LOG.md`.
- **Rủi ro & Xung đột đã rà soát:**
  - Thứ tự ưu tiên ghi nhận: Đơn nghỉ đã duyệt > Lịch học trường ME > Lịch ngoài (được bảo vệ nhờ `on conflict (session_id, mssv) do nothing` và thứ tự `case when`).
  - Bảo vệ tính năng đóng băng (FRZ-001..FRZ-005): Không can thiệp bất kỳ tham số phần cứng Kiosk hay còi/camera.
  - Bảo vệ trạng thái sinh viên đã quét (Face AI / QR): Trigger đối chiếu chỉ cập nhật các bản ghi đang ở trạng thái `vắng không phép` (Xưởng), tuyệt đối không đè lên sinh viên có mặt / đi muộn hay bản ghi Admin sửa thủ công.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Migration database tạo thành công và được thực thi trên Supabase Cloud.
  - [ ] Hàm `external_schedule_covers_session` tính toán đúng thứ trong tuần (Monday=2..Sunday=8) và độ lệch múi giờ UTC+7.
  - [ ] `admin_open_session` và `admin_close_session` tự động ghi nhận vắng có phép với phân loại `Lịch ngoài`.
  - [ ] Trigger tự động rà soát 7 ngày gần nhất khi có lịch ngoài mới hoặc chỉnh sửa.
  - [ ] Bản ghi của bạn Phạm Tuấn Phát trong phiên tối 27/10 được chuẩn hóa `category = 'Lịch ngoài'`, `note = 'Lịch ngoài: Tiếng nhật (Cơ sở 2)'`.
  - [ ] Giao diện Admin hiển thị lịch ngoài trong cột Lịch học hôm nay, xuất Excel nhận diện đúng.
  - [ ] Toàn bộ file JavaScript hợp lệ cú pháp (`node -c`).
- **Phương án kiểm thử:** Script SQL đối chiếu test case thực tế và suite test Node.js ghi nhận tại [TLOG-019](file:///c:/Users/ACER/Documents/GitHub/DIEM_DANH/docs/AI_TEST_LOG.md#tlog-019-đồng-bộ-lịch-ngoài-với-điểm-danh-và-giao-diện-quản-trị-task-020).

---

### [TASK-021] Hiển thị Avatar Sinh viên sau khi Điểm danh Thành công trên Màn hình Kiosk ESP32

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** High
- **Mục tiêu:**
  1. Khi có lượt điểm danh thành công (QR hoặc Face AI), Kiosk ẩn mã QR trong 3.5 giây và hiển thị toàn màn hình (320x240): Họ tên lớn (viết hoa không dấu), MSSV, trạng thái "DA DIEM DANH", và ảnh đại diện thật từ hồ sơ web sinh viên.
  2. Nếu sinh viên chưa có avatar hoặc ảnh tải lỗi/quá hạn: Hiển thị ngay lập tức huy hiệu chữ cái đầu (Initials Badge) cùng họ tên và MSSV (zero-latency fallback).
  3. Tải avatar qua FreeRTOS background task trên Core 0 (timeout 1.0s, buffer 16KB, HTTP riêng). Luồng nền tuyệt đối không gọi `tft.*`; chỉ `loop()` ở Core 1 vẽ màn hình.
  4. Giải mã JPEG bằng thư viện `TJpg_Decoder` (đã cài đặt). Kiểm tra header magic bytes `0xFF, 0xD8` trước khi giải mã.
  5. Cập nhật RPC `get_open_session()` để `last_checkin` trả về thêm `mssv` và `avatar`.
  6. Khôi phục tự động sau 3.5 giây: Vẽ lại mã QR mới nhất và giao diện chờ như cũ. Polling 1s vẫn duy trì không ngắt quãng.
- **Phạm vi tác động:**
  - `supabase/migrations/20261028183000_kiosk_last_checkin_avatar.sql`
  - `esp32_kiosk/qr_display.h`
  - `esp32_kiosk/esp32_kiosk.ino`
  - `docs/AI_PLAN.md`, `docs/AI_PROGRESS.md`, `docs/AI_TEST_LOG.md`
- **Rủi ro & Kiểm soát an toàn:**
  - *Bộ nhớ ESP32:* `TJpg_Decoder` chỉ tốn ~3.1 KB RAM work area + buffer 16 KB + task stack 4 KB (< 25 KB). RAM còn trống trên ESP32 > 270 KB.
  - *Thread-safety:* Tác vụ FreeRTOS nền (Core 0) tuyệt đối không chạm vào bus SPI hay gọi `tft.*`. Chỉ lưu byte vào RAM và bật cờ `avatarReady`. Chỉ `loop()` (Core 1) gọi hàm vẽ.
  - *Đóng băng tính năng:* Giữ nguyên thuật toán tạo QR, polling 1s, và URL `checkin.html?t=`. Chưa sửa `FRZ-001` trong `FROZEN_FEATURES.md` cho đến khi nạp và kiểm chứng trên Kiosk thực tế.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Migration `get_open_session` cập nhật thành công, trả về đúng `id`, `name`, `mssv`, `avatar` của lượt điểm danh mới nhất.
  - [ ] Code firmware `esp32_kiosk` biên dịch thành công 100% bằng `arduino-cli` không lỗi.
  - [ ] Bộ giải mã JPEG `TJpg_Decoder` tích hợp chuẩn xác với SPI TFT_eSPI qua callback `tft_output`.
  - [ ] Luồng tải avatar nền hoạt động độc lập, không làm đứng hoặc block polling 1 giây.
  - [ ] Tự động chuyển đổi mượt mà giữa huy hiệu chữ cái đầu (fallback) và ảnh avatar thật khi tải xong.
  - [ ] Hết 3.5 giây tự động khôi phục QR code mới nhất và bảng thông báo Kiosk mặc định.
- **Phương án kiểm thử:** Kiểm tra REST endpoint Supabase qua curl/node, biên dịch firmware bằng Arduino CLI, kiểm tra heap & stack size, ghi nhận tại TLOG-020.

### [TASK-022] Tạo sự kiện riêng để Kiosk hiển thị lại sau mỗi lượt quét

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Mỗi lần QR hoặc Face AI điểm danh thành công, kể cả trả `ALREADY`, phát một `event_id` mới cho đúng MSSV để Kiosk hiển thị lại tên/avatar. Không tạo attendance/audit trùng và không sửa `attendance.created_at` trong nhánh `ALREADY`.
- **Phạm vi tác động:** Migration Supabase mới; `get_open_session()`, `submit_attendance()`, `kiosk_record_face_checkin()`; firmware Kiosk chỉ khi định dạng API hiện tại chưa đủ; tài liệu quản lý kiểm thử.
- **Phân tích kỹ thuật & Hiện trạng:** Kiosk chỉ nhận ID đổi; RPC hiện tạo ID từ `attendance.id + created_at`. Bản ghi cùng sinh viên không đổi khi quét lại `ALREADY`, vì vậy màn hình không chạy lại. Đổi `created_at` sẽ làm sai giờ điểm danh gốc. Một tín hiệu riêng theo phiên có UUID mới giữ nguyên dữ liệu attendance.
- **Các bước triển khai:**
  1. Tạo bảng tín hiệu hiển thị riêng, cập nhật UUID và MSSV trên mỗi lượt hợp lệ.
  2. Phát tín hiệu từ cả nhánh mới và `ALREADY` của QR/Face AI; giữ nguyên guard `vắng có phép` và lịch sử audit.
  3. Cho `get_open_session()` trả `event_id`, MSSV, tên và avatar của đúng lượt gần nhất.
  4. Xác minh firmware nhận event UUID, hiển thị lại và không lặp mỗi lần polling.
- **Rủi ro & kiểm soát:** Tín hiệu mới nhất theo phiên có thể bị thay thế nếu nhiều lượt xảy ra giữa hai lần polling. Kiểm tra các lượt liên tiếp thực tế; nếu có thể mất sự kiện cần chuyển API/Kiosk sang hàng đợi sự kiện có xác nhận.
- **Tiêu chí nghiệm thu:**
  - [ ] QR cùng sinh viên quét lần hai tạo UUID mới, không đổi attendance timestamp/log.
  - [ ] QR hai sinh viên liên tiếp trả đúng dữ liệu từng event.
  - [ ] Face AI lặp cùng sinh viên và hai sinh viên liên tiếp có cùng hành vi; giữ nguyên nhánh `EXCUSED`.
  - [ ] Kiosk hiện đúng avatar 3,5 giây mỗi lần, QR trở lại, không nhấp nháy lặp khi event không đổi.
- **Phương án kiểm thử:** Kiểm tra SQL/RPC và build firmware; sau đó kiểm tra QR/Face AI trên Kiosk thật. Ghi trung thực kết quả và phân biệt build/API với nghiệm thu phần cứng trong TLOG.

### [TASK-023] Kiosk lấy avatar từ thư mục `images/faces`

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** High
- **Mục tiêu:** Khi hiện tên sinh viên sau lượt quét, Kiosk tự lấy JPEG trong `images/faces/<MSSV>.jpg` trên web repo, không dùng đường dẫn `students.avatar`.
- **Phạm vi tác động:** `esp32_kiosk/esp32_kiosk.ino`, tài liệu quản lý task và kiểm thử.
- **Hiện trạng:** Firmware đang dùng URL avatar do RPC trả từ database. Repo có ảnh theo tên MSSV trong `images/faces`; Kiosk đã tải JPEG qua GitHub Pages và giải mã bằng `TJpg_Decoder`.
- **Triển khai:** Dùng MSSV của `last_checkin` để ghép URL `web_domain + /images/faces/<MSSV>.jpg`; giữ nguyên event ID và tên từ RPC.
- **Rủi ro:** Thư mục có cả PNG/WDP nhưng firmware hiện chỉ giải mã JPEG. Nếu không có file `.jpg` đúng MSSV, Kiosk sẽ dùng initials fallback.
- **Tiêu chí nghiệm thu:**
  - [x] Kiosk không còn sử dụng trường `last_checkin.avatar` để tạo URL.
  - [x] URL ảnh theo MSSV từ `images/faces` trả JPEG hợp lệ.
  - [x] Firmware build thành công.
  - [ ] Xác nhận hiển thị trên LCD thật sau khi nạp.
- **Phương án kiểm thử:** HEAD/GET ảnh GitHub Pages, kiểm tra firmware references và build Arduino CLI; LCD thật cần kiểm tra sau khi nạp.




### [TASK-024] Hiện avatar ngay từ bộ ảnh trong firmware và xuống dòng tên theo pixel

- **Ngày tạo:** 2026-10-28
- **Mục tiêu:** Khắc phục LCD chỉ hiện initials dù có ảnh; dùng ảnh từ thư mục hiện tại, đúng MSSV, hiện đủ 3,5 giây sau khi vẽ.
- **Bằng chứng:** 123001058.jpg là JPEG baseline 600x581, 46.339 bytes, HTTP 200. Code cũ cho riêng connect/read nhiều giây nhưng màn hình hết hạn sau 3.500 ms; decoder/buffer dùng chung giữa worker và main. Chưa có Serial trace để kết luận lỗi nào xảy ra trên thiết bị.
- **Thiết kế:** Generator đọc file ảnh tên MSSV 9 chữ số trong images/faces, tạo JPEG baseline tối đa 100x100 trong PROGMEM. Tra ảnh theo MSSV và giải mã trên main; bỏ worker tải avatar. Không đổi ảnh gốc. Tên xuống dòng bằng textWidth trong vùng bên phải.
- **File:** esp32_kiosk/tools/generate_avatars.py, kiosk_avatars.h, esp32_kiosk.ino, qr_display.h, tài liệu.
- **Đánh đổi:** Ảnh là snapshot lúc tạo header; đổi/thêm ảnh phải chạy generator và nạp lại firmware. Dữ liệu JPEG thực tế 61.303 bytes cho 29 ảnh, bỏ buffer tải ảnh 64 KB RAM.
- **DoD:** Generator ánh xạ đúng MSSV; mọi JPEG trong header giải mã được và <=100x100; lookup thiếu ảnh dùng fallback; build ESP32 trong giới hạn flash/RAM; tên không tràn. LCD thật cần kiểm chứng sau nạp.
- **Kiểm thử:** Giải mã toàn bộ dữ liệu header bằng Pillow, đối chiếu nguồn; Arduino CLI build; không đánh dấu DONE khi chưa nghiệm thu board.
- **Đối chiếu độ trễ:** Kiểm tra debounce Face AI, thời điểm còi/RPC và HTTPS reuse; thêm log KIOSK TIMING tách thời gian RPC và vẽ. Không đổi polling 1000 ms, debounce/còi hay luồng nhận diện. RPC đồng bộ có thể kéo dài chu kỳ polling và thời gian trở lại QR; cần đo trên ESP trước khi kết luận độ trễ đầu-cuối.

### [TASK-025] Thử nghiệm giao diện Kiosk chia đôi (Camera bên trái qua /capture, QR bên phải 160px)

- **Ngày tạo:** 2026-10-28
- **Mức độ ưu tiên:** High
- **Mục tiêu:** 
  1. Tái cấu trúc layout Kiosk LCD 320x240 thành màn hình chia đôi:
     - Nửa bên trái (X: 0..159): Khung hiển thị Live Camera từ ESP32-CAM (lấy ảnh qua endpoint /capture cổng 80 với tần suất giới hạn 2–4 FPS để không làm nghẽn camera).
     - Nửa bên phải (X: 160..319): Mã QR động (rộng 160px) lấy token hợp lệ từ Supabase RPC get_open_session, giữ ô QR vuông vắn, đủ viền trắng (quiet zone) và dễ quét bằng camera điện thoại thật.
  2. **Bảo đảm an toàn luồng phần cứng (Single Display Rendering Task):** Tuyệt đối không cho 2 Core cùng gọi lệnh vẽ 	ft.* hoặc giải mã JPEG đồng thời để chống xung đột bus SPI. Chỉ có duy nhất một tác vụ vẽ màn hình.
  3. **Không làm gián đoạn Web Admin:** Giữ nguyên kết nối Web Admin nhận diện khuôn mặt qua :81/stream như hiện tại.
  4. **Trải nghiệm điểm danh:** Khi có lượt điểm danh thành công, hiển thị thông báo "ĐÃ ĐIỂM DANH: <Tên> - <MSSV>" đè lên khung camera hoặc dải banner thông báo trong 2–3 giây rồi quay lại live camera bình thường.
- **Phạm vi tác động:**
  - esp32_kiosk/qr_display.h (Thêm layout chia đôi: drawSplitLayout, drawSplitQRCode, drawSplitCameraFrame, drawSplitCheckinNotice).
  - esp32_kiosk/esp32_kiosk.ino (Task mạng nền kéo /capture cổng 80, loop vẽ LCD duy nhất, cấu hình IP ESP-CAM).
  - Tài liệu quản lý docs/AI_PLAN.md, docs/AI_PROGRESS.md, docs/AI_TEST_LOG.md.
- **Rủi ro kỹ thuật & Biện pháp kiểm soát:**
  - *Rủi ro 1: Tranh chấp bus SPI giữa các nhân:* Chỉ Main Loop được gọi 	ft.* và TJpgDec.*. Task mạng chỉ tải ảnh vào buffer và set flag.
  - *Rủi ro 2: Nghẽn camera ESP32-CAM:* Kiosk chỉ dùng HTTPClient gọi /capture cổng 80 với nhịp tối thiểu 250ms–400ms, không mở persistent /stream cổng 81.
  - *Rủi ro 3: QR 160px khó quét:* Thiết kế QR với integer scale chuẩn >= 3 (khung 111x111 px), bao quanh bởi viền trắng tối thiểu 10px, test quét thật bằng điện thoại.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Firmware esp32_kiosk biên dịch thành công 100% bằng rduino-cli không lỗi.
  - [ ] Thuật toán QR chia đôi tạo ra mã vuông vức, căn giữa vùng phải 160x240, có viền trắng chuẩn ISO/IEC 18004.
  - [ ] Tác vụ mạng tải /capture hoạt động độc lập, không block polling Supabase.
  - [ ] Điểm danh thành công hiển thị rõ ràng trên màn hình chia đôi và tự động trở lại live camera sau 2.5–3.0s.
  - [ ] Ghi nhận đầy đủ log kiểm thử vào AI_TEST_LOG.md.
- **Phương án kiểm thử:** Biên dịch bằng Arduino CLI, script Node kiểm tra tính toán hình học pixel của layout chia đôi, đối chiếu RAM/Flash.
### [TASK-026] Tối ưu hóa độ nhạy nhận diện khuôn mặt Face AI (FaceMatcher, TinyFaceDetector inputSize, MiniFASNet Liveness)

- **Ngày tạo:** 2026-10-29
- **Mức độ ưu tiên:** Critical
- **Mục tiêu:** 
  1. Khắc phục tình trạng camera AI khó bắt khuôn mặt hoặc bắt trượt khi đứng trước Kiosk.
  2. Nâng kích thước inputSize của TinyFaceDetector từ 224 lên 320 để phát hiện khuôn mặt từ cự ly xa hơn và các góc nghiêng tự nhiên.
  3. Điều chỉnh ngưỡng khoảng cách Euclidean FaceMatcher từ  .40 lên  .45 (mức an toàn chống nhận nhầm nhưng nhạy hơn gấp 3 lần với điều kiện ánh sáng thực tế).
  4. Chuẩn hóa ngưỡng chống giả mạo MiniFASNet isLive: pLive > pPrint && pLive > pReplay && pLive >= 0.50 (thay vì đòi hỏi >= 0.70 quá cao với ảnh stream nén JPEG).
- **Phạm vi tác động:** js/admin/admin.face.js.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] 
ode -c js/admin/admin.face.js biên dịch cú pháp thành công (Exit code 0).
  - [ ] Các thông số  .45, inputSize: 320, pLive >= 0.50 được áp dụng chuẩn xác.
  - [ ] Ghi nhận TLOG-026 và cập nhật AI_PROGRESS.md.
- **Phương án kiểm thử:** Kiểm tra cú pháp bằng Node.js và script mô phỏng FaceMatcher threshold.
### [TASK-027] Chuẩn hóa nhãn 'Xưởng' thành 'Chưa quét' trong các báo cáo xuất Excel điểm danh

- **Ngày tạo:** 2026-10-29
- **Mức độ ưu tiên:** High
- **Mục tiêu:** 
  1. Trong các file Excel xuất điểm danh (xuất theo phiên exportPastSessionExcel và xuất theo nhóm exportAttendanceByGroups), nếu cột Phân loại mang giá trị 'Xưởng' (giá trị mặc định trong database cho ca trực xưởng khi chưa có sự kiện quét), tự động chuẩn hóa hiển thị thành 'Chưa quét'.
  2. Giữ nguyên màu sắc tô dòng (dòng vắng không phép tô đỏ, có lịch học trường/lịch ngoài tô xanh, đi muộn tô vàng) và giữ nguyên nhãn 'Đi học' cho các trường hợp vắng có phép học trường.
- **Phạm vi tác động:** js/admin/admin.students.js, js/admin/admin.attendance.js, tài liệu quản lý.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] 
ode -c js/admin/admin.students.js và 
ode -c js/admin/admin.attendance.js exit 0.
  - [ ] Kiểm thử logic: category === 'Xưởng' trả về 'Chưa quét'; các category khác giữ nguyên.
  - [ ] Ghi nhận TLOG-027 và cập nhật AI_PROGRESS.md.
- **Phương án kiểm thử:** Script Node.js kiểm tra logic hàm export và kiểm tra syntax.

### [TASK-028] Mặc định đi muộn 30 phút, vẫn sửa được

- Ngày: 2026-10-29.
- Phạm vi: admin.html (ô nhập và nhãn ban đầu), js/admin/admin.tasks.js (fallback khi mở phiên); không sửa ngưỡng đã lưu của phiên cũ.
- DoD: ô number mặc định 30, không readonly/disabled; giá trị người dùng sửa được gửi nguyên vào p_warn_before_min; bỏ trống dùng 30.
- Kiểm thử: Node syntax và chạy hàm openSession thực tế với DOM/RPC stub cho mặc định, sửa tay, bỏ trống.

### [TASK-028] Siết chặt bộ so khớp Face AI: Hạ ngưỡng FaceMatcher về 0.40 và tăng xác thực đa khung hình chống nhận nhầm

- **Ngày tạo:** 2026-10-29
- **Mức độ ưu tiên:** Critical
- **Mục tiêu:** 
  1. Khắc phục triệt để hiện tượng nhận diện nhầm người khi nâng ngưỡng lên 0.45.
  2. Siết ngưỡng Euclidean khoảng cách của FaceMatcher từ  .45 trở lại  .40 (mức an toàn cao chống nhận nhầm danh tính).
  3. Tăng số khung hình xác thực liên tục REQUIRED_CONFIRM_FRAMES từ 2 lên 4 khung hình (~0.4s - 0.5s giữ mặt ổn định) để loại bỏ hoàn toàn các sai lệch chớp nhoáng (glitch) do góc nhìn hay bóng đổ.
- **Phạm vi tác động:** js/admin/admin.face.js.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] 
ode -c js/admin/admin.face.js exit 0.
  - [ ] Ngưỡng FaceMatcher đặt lại  .40.
  - [ ] REQUIRED_CONFIRM_FRAMES đặt là 4.
  - [ ] Ghi nhận TLOG-028 và cập nhật AI_PROGRESS.md.
- **Phương án kiểm thử:** Kiểm tra cú pháp và tham số qua Node.js.
### [TASK-029] Chuẩn hóa toàn diện nhãn Phân loại điểm danh khi xuất Excel: Admin tích, Quét mặt, Quét QR, Chưa quét, Lịch trường, Nghỉ phép

- **Ngày tạo:** 2026-10-29
- **Mức độ ưu tiên:** High
- **Mục tiêu:** 
  1. Thay thế nhãn cộc lốc 'Admin' bằng 'Admin tích' để thể hiện rõ Admin/Giảng viên điểm danh bù thủ công.
  2. Chuẩn hóa hình thức nhận diện khuôn mặt 'Khuôn mặt' thành 'Quét mặt'.
  3. Chuẩn hóa hình thức sinh viên tự quét mã QR trên điện thoại thành 'Quét QR'.
  4. Chuẩn hóa các trạng thái vắng: 'Xưởng' thành 'Chưa quét', 'Học trường' thành 'Lịch trường', 'Xin nghỉ' thành 'Nghỉ phép'.
  5. Áp dụng đồng bộ cho cả 2 hàm xuất Excel: exportPastSessionExcel (theo phiên) và exportAttendanceByGroups (theo nhóm).
  6. Bảo toàn việc tô màu dòng của SheetJS (pplyAttendanceExportRowFill).
- **Phạm vi tác động:** js/admin/admin.students.js, js/admin/admin.attendance.js.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] 
ode -c js/admin/admin.students.js và 
ode -c js/admin/admin.attendance.js exit 0.
  - [ ] Kiểm thử logic: Tất cả 6 trường hợp phân loại map đúng 100%.
  - [ ] Ghi nhận TLOG-029 và cập nhật AI_PROGRESS.md.
- **Phương án kiểm thử:** Script Node.js unit test và cú pháp.
### [TASK-030] Khắc phục triệt để đơ màn hình Kiosk khi quét liên tục: Tách biệt Live Camera và Banner thông báo

- **Ngày tạo:** 2026-10-30
- **Mức độ ưu tiên:** Critical
- **Mục tiêu:** 
  1. Khắc phục triệt để hiện tượng màn hình camera Kiosk bị đơ/đóng băng khi có nhiều người quét điểm danh liên tiếp.
  2. Bỏ hoàn toàn cơ chế tắt camera khi có thông báo: Luồng camera soi gương chạy xuyên suốt 100% thời gian ở tốc độ cao (~10 FPS), không bao giờ bị dừng.
  3. Tái cấu trúc khu vực thông báo: Khi có lượt điểm danh thành công, chỉ cập nhật dải thông tin bên dưới camera (Y: 145..239) trong 1.5 giây và chớp viền khung ngắm sang màu xanh lá; vùng camera (Y: 52..131) vẫn tiếp tục nhận và vẽ video liên tục.
  4. Hết 1.5 giây: Dải bên dưới tự động khôi phục hướng dẫn 'Nhìn vào cam / Canh giữa khuôn mặt' mà không gián đoạn video camera.
- **Phạm vi tác động:** esp32_kiosk/qr_display.h, esp32_kiosk/esp32_kiosk.ino.
- **Tiêu chí nghiệm thu (DoD):**
  - [ ] Firmware esp32_kiosk biên dịch thành công 100% bằng rduino-cli không lỗi (Exit code 0).
  - [ ] Camera worker và loop() loại bỏ hoàn toàn cờ chặn checkinFullscreenVisible.
  - [ ] Bộ nhớ RAM và Flash trong ngưỡng an toàn.
  - [ ] Ghi nhận TLOG-030 và cập nhật AI_PROGRESS.md.
- **Phương án kiểm thử:** Biên dịch bằng Arduino CLI thực tế.