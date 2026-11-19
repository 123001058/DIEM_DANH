# Tự cập nhật IP ESP32-CAM

CAM có mã `lh-navix-cam`. Sau khi Wi-Fi và đồng hồ SNTP sẵn sàng, bo báo IP riêng lên Supabase qua HTTPS có kiểm chứng CA. Bo gửi lại khi địa chỉ đổi/kết nối lại và mỗi 60 giây; lỗi mạng thử lại sau 10 giây. Task báo địa chỉ chạy riêng với camera.

Web Admin đọc `get_camera_endpoint` trước khi mở camera và mỗi 5 giây khi đang xem. IP mới thay kết nối MJPEG/fallback, không khởi động lại nhận diện hoặc phát còi. Nhập vào ô IP để tạm dùng địa chỉ thủ công; xóa trống rồi rời ô để trở lại tìm tự động. Khi tải lại trang, chế độ tự động được bật lại. Cloud lỗi hoặc chưa có heartbeat thì giữ IP đã lưu.

LCD nhận trường `camera` thêm vào phản hồi `get_open_session`. Camera worker đóng socket cũ và xây lại URL cổng 82/80 khi địa chỉ thay đổi. Các trường phiên, QR, last_checkin và khoảng nghỉ polling 1000ms được giữ nguyên. LCD chỉ tải ảnh khi có phiên mở.

## Cài đặt

1. Áp dụng `supabase/migrations/20261119090000_camera_endpoint_discovery.sql` trên đúng project. Nếu đã áp dụng qua SQL trực tiếp, ghi nhận phiên bản tương ứng trong migration history trước khi dùng `db push`; không chạy lại migration tạo bảng này.
2. Đăng nhập/liên kết Supabase CLI với project, chạy `python scripts/provision_camera.py`. Script tạo `esp32_cam_ai/camera_registry_secret.h` ngoài Git, chỉ lưu SHA-256 token vào database. Chạy lại dùng cùng token; từ chối thay token đang có bằng token khác.
3. Biên dịch và nạp CAM với ESP32S3 Dev Module, OPI PSRAM, Flash16MB, USB CDC bật. File secret phải có mặt khi biên dịch. Nếu thiếu, CAM vẫn phát ảnh nhưng Serial báo chưa provision và không báo IP.
4. Biên dịch/nạp Kiosk ESP32 thường. Đưa `admin.html` và `js/admin/admin.face.js` mới lên nơi đang chạy Web, tải lại trang.
5. Giữ bản sao an toàn của secret header để nạp lại cùng bo. Không đưa token vào Web, Git, log hoặc gửi cho người khác. Thay token cần cập nhật hash trong DB bằng quyền quản trị và nạp CAM tương ứng.

## Kiểm chứng

- Serial CAM: `[CAM IP] Da cap nhat ...`; Web RPC trả `device_id`, `ip`, `updated_at`, không có token/hash.
- Đổi IP DHCP hoặc kết nối lại CAM, mở phiên và xác nhận ô IP Web cùng `[CAM IP] LCD ket noi ...` chuyển đúng địa chỉ; ảnh mới ở cả hai nơi.
- Nếu một request cập nhật đang thất bại, thử lại giới hạn 10 giây; Web thường phát hiện trong 5 giây sau lần báo thành công. LCD nhận ở lần polling tiếp theo, chịu thời gian request và timeout socket hiện hữu.
- Dừng camera trên Web phải dừng polling tìm IP và không tự mở lại camera. Thử nhập IP thủ công, xóa trống để quay lại tự động.
- RPC đọc trả null nếu heartbeat cũ hơn 180 giây. Người gọi không được đọc/ghi bảng trực tiếp; token sai không báo IP được.

`node tests/test_camera_discovery.test.js` kiểm tra logic Web với RPC/DOM/timer giả. `supabase db query --linked -f tests/test_camera_registry.sql` chạy kiểm quyền và các tình huống registry trên DB thật, sau đó rollback toàn bộ fixture. `python tests/test_cam_idle_standby.py` kiểm hồi quy logic nguồn bằng C++ production, không thay thế kiểm thử bo.

## Giới hạn

IP tự cập nhật cần CAM truy cập Supabase và SNTP; thời gian chưa đồng bộ thì chưa gửi HTTPS. Sau khi mất Internet, địa chỉ cuối vẫn dùng được nếu mạng LAN không đổi. CA gốc trong `camera_registry_ca.h` lấy từ chuỗi TLS đã kiểm chứng của host Supabase; khi nhà cung cấp đổi CA cần cập nhật và nạp firmware.

Máy mở Web và LCD vẫn cần truy cập được mạng LAN của CAM. Cơ chế này không truyền video qua Supabase, không nối hai mạng tách biệt và không bỏ chặn HTTP của trang HTTPS. Lỗi `I2C timeout`/`UNAVAILABLE` là vấn đề cảm biến cần chẩn đoán riêng.
