# Project: Đánh giá hiệu suất thành viên (LH-NaviX)

## Architecture
- **Frontend Architecture**: Vanilla JS, HTML5, CSS thuần, Light SaaS Design System (`css/theme.css`, `css/admin.css`). SPA view routing via `js/admin/admin.core.js` (`viewTitlesMap`, `navTo`). Dedicated logic module `js/admin/admin.performance.js` managing view rendering, event listeners, and API calls.
- **Backend Architecture**: Supabase (PostgreSQL 17), Row Level Security (RLS), Stored Procedures / RPC (`save_captain_adjustment`), client accessed via `window.supabase`.
- **Data Flow**:
  1. User navigates to "Đánh giá hiệu suất" -> `navTo('performance')` loads view.
  2. Filter inputs (`perfFromDate`, `perfToDate`) query sessions & attendance records within the selected date range.
  3. Calculation engine aggregates sessions, counts attendances, detects school conflicts (`category = 'Học trường'` or notes), calculates linear late deductions, clamps attendance score to [0, 100].
  4. Captain adjustments loaded from `public.member_performance_evaluations` (with localStorage fallback).
  5. Final score = clamped [0, 100] of (attendance score + captain adjustment).
  6. 5-tier classification computed and rendered with color-coded badges and KPI cards.
  7. When captain adjusts score, calls RPC `save_captain_adjustment`, persists to database, updates UI instantly.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Menu Navigation Item | Thêm mục "Đánh giá hiệu suất" vào sidebar menu và router admin | M3 | R1 |
| F2 | Giao diện Dashboard Hiệu suất | Layout bảng thành viên, thẻ KPI tổng kết, modal chấm điểm | M3 | R1 |
| F3 | Thống kê Điểm danh | Tổng hợp có mặt, vắng có phép, vắng không phép, phút đi muộn | M2 | R1 |
| F4 | Đồng bộ Bộ lọc Thời gian | Bộ lọc khoảng ngày đồng bộ theo kiến trúc của ứng dụng hiện tại | M3 | R1 |
| F5 | Trạng thái Thành viên mới | Thành viên chưa có dữ liệu điểm danh giữ điểm 100 + nhãn "Chưa có dữ liệu" | M2 | R1, R2 |
| F6 | Điểm gốc & Điểm Có mặt | Thang điểm gốc 100, có mặt không bị trừ điểm | M2 | R2 |
| F7 | Vắng có phép & Trùng lịch | Trùng lịch học ME (Học trường/Lịch thi/note) trừ 0đ; vắng có phép khác trừ 2đ/buổi | M2 | R2 |
| F8 | Vắng không phép | Trừ 10 điểm/buổi vắng không phép | M2 | R2 |
| F9 | Đi muộn Tuyến tính & Giới hạn | Tuyến tính 10p (-1đ) đến 100p (-20đ), >100p phạt tối đa 20đ, không chuyển thành vắng | M2 | R2 |
| F10 | Giới hạn Điểm chuyên cần | Điểm chuyên cần tự động kẹp trong khoảng [0, 100] | M2 | R2 |
| F11 | Giao diện Đội trưởng chấm điểm | Input/modal cho phép đội trưởng nhập điểm điều chỉnh cộng hoặc trừ | M3 | R3 |
| F12 | Tổng điểm cuối cùng & Kẹp biên | Tổng điểm = Điểm chuyên cần + Điểm điều chỉnh, kẹp nghiêm ngặt trong [0, 100] | M2 | R3 |
| F13 | Lưu trữ Supabase & Tức thời | Bảng `member_performance_evaluations`, migration, RPC, RLS, lưu và cập nhật tức thời | M1 | R3 |
| F14 | Xếp loại 5 bậc | Phân loại tự động: Xuất sắc (100), Giỏi (80-99), Khá (70-79), Cần xem lại (50-69), Nguy cơ cao (<50) | M2 | R4 |
| F15 | Kiểm thử Độc lập Toàn diện | Bộ kiểm thử tự động độc lập xác minh toàn bộ các ca tính toán, biên và luồng | M4, E2E Track | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Schema & Migration | Migration SQL cho bảng `member_performance_evaluations`, RPC `save_captain_adjustment`, RLS policies | none | DONE |
| M2 | Performance Calculation Core Engine | Module tính điểm chuyên cần, xử lý ngoại lệ trùng lịch học, tuyến tính đi muộn, kẹp biên [0, 100], xếp loại 5 bậc | none | DONE |
| M3 | Frontend UI & Menu Integration | Thêm menu sidebar, view HTML, routing `admin.core.js`, module `admin.performance.js`, đồng bộ bộ lọc ngày, UI chấm điểm | M1, M2 | DONE |
| M4 | Final Milestone (E2E Pass & Hardening) | Vượt qua 100% test E2E (Tiers 1-4) từ E2E Testing Track và Adversarial Coverage Hardening (Tier 5) | M3 | DONE |

## Interface Contracts

### M1 ↔ M3: Database RPC & Schema Contract
- Table: `public.member_performance_evaluations`
  - `id uuid default gen_random_uuid() primary key`
  - `mssv text not null references public.students(mssv) on delete cascade`
  - `period_key text not null default 'default'`
  - `period_from date`
  - `period_to date`
  - `captain_adjustment numeric not null default 0`
  - `notes text default ''`
  - `adjusted_by text default 'Đội trưởng'`
  - `updated_at timestamptz default now()`
  - Constraint: `UNIQUE (mssv, period_key)`
- RPC: `public.save_captain_adjustment(p_mssv text, p_period_key text, p_adjustment numeric, p_notes text, p_period_from date, p_period_to date)`
  - Returns: `jsonb` (status: 'ok', data: updated record)
  - Security: `SECURITY DEFINER`, accessible by authenticated admin / team leader.

### M2 ↔ M3: Performance Calculation Engine Contract
- Functions exported by `PerformanceEngine` (available in `js/admin/admin.performance.js` or helper):
  - `calculateLateDeduction(lateMinutes: number): number`
    - Returns deduction >= 0 (e.g. 10 -> 1, 55 -> 10.5, 100 -> 20, >100 -> 20).
  - `isSchoolScheduleConflict(record: { category?: string, note?: string }): boolean`
    - Checks `category === 'Học trường'` or regex for `lịch học|lịch thi|trùng lịch`.
  - `calculateAttendanceScore(records: Array<AttendanceRecord>): { attendanceScore: number, presentCount: number, excusedCount: number, excusedSchoolCount: number, excusedOtherCount: number, unexcusedCount: number, lateCount: number, totalLateMinutes: number, hasData: boolean }`
    - Returns object with stats and clamped attendanceScore [0, 100]. If `records.length === 0`, `attendanceScore = 100`, `hasData = false`.
  - `calculateFinalScore(attendanceScore: number, captainAdjustment: number): number`
    - Returns `Math.max(0, Math.min(100, Math.round((attendanceScore + captainAdjustment) * 10) / 10))`
  - `getPerformanceTier(finalScore: number): { tier: string, label: string, color: string, badgeClass: string }`
    - 100 -> 'Xuất sắc'
    - [80, 99.99] -> 'Giỏi'
    - [70, 79.99] -> 'Khá'
    - [50, 69.99] -> 'Cần xem lại'
    - < 50 -> 'Nguy cơ cao'

## Code Layout
- `supabase/migrations/20261105120000_member_performance_evaluations.sql`: DB migration for adjustments and RPC.
- `admin.html`: Menu item `#nav-performance`, section `#view-performance`, script tag for `admin.performance.js`.
- `js/admin/admin.core.js`: Routing `viewTitlesMap` and `navTo('performance')`.
- `js/admin/admin.performance.js`: Performance calculation engine, UI rendering, event handling, Supabase sync.
- `docs/FROZEN_FEATURES.md`: Protected frozen features (NEVER MODIFY).
