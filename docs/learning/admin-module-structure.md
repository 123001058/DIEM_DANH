# Cấu trúc module trang Admin (admin.html)

## Vì sao (Why)

Trước đây `admin.html` là **một file ~569KB / 11.330 dòng** chứa cả HTML + CSS + JS của 11 màn hình. File càng lớn càng chậm tải, mỗi sửa nhỏ phải tải lại toàn bộ, dễ hỏng cả trang vì một lỗi cú pháp, và rất khó bảo trì. Đã tách thành các file riêng để giảm "phình to".

## Cấu trúc hiện tại (What)

```
admin.html                 (~1.820 dòng, chỉ còn HTML/markup)
css/admin.css              (toàn bộ style của trang admin)
js/admin/admin.core.js     Điều hướng view, sidebar, tiện ích dùng chung, toast
js/admin/admin.leave.js    Đơn xin nghỉ
js/admin/admin.schedules.js Lịch Zalo & nội quy Robocon
js/admin/admin.tasks.js    Workspace công việc & nhật ký hoạt động
js/admin/admin.students.js Quản lý sinh viên, nhóm, lịch ME, điểm danh, phiên, mật khẩu
js/admin/admin.attendance.js Thành viên nhóm cho điểm danh & xuất Excel theo nhóm
js/admin/admin.face.js     Camera điểm danh khuôn mặt ESP32 & huấn luyện 5 góc
```

## Quy tắc quan trọng (Critical rule)

Các file JS được nạp dưới dạng **script thường (không phải ES module)** và **PHẢI nạp theo đúng thứ tự** đã ghi trong `admin.html`:

```html
<script src="js/admin/admin.core.js?v=1"></script>
<script src="js/admin/admin.leave.js?v=1"></script>
... (đúng thứ tự) ...
<script src="js/admin/admin.face.js?v=1"></script>
```

Lý do: các hàm được khai báo ở phạm vi toàn cục và gọi lẫn nhau. Khi tách file, JavaScript **không còn hoisting xuyên file** như khi còn một script duy nhất. Hiện tại đã kiểm tra: **không có lệnh top-level nào gọi hàm khai báo ở file sau**, nên an toàn. Nếu sau này thêm code, hãy giữ nguyên nguyên tắc: không gọi hàm của file sau ngay ở top-level.

## Cách mở rộng an toàn (How to extend)

- Thêm màn hình mới: tạo `js/admin/admin.<feature>.js` và nạp **sau cùng** (hoặc đúng vị trí phụ thuộc), thêm tag `<script>` tương ứng trong `admin.html`.
- Tăng `?v=` khi sửa để phá cache.
- Muốn chuyển sang ES module (`type="module"` + `export/import`) thì cần đổi cả 7 file cùng lúc — làm thành một việc riêng, có kiểm thử.
- Kiểm tra cú pháp nhanh: `node --check js/admin/admin.<file>.js`.

## Lỗi thường gặp (Common mistakes)

- **Đổi thứ tự tag `<script>`**: làm hàm gọi nhau bị `undefined` ở thời điểm chạy — lỗi khó tìm. Giữ đúng thứ tự.
- **Tạo file mới nhưng quên thêm tag `<script>`**: triệu chứng `... is not defined` khi bấm nút.
- **Chỉ sửa `js/admin/*.js` mà quên tăng `?v=`**: trình duyệt dùng bản cache cũ.
- **Đặt code vào `admin.html` trở lại**: lại bắt đầu phình to — hãy đặt vào module tương ứng.
