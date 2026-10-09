# 🤖 HƯỚNG DẪN TỰ ĐỘNG GỬI LỊCH ZALO QUA GITHUB ACTIONS

Hệ thống này sẽ tự động chạy trên máy chủ GitHub vào **20:00 (8h tối) mỗi ngày** theo giờ Việt Nam. **Bạn không cần mở máy tính hay làm bất cứ điều gì**, hệ thống sẽ tự động quét lịch học ngày mai trên Supabase và gửi tin nhắn vào nhóm Zalo xưởng Robocon.

---

## 📌 BƯỚC 1: ĐĂNG NHẬP ZALO LẤY TOKEN (CHỈ LÀM 1 LẦN DUY NHẤT)

1. Mở thư mục `zalo_automation` trong máy bạn.
2. Click đúp chuột vào file **`dang_nhap_zalo.bat`** (hoặc mở terminal gõ: `node zalo_automation/login.js`).
3. Màn hình sẽ hiện ra **1 mã QR** → Bạn mở ứng dụng Zalo trên điện thoại quét để đăng nhập.
4. Đăng nhập thành công, màn hình sẽ in ra một đoạn mã JSON phiên đăng nhập và tự lưu vào file `zalo_session.json`.

---

## 📌 BƯỚC 2: DÁN TOKEN VÀO GITHUB SECRETS

1. Mở trang Repository GitHub dự án của bạn trên trình duyệt.
2. Vào mục **Settings** -> **Secrets and variables** -> **Actions**.
3. Bấm **"New repository secret"**, tạo 2 Secret sau:
   - **Tên Secret 1:** `ZALO_CREDENTIALS`  
     *Giá trị:* Copy toàn bộ nội dung trong file `zalo_automation/zalo_session.json` dán vào.
   - **Tên Secret 2 (Tùy chọn):** `ZALO_GROUP_ID`  
     *Giá trị:* ID của nhóm chat Zalo xưởng Robocon (Nếu để trống, bot sẽ tự động tìm nhóm có tên chứa chữ `Robocon` hoặc `C503` để gửi).

---

## 📌 BƯỚC 3: XONG & TEST THỬ NGAY LẬP TỨC!

- **Tự động:** Đúng **20:00 mỗi tối**, GitHub Actions sẽ tự động chạy và gửi tin.
- **Nếu muốn bấm gửi thử ngay:**
  1. Vào tab **Actions** trên GitHub.
  2. Chọn workflow **"Tự động gửi lịch Zalo xưởng Robocon 20:00"**.
  3. Bấm **"Run workflow"** -> Bot sẽ chạy gửi tin nhắn test ngay lập tức!
