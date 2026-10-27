# DANH MỤC TÍNH NĂNG ĐÓNG BĂNG (FROZEN_FEATURES.MD)

> **QUY TẮC BẤT DI BẤT DỊCH DÀNH CHO AI AGENT:**
> 1. Mọi tính năng, module, hoặc đoạn mã được liệt kê trong tài liệu này **ĐÃ ĐƯỢC NGƯỜI DÙNG KIỂM CHỨNG CHẠY TỐT THỰC TẾ**.
> 2. **NGHIÊM CẤM TỰ Ý SỬA ĐỔI, TỐI ƯU HÓA HOẶC VIẾT LẠI (NO SPECULATIVE REFACTORING / FIX)**: Tuyệt đối không được can thiệp vào logic, thời gian delay, cách thức hiển thị hoặc cấu trúc payload của các tính năng đã đóng băng này, trừ khi người dùng ra lệnh rõ ràng bằng văn bản.
> 3. Khi người dùng thông báo *"tính năng này chạy rồi, giữ lại"*, Agent phải lập tức bổ sung tính năng đó vào bảng này kèm mã commit tham chiếu.

---

## 1. BẢNG THEO DÕI TÍNH NĂNG ĐÃ ĐÓNG BĂNG (FROZEN LIST)

| Mã Tính Năng | Tên Tính Năng | File Mã Nguồn Khóa | Trạng Thái | Mô Tả & Lưu Ý Cấm Chạm |
|---|---|---|---|---|
| **FRZ-001** | Hiển thị mã QR động Kiosk | `esp32_kiosk/esp32_kiosk.ino`, `esp32_kiosk/qr_display.h` | 🔒 **LOCKED** | Quét QR qua HTTPS Supabase với chu kỳ `delay(1000)`. Giữ nguyên URL rút gọn `checkin.html?t=`. |
| **FRZ-002** | Hiển thị tên sinh viên sau khi quét QR trên LCD Kiosk | `esp32_kiosk/esp32_kiosk.ino`, `esp32_kiosk/qr_display.h` | 🔒 **LOCKED** | Khi có sinh viên quét QR thành công, màn hình LCD Kiosk chuyển sang nền trắng chữ đen hiển thị: `DA DIEM DANH: <TÊN SINH VIÊN>`, giữ trong 3 giây rồi quay lại QR. Chuẩn hóa tiếng Việt không dấu bằng `nameForTft()`. Không tự ý giảm delay polling làm nghẽn socket HTTPS. |
| **FRZ-003** | Reset mật khẩu sinh viên Admin | `supabase/functions/admin-reset-password/index.ts`, `js/admin/admin.tasks.js` | 🔒 **LOCKED** | Cho phép Admin reset mật khẩu cho toàn bộ sinh viên (kể cả MSSV trong danh sách quản trị). Không thêm lại cột thừa `is_admin` vào bảng `profiles`. |
| **FRZ-004** | Chuẩn hóa Còi Buzzer Active LOW chân GPIO 14 | `esp32_cam_ai/board_config.h`, `esp32_cam_ai/app_httpd.cpp` | 🔒 **LOCKED** | Còi kích mức LOW (`BUZZER_ON = LOW`, `BUZZER_OFF = HIGH`). Không kéo chân 14 về LOW lúc khởi động. |
| **FRZ-005** | Chống kêu còi liên hồi (Debounce) & Nút Mute Loa/Còi | `js/admin/admin.face.js`, `admin.html` | 🔒 **LOCKED** | Giới hạn tối thiểu 4000ms giữa 2 lần phát âm thanh. Nút Bật/Tắt âm thanh điều khiển còi ESP32 qua chân 14. |

---

## 2. QUY CHUẨN XỬ LÝ KHI NGHI NGỜ BUG Ở TÍNH NĂNG ĐÃ ĐÓNG BĂNG
- Nếu có vấn đề mới phát sinh (ví dụ bổ sung thêm tính năng quét mặt song song với quét QR):
  - **Giữ nguyên 100% luồng cũ đang chạy** của tính năng đã đóng băng.
  - Chỉ thêm luồng xử lý mới (non-breaking extension), không sửa đè hay can thiệp vào các tham số nhạy cảm (như timing delay, kiểu dữ liệu truyền nhận).
  - Phải test đối chiếu lại tính năng cũ ngay sau khi thêm để đảm bảo không bị regression (vừa sửa xong làm hỏng cái cũ).
