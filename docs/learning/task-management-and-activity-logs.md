# Quản lý Nhiệm vụ & Ngăn trượt Lịch sử Hoạt động (Task Audit Logs)

## 1. What it does (Chức năng)

Hệ thống quản lý nhiệm vụ thống nhất cho đội Robocon với:
- Một thanh điều khiển duy nhất với bộ lọc phạm vi: **Tất cả**, **Nhiệm vụ nhóm**, **Nhiệm vụ cá nhân**.
- **Giao việc thông minh**: Khi bấm "+ Giao nhiệm vụ", modal tự động chọn phạm vi theo ngữ cảnh bộ lọc đang xem (Cá nhân -> tự chọn cá nhân & hiển thị ngay danh sách thành viên).
- **Lịch sử hoạt động dạng ngăn trượt (Slide-out Drawer)**: Trượt nhẹ mượt từ bên phải, hiển thị chi tiết ai đã thao tác, nội dung thay đổi (trước/sau), thời gian chính xác, người được giao và tên nhiệm vụ. Đóng mở linh hoạt bằng phím `Escape` hoặc nhấp nền ngoài mà không làm mất bộ lọc trang.
- **Xóa nhiệm vụ an toàn**: Có hộp thoại xác nhận tên nhiệm vụ trước khi xóa. Khi xóa, bản ghi lịch sử hoạt động vẫn được lưu trữ vĩnh viễn trên cơ sở dữ liệu (`ON DELETE SET NULL`) để phục vụ truy vết kiểm toán.

## 2. Where it lives (Vị trí mã nguồn)

- **Database / RPCs**:
  - `supabase/migrations/20261013090000_task_activity_logs_and_deletion.sql`: Định nghĩa bảng `public.team_task_activity_logs`, RLS policies và các RPCs tự động ghi log.
  - `supabase/schema.sql`: Snapshot schema chuẩn đồng bộ với remote.
- **Frontend**:
  - `admin.html`:
    - View 4 (`#view-tasks`): Giao diện thanh lọc hợp nhất (segmented pills), lưới nhiệm vụ.
    - Drawer (`#taskActivityDrawer`, `#taskDrawerBackdrop`): Ngăn trượt hiển thị timeline lịch sử.
    - Modal Xóa (`#taskDeleteConfirmModal`): Hộp thoại xác nhận xóa an toàn.
    - JS Controllers: `setTaskScopeFilter()`, `applyTaskFilters()`, `openCreateTaskModal()`, `openTaskActivityDrawer()`, `deleteAdminTask()`, `confirmExecuteDeleteTask()`.

## 3. How it works (Nguyên lý hoạt động)

1. **Ghi nhật ký trên Server (Server-side Audit Trail)**:
   - Thay vì để client gửi tên người thao tác (dễ bị giả mạo), danh tính được trích xuất trực tiếp trong hàm SQL thông qua `auth.uid()` và bảng `public.profiles` kết hợp `public.students`.
   - Các hành động ghi nhận: `created`, `status_changed`, `completed`, `deleted`, `updated`, `reassigned`, `claimed`, `released`.
2. **Bảo toàn dữ liệu khi xóa (Data Preservation)**:
   - Cột `task_id` trong `team_task_activity_logs` liên kết tới `team_tasks(id)` với ràng buộc `ON DELETE SET NULL`.
   - Trường `task_title` lưu bản chụp (snapshot) tiêu đề tại thời điểm thao tác. Nhờ đó, khi một nhiệm vụ bị xóa, toàn bộ lịch sử trước đó và hành động xóa vẫn tồn tại độc lập trong cơ sở dữ liệu.
3. **Ngăn trượt không đổi URL / State**:
   - Sử dụng CSS translate `translateX(100%)` sang `translateX(0)` kết hợp `backdrop-filter: blur(3px)`.
   - Thao tác đóng mở chỉ điều khiển CSS class mà không reload hay chuyển trang, giữ nguyên vị trí cuộn và các bộ lọc đang chọn của danh sách nhiệm vụ.

## 4. How to modify it (Hướng dẫn tùy biến)

- Thêm loại hành động mới: Bổ sung nhãn và icon trong object `actionMeta` của hàm `renderDrawerLogs()` trong [admin.html](file:///c:/Users/ACER/Documents/GitHub/DIEM_DANH/admin.html).
- Điều chỉnh kích thước ngăn trượt: Thay đổi thuộc tính `width` của class `.task-drawer` trong phần CSS của [admin.html](file:///c:/Users/ACER/Documents/GitHub/DIEM_DANH/admin.html).

## 5. Common mistakes (Lỗi thường gặp)

- **Tin tưởng tên người dùng do client gửi**: Nếu frontend tự gửi `actor_name` qua API, kẻ xấu có thể sửa mã JS để mạo danh người khác. Luôn luôn truy vấn danh tính từ `auth.uid()` trên backend/database.
- **Dùng `CASCADE` trên khóa ngoại lịch sử**: Nếu đặt `REFERENCES team_tasks(id) ON DELETE CASCADE`, khi xóa nhiệm vụ thì toàn bộ lịch sử biến mất, phá hủy mục tiêu kiểm toán truy vết. Bắt buộc dùng `ON DELETE SET NULL` và lưu sẵn snapshot tiêu đề nhiệm vụ.

## 6. Learn This (Khái niệm quan trọng)

- **Audit Log / Nhật ký kiểm toán**: Kỹ thuật ghi nhận bất biến (immutable logs) các thao tác hệ thống.
- **Foreign Key `ON DELETE SET NULL`**: Giữ lại dòng lịch sử khi bản ghi gốc bị xóa.
- **Slide-out Drawer Pattern**: Thành phần giao diện trượt từ cạnh màn hình giúp người dùng xem thông tin phụ mà không rời khỏi ngữ cảnh làm việc chính.
