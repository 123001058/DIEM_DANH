# DANH MỤC TÍNH NĂNG ĐÓNG BĂNG (FROZEN_FEATURES.MD)

> **QUY TẮC BẤT DI BẤT DỊCH DÀNH CHO AI AGENT:**
> 1. Mọi tính năng, module, hoặc đoạn mã được liệt kê trong tài liệu này **ĐÃ ĐƯỢC NGƯỜI DÙNG KIỂM CHỨNG CHẠY TỐT THỰC TẾ**.
> 2. **NGHIÊM CẤM TỰ Ý SỬA ĐỔI, TỐI ƯU HÓA HOẶC VIẾT LẠI (NO SPECULATIVE REFACTORING / FIX)**: Tuyệt đối không được can thiệp vào logic, thời gian delay, cách thức hiển thị hoặc cấu trúc payload của các tính năng đã đóng băng này, trừ khi người dùng ra lệnh rõ ràng bằng văn bản.
> 3. Khi người dùng thông báo *"tính năng này chạy rồi, giữ lại"*, Agent phải lập tức bổ sung tính năng đó vào bảng này kèm mã commit tham chiếu.
> 4. Chỉ đóng băng **luồng cốt lõi đã được kiểm chứng chạy tốt**. Ghi rõ phạm vi hành vi cần giữ, file liên quan và bằng chứng; không đánh dấu cả file hoặc module là bất khả xâm phạm nếu chỉ một luồng trong đó đã được kiểm chứng.

---

## 1. BẢNG THEO DÕI TÍNH NĂNG ĐÃ ĐÓNG BĂNG (FROZEN LIST)

| Mã Tính Năng | Tên Tính Năng | File Mã Nguồn Khóa | Trạng Thái | Mô Tả & Lưu Ý Cấm Chạm |
|---|---|---|---|---|
| **FRZ-001** | Hiển thị mã QR động Kiosk song song thông báo | `esp32_kiosk/esp32_kiosk.ino`, `esp32_kiosk/qr_display.h` | 🔒 **LOCKED** | Phân vùng LCD 320x240: QR cột trái (0..214), thông báo cột phải (214..320). Không dùng `fillScreen` tráo đổi. Giữ nguyên chu kỳ polling 1000ms và URL rút gọn `checkin.html?t=`. |
| **FRZ-003** | Reset mật khẩu sinh viên Admin | `supabase/functions/admin-reset-password/index.ts`, `js/admin/admin.tasks.js` | 🔒 **LOCKED** | Cho phép Admin reset mật khẩu cho toàn bộ sinh viên (kể cả MSSV trong danh sách quản trị). Không thêm lại cột thừa `is_admin` vào bảng `profiles`. |
| **FRZ-004** | Chuẩn hóa Còi Buzzer Active LOW chân GPIO 14 | `esp32_cam_ai/board_config.h`, `esp32_cam_ai/app_httpd.cpp` | 🔒 **LOCKED** | Còi kích mức LOW (`BUZZER_ON = LOW`, `BUZZER_OFF = HIGH`). Không kéo chân 14 về LOW lúc khởi động. |
| **FRZ-005** | Chống kêu còi liên hồi (Debounce) & Nút Mute Loa/Còi | `js/admin/admin.face.js`, `admin.html` | 🔒 **LOCKED** | Giới hạn tối thiểu 4000ms giữa 2 lần phát âm thanh. Nút Bật/Tắt âm thanh điều khiển còi ESP32 qua chân 14. |

---

## 2. QUY CHUẨN XỬ LÝ KHI NGHI NGỜ BUG Ở TÍNH NĂNG ĐÃ ĐÓNG BĂNG
- Nếu có vấn đề mới phát sinh (ví dụ bổ sung thêm tính năng quét mặt song song với quét QR):
  - **Giữ nguyên 100% luồng cũ đang chạy** của tính năng đã đóng băng.
  - Trước khi sửa, xác định luồng cũ bắt đầu/kết thúc ở đâu, dữ liệu vào/ra nào dùng chung với yêu cầu mới và phần nhỏ nhất thực sự cần thay đổi. Code mới có liên quan đến code cũ không phải lý do để chỉnh sửa lan sang các luồng khác.
  - Ưu tiên mở rộng tương thích (non-breaking extension) tại ranh giới nhỏ nhất. Không đổi hành vi, tham số nhạy cảm (ví dụ timing, delay polling, định dạng dữ liệu, payload, giao thức thiết bị) hoặc cấu trúc cũ nếu không thật sự cần cho yêu cầu.
  - Nếu bắt buộc phải sửa phần đã đóng băng, nêu rõ nguyên nhân gốc rễ, phạm vi ảnh hưởng và cách giữ tương thích trong kế hoạch trước khi sửa; không tự ý viết lại hay dọn dẹp thêm code ngoài phạm vi.
  - Kiểm thử hồi quy luồng cũ và kiểm thử yêu cầu mới sau khi sửa. Nếu chưa thể kiểm chứng thực tế, ghi rõ giới hạn và không tuyên bố tính năng đã được xác nhận chạy tốt.

## 3. QUY TẮC CHỌN LUỒNG CỐT LÕI ĐỂ ĐÓNG BĂNG
- Chọn đúng hành vi người dùng đã xác nhận chạy tốt, thay vì suy ra rằng toàn bộ module hoặc mọi code gần kề đều ổn định.
- Ghi mỗi luồng thành mục riêng: hành vi được bảo vệ, file/ranh giới liên quan, các chi tiết không được đổi và bằng chứng xác minh (TLOG hoặc commit nếu có).
- Không tự thêm vào danh sách những tính năng chỉ mới biên dịch, mới kiểm tra tĩnh, đang `[VERIFYING]`, hoặc còn chờ thử trên thiết bị thật. Ghi chúng là chưa xác minh cho đến khi có bằng chứng phù hợp.
- Khi hai tài liệu hoặc bằng chứng mâu thuẫn nhau, không tự chọn một phiên bản làm chuẩn đóng băng; chỉ ra mâu thuẫn trong kế hoạch và xác minh với code/log hiện tại trước khi chỉnh mục đó.
