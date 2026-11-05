# Test Infrastructure Specification: Performance Evaluations (LH-NaviX)

## 1. Overview & Philosophy

This document outlines the testing infrastructure for the **Member Performance Evaluation (Đánh giá hiệu suất thành viên)** module in LH-NaviX.

In accordance with strict QA standards:
- **Requirement-Driven & Opaque-Box**: Built entirely from the product requirements (`ORIGINAL_REQUEST.md`) and interface contracts (`PROJECT.md`). It treats the system under test (SUT) as a black box without depending on internal implementation details.
- **Zero Heavy External Dependencies**: Runs directly on Node.js using a lightweight, self-contained test harness with rich assertions, formatted ANSI reporting, and precise exit codes (0 on pass, 1 on failure).
- **Multi-Environment Module Resolver**: The harness seamlessly discovers and binds the `PerformanceEngine` whether exposed as CommonJS (`module.exports`), ES module syntax, or attached to global/window scope (`global.PerformanceEngine` / `window.PerformanceEngine`) in `js/admin/admin.performance.calc.js` or `js/admin/admin.performance.js`.

---

## 2. Test Execution & Commands

### Primary Runner
To run the full end-to-end performance test suite:
```bash
node tests/e2e_performance_evaluations.test.js
```

### Options & Filtering
The test runner supports running specific test tiers or matching descriptions via environment variables or CLI flags:
```bash
# Run all tests
node tests/e2e_performance_evaluations.test.js

# Run with verbose reporting
VERBOSE=1 node tests/e2e_performance_evaluations.test.js
```

---

## 3. Four-Tier Test Architecture

The suite is structured into four distinct verification tiers:

### Tier 1: Feature Coverage (>=5 test cases per core feature - Happy Paths)
- **F3/F6 Attendance Counting & Full Attendance**: Members with perfect attendance maintain 100 points.
- **F7 Excused Absence & School Conflicts**: Validating 0 point deduction for school schedule conflicts (`category = 'Học trường'` or notes containing keywords like `lịch học`, `lịch thi`, `trùng lịch`) vs standard excused absences (-2 pts).
- **F8 Unexcused Absence**: Exact deduction of 10 points per unexcused absence.
- **F9 Linear Late Deduction**: Verifying linear interpolation formula between 10 minutes (-1 pt) and 100 minutes (-20 pts).
- **F11/F12 Captain Score Adjustments**: Positive and negative additions accurately applied to attendance score.
- **F14 Performance Tier Classifications**: Accurate classification across all 5 tiers (Xuất sắc, Giỏi, Khá, Cần xem lại, Nguy cơ cao).

### Tier 2: Boundary & Corner Cases (>=5 test cases per feature)
- **Score Limits & Clamping**:
  - Clamping attendance score to [0, 100].
  - Clamping final score with captain adjustments to [0, 100] (preventing scores < 0 or > 100).
- **Late Duration Boundaries**:
  - Exact 0 minutes (no deduction).
  - Sub-10 minutes grace window (0 deduction).
  - Exact 10 minutes threshold (-1.0 pt).
  - Exact 100 minutes threshold (-20.0 pts).
  - Beyond 100 minutes (>100 min capped at 20.0 pts max per session, never converted to absence).
- **Zero & Missing Data States**:
  - New member with 0 attendance records maintains default 100 points with `hasData = false` ("Chưa có dữ liệu").
  - Empty attendance arrays, undefined notes, missing category strings.

### Tier 3: Cross-Feature Combinations (Pairwise & Compound Interactions)
- Multi-session composite records: late minutes combined with excused school absences, standard excused absences, and unexcused absences.
- Extreme captain penalties applied to already low attendance scores (testing lower floor resistance).
- Huge positive captain adjustments applied to degraded attendance scores (testing upper ceiling resistance).
- Exact boundary transition points for tier changes (e.g. score moving from 49.9 -> 50.0, 69.9 -> 70.0, 79.9 -> 80.0, 99.9 -> 100.0).

### Tier 4: Real-World Application Scenarios (Realistic Workloads & Cohorts)
- Cohort simulations: evaluation of a full subteam (5-10 members) with diverse profiles:
  - Top Performer (100% attendance, bonus points).
  - Student with recurring university classes (excused ME conflict).
  - Irregular attendee (mix of late arrivals, 1 unexcused absence, 1 regular excused).
  - High-risk member (chronic tardiness >100 min, multiple unexcused absences).
  - Inactive/New member (0 sessions recorded in period).
- Period synchronization: aggregating records across date filters, handling multiple evaluation cycles.

---

## 4. Contract Specifications & Expected Formulas

### 1. Late Deduction Formula
For a single session with $M$ late minutes:
- If $M < 10$: $\text{Deduction} = 0$
- If $10 \le M \le 100$:
  $$\text{Deduction} = 1 + (M - 10) \times \frac{19}{90} = 1 + (M - 10) \times 0.211111...$$
  *(At $M = 10 \rightarrow 1.0$; at $M = 55 \rightarrow 10.5$; at $M = 100 \rightarrow 20.0$)*
- If $M > 100$: $\text{Deduction} = 20.0$ (capped, status remains late/attended, never converted to absence).

### 2. Absence Deduction Rules
- **Present**: 0 pts.
- **Excused (School Conflict)**: 0 pts (`category === 'Học trường'` or `/lịch học|lịch thi|trùng lịch/i.test(note)`).
- **Excused (Standard/Other)**: 2.0 pts per session.
- **Unexcused**: 10.0 pts per session.

### 3. Attendance Score
$$\text{RawScore} = 100 - \sum \text{Deductions}$$
$$\text{AttendanceScore} = \max(0, \min(100, \text{RawScore}))$$
*Default for empty record list: $\text{AttendanceScore} = 100$, $\text{hasData} = \text{false}$.*

### 4. Final Score & Clamping
$$\text{FinalScore} = \max(0, \min(100, \text{round}((\text{AttendanceScore} + \text{CaptainAdjustment}) \times 10) / 10))$$

### 5. 5-Tier Performance Classification
- **100.0**: `Xuất sắc`
- **[80.0, 99.9]**: `Giỏi`
- **[70.0, 79.9]**: `Khá`
- **[50.0, 69.9]**: `Cần xem lại`
- **< 50.0** (i.e. [0.0, 49.9]): `Nguy cơ cao`

---

## 5. Test Suite File Structure
```
tests/
└── e2e_performance_evaluations.test.js    # Comprehensive Tier 1-4 opaque-box test suite
TEST_INFRA.md                              # This infrastructure specification document
TEST_READY.md                              # Test suite readiness & execution verification report
```
