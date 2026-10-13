# Quản lý Lịch Rảnh / Bận & Xuất Excel (Schedule Matrix)

## Chức năng (What it does)

Replaces the heavy, static Canvas image generator with an interactive Schedule Matrix Dashboard and Excel (`.xlsx`) exporter. Allows administrators to pick any date (with quick buttons for Today, Tomorrow, Day After), inspect member free/busy availability across 3 shifts (Morning, Afternoon, Evening), filter and search students, copy pre-formatted Zalo notifications, and export structured Excel worksheets.

## Where it lives

- `admin.html`:
  - UI: `<section id="view-zalo">` with Date Picker, KPI cards, Zalo bubble, and `#zaloMatrixTable`.
  - Logic: `initZaloScheduleView()`, `onZaloDateChanged()`, `loadZaloScheduleMatrix()`, `filterZaloMatrix()`, `exportZaloScheduleExcel()`, `syncAndRefreshZaloSchedule()`.
  - Dependencies: SheetJS (`xlsx.full.min.js`) via jsdelivr CDN with UTF-8 CSV fallback.

## How it works

1. **Date Selection**:
   - Uses `getVietnamDateKey(offsetDays)` for Vietnam timezone (UTC+7).
   - Date picker updates `window.zaloSelectedDate`.
2. **Matrix Generation**:
   - Fetches active students from `public.students` and schedule records from `public.student_schedules` within the 24-hour range.
   - Evaluates availability against 3 shifts:
     - Morning (07:30–11:25)
     - Afternoon (12:50–16:45)
     - Evening (17:30–20:50)
   - Categorizes as Free (`🟢 Rảnh`) or Busy (`🔴 Bận`) with subject name, room, and time.
3. **Zalo Notification Preview**:
   - Generates compact, formatted message text reflecting selected date totals:
     ```text
     📅 LỊCH TOÀN BỘ SINH VIÊN NGÀY [Thứ ..., DD/MM/YYYY]
     • SÁNG (07:30–11:25): X rảnh, Y bận
     • CHIỀU (12:50–16:45): X rảnh, Y bận
     • TỐI (17:30–20:50): X rảnh, Y bận

     👉 Chi tiết danh sách rảnh/bận theo từng ca xem trong file Excel đính kèm.
     ```
4. **Excel Export (`exportZaloScheduleExcel`)**:
   - Builds an Array-of-Arrays (AOA) with header metadata, column headers, student rows with shift details, and footer summary counts.
   - Sets column widths and generates `Lich_Ranh_Ban_YYYY-MM-DD.xlsx`.

## Common mistake

Hardcoding schedule queries to "tomorrow" only (`offsetDays = 1`). In production, workshop leaders need to inspect past attendance context or plan shifts for weekends and upcoming weeks.
