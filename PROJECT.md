# Project: LH-NaviX Comprehensive Verification & Supabase Audit

## Architecture
- **Frontend Subsystems**:
  - **Admin Subsystem (`admin.html`)**: SPA architecture with 10 view sections, 16 modals, modularized into 7 JS files (`js/admin/admin.core.js`, `admin.leave.js`, `admin.schedules.js`, `admin.tasks.js`, `admin.students.js`, `admin.attendance.js`, `admin.face.js`).
  - **Student Subsystem (`checkin.html`, `index.html`, `change-password.html`, `face-sinhvien.html`, `lichhoc.html`)**: SPA portal with 6 views, QR scanner, Face-API 5-angle descriptor capture, ME schedule grid/list with external schedule support.
  - **Shared Client Libraries (`js/config.js`, `js/auth.js`, `js/lichhoc.js`)**: Supabase Client initialization, Auth state, HTML sanitization.
- **Backend Architecture (Supabase / PostgreSQL 17)**:
  - 28 relational tables (`public.*`) with 100% Row Level Security (RLS enabled).
  - 74 Stored Procedures / RPCs with `SECURITY DEFINER` and hardened `search_path`.
  - 2 Supabase Storage Buckets (`avatars` [public], `leave-evidence` [private]).
  - 8 automated business triggers (leave sync, schedule reconciliation, task assignment, audit logging).
  - 1 Supabase Edge Function (`admin-reset-password`).
  - Supabase Realtime channel publications (`attendance`, `sessions`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Admin Overview View | System summary, active session indicator, group tasks progress | M1 | Survey (Explorer 1) |
| 2 | Admin Attendance View | Session dashboard, dynamic QR token, manual status override, Excel export | M1 | Survey (Explorer 1) |
| 3 | Admin Face Cam View | ESP32-Cam/Webcam stream, MiniFASNet liveness detection, Face-API recognition | M1 | Survey (Explorer 1) |
| 4 | Admin Students View | Student roster, ME schedule sync, semester dates, Robocon teams, student deletion cascade | M1 | Survey (Explorer 1) |
| 5 | Admin Tasks View | Workshop, team, and personal task management, activity log drawer | M1 | Survey (Explorer 1) |
| 6 | Admin Leave View | Leave request list, weekly matrix, approval/rejection, two-way chat with evidence modal | M1 | Survey (Explorer 1) |
| 7 | Admin Schedules & Rules View | Embedded ME schedule iframe, Robocon workshop rules CRUD | M1 | Survey (Explorer 1) |
| 8 | Admin Feedback View | Anonymous student suggestion/bug mailbox, status update | M1 | Survey (Explorer 1) |
| 9 | Admin Password Reset View | Pending student password reset queue, Edge Function trigger, temp password modal | M1 | Survey (Explorer 1) |
| 10 | Admin Zalo Schedule Matrix | Free/busy matrix calculation across morning/afternoon/evening, Zalo caption copy | M1 | Survey (Explorer 1) |
| 11 | Admin Bug Fix: Reopen Session | Fix missing `confirmReopenSession()` in `admin.html:355` by routing to `quickReopenSession()` | M1 | Survey (Explorer 1) |
| 12 | Admin Bug Fix: Shadowing Function | Fix duplicate `focusAddStudentMssv()` in `admin.students.js:206,721` to correctly toggle card and focus | M1 | Survey (Explorer 1) |
| 13 | Student Auth & Password Reset | Login via MSSV/email, password change, `request_password_reset` RPC | M2 | Survey (Explorer 2) |
| 14 | Student Check-in View | Dynamic QR scanning, field selection, countdown, WakeLock, `submit_attendance` RPC | M2 | Survey (Explorer 2) |
| 15 | Student Attendance History View | Recent 30 check-in logs via `get_my_attendance_history` RPC | M2 | Survey (Explorer 2) |
| 16 | Student Leave Request View | Date/period leave form, schedule conflict detection, file upload to `leave-evidence`, 2-way chat | M2 | Survey (Explorer 2) |
| 17 | Student Task Management View | Assigned team/personal/global tasks, status updates, claiming global tasks | M2 | Survey (Explorer 2) |
| 18 | Student Rules View | Read workshop rules from `public.workshop_rules` | M2 | Survey (Explorer 2) |
| 19 | Student Anonymous Feedback View | Submit bug report/feedback with generated tracking code | M2 | Survey (Explorer 2) |
| 20 | Student Face & Avatar Portal | Self-service 5-angle face descriptor enrollment (TinyFaceDetector) and 512x512 avatar upload | M2 | Survey (Explorer 2) |
| 21 | Student Timetable & External Schedules | ME schedule display, add/delete external courses, iCal/Excel/PDF export | M2 | Survey (Explorer 2) |
| 22 | Student Realtime Session Fix | Fix `sessions` table publication and RLS SELECT policy so QR rotation/close updates push instantly | M2 | Survey (Explorer 2) |
| 23 | Student Leave Sessions Join Fix | Fix `leave_requests` join `sessions(session_name)` returning null due to RLS restriction | M2 | Survey (Explorer 2) |
| 24 | Backend Schema Consolidation | Update `supabase/schema.sql` to include post-baseline tables and columns (`student_external_schedules`, `students` new columns) | M3 | Survey (Explorer 3) |
| 25 | Backend Realtime & RLS Migration | Migration adding `sessions` to `supabase_realtime` and granting safe SELECT policy for authenticated users | M3 | Survey (Explorer 3) |
| 26 | Backend Direct Mutation Cleanup | Remove dead direct `.from('students').upsert()` mutation in `admin.tasks.js:1513` to comply with tightened RLS | M3 | Survey (Explorer 3) |
| 27 | Comprehensive E2E Test Suite | End-to-end and automated integration tests validating Admin & Student flows | M4 | Survey & R3 |
| 28 | Comprehensive Verification & Audit Report | Final report categorizing client code bugs vs Supabase backend discrepancies with exact lines, root cause, and remediation | M4 | Survey & R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Admin Subsystem Verification & Bug Remediation | Fix `confirmReopenSession` (admin.html), fix `focusAddStudentMssv` duplicate (admin.students.js), clean up redundant `sleep()`, verify all 10 views and 37 RPCs | none | DONE |
| M2 | Student Subsystem Verification & Bug Remediation | Fix `sessions` realtime subscription, fix leave requests session join display, remove dead `#fbModal` code, verify 6 views, 15 RPCs, face capture, and timetable | M1 | DONE |
| M3 | Supabase Backend Alignment & Migration Scripting | Author migration for `sessions` realtime publication and RLS policy; clean up dead direct table mutation in `admin.tasks.js`; synchronize schema documentation | M1, M2 | DONE |
| M4 | Comprehensive E2E Testing & Final Audit Report | Run automated verification harness, validate all acceptance criteria, synthesize comprehensive technical test report with remediation guide | M1, M2, M3 | DONE |

## Interface Contracts
### Admin Client ↔ Supabase Backend
- All mutations to `students` must use RPCs (`admin_add_student`, `admin_set_student_active`, `admin_delete_student`, `admin_update_avatar`).
- Session reopening must invoke `admin_reopen_session(p_session_id)`.
- Password resets must trigger Edge Function `admin-reset-password`.

### Student Client ↔ Supabase Backend
- Check-in calls `submit_attendance(p_session_id, p_token, p_mssv, p_category, p_note, p_device_id)`.
- Realtime listening on `sessions` updates requires `sessions` in `supabase_realtime` publication and an RLS SELECT policy allowing authenticated/anon read of public session fields (`id`, `session_name`, `is_open`, `qr_born_at`).
- Face enrollment upserts 5 vectors into `student_face_data` and uploads avatar to `avatars` bucket at `${mssv}/avatar.jpg`.

## Code Layout
- `admin.html`: Single-page entry for Admin.
- `js/admin/`:
  - `admin.core.js`: Core navigation, notification center, avatar.
  - `admin.leave.js`: Leave requests and chat.
  - `admin.schedules.js`: Workshop rules and ME schedule iframe.
  - `admin.tasks.js`: Task management, anonymous feedback, sessions, QR, Zalo matrix, password resets.
  - `admin.students.js`: Student roster, ME sync, groups, attendance table.
  - `admin.attendance.js`: Excel export.
  - `admin.face.js`: Face recognition, camera stream, liveness detection.
- `checkin.html`: Single-page entry for Student Portal.
- `face-sinhvien.html`: Student face and avatar registration.
- `lichhoc.html` & `js/lichhoc.js`: ME Timetable & external schedules.
- `index.html` & `js/auth.js`: Unified login and password reset request.
- `change-password.html`: Authenticated password change.
- `supabase/`:
  - `schema.sql`: Consolidated baseline DDL.
  - `migrations/`: 54 migration scripts.
  - `functions/admin-reset-password/`: Edge Function for password reset.
