/**
 * End-to-End Test Suite: Member Performance Evaluations (Đánh giá hiệu suất thành viên)
 * File: tests/e2e_performance_evaluations.test.js
 *
 * Requirements Source:
 *   - ORIGINAL_REQUEST.md (R1, R2, R3, R4)
 *   - PROJECT.md (Architecture, Interface Contracts, Milestones)
 *
 * Coverage:
 *   - Tier 1: Feature Coverage (>=5 test cases per feature for happy paths)
 *   - Tier 2: Boundary & Corner Cases (>=5 test cases per feature: limits 0, 100, 10 min, 100 min, >100 min, negative adjustments, score clamping, no data)
 *   - Tier 3: Cross-Feature Combinations (pairwise interactions: e.g. late + school conflict + captain adjustment + tier transitions)
 *   - Tier 4: Real-World Application Scenarios (realistic workloads with multiple teams and members)
 *
 * Execution:
 *   node tests/e2e_performance_evaluations.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ============================================================================
// ANSI Styling Helpers
// ============================================================================
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function colorize(color, text) {
  return `${colors[color] || ''}${text}${colors.reset}`;
}

// ============================================================================
// Specification Reference Oracle (Derived strictly from ORIGINAL_REQUEST.md & PROJECT.md)
// Used for runner verification and contract comparison
// ============================================================================
const SpecOracle = {
  calculateLateDeduction(lateMinutes) {
    const mins = Number(lateMinutes) || 0;
    if (mins <= 0) return 0;
    if (mins < 10) return 0; // Sub-10 minutes grace window
    if (mins >= 100) return 20.0; // Capped at 20 max, never converted to absence
    // Linear from 10m (1 pt) to 100m (20 pts): 1 + (mins - 10) * (19 / 90)
    const deduction = 1.0 + (mins - 10.0) * (19.0 / 90.0);
    return Math.round(deduction * 100) / 100;
  },

  isSchoolScheduleConflict(record) {
    if (!record) return false;
    const category = (record.category || record.type || '').trim();
    if (category === 'Học trường') return true;
    const note = (record.note || record.notes || record.reason || '').trim();
    const regex = /lịch học|lịch thi|trùng lịch/i;
    return regex.test(note);
  },

  calculateAttendanceScore(records) {
    if (!records || !Array.isArray(records) || records.length === 0) {
      return {
        attendanceScore: 100,
        presentCount: 0,
        excusedCount: 0,
        excusedSchoolCount: 0,
        excusedOtherCount: 0,
        unexcusedCount: 0,
        lateCount: 0,
        totalLateMinutes: 0,
        hasData: false
      };
    }

    let presentCount = 0;
    let excusedSchoolCount = 0;
    let excusedOtherCount = 0;
    let unexcusedCount = 0;
    let lateCount = 0;
    let totalLateMinutes = 0;
    let totalDeduction = 0;

    for (const rec of records) {
      const status = (rec.status || '').toLowerCase().trim();
      const mins = Number(rec.lateMinutes || rec.late_minutes || rec.minutesLate) || 0;

      const isPresent = status === 'present' || status === 'có mặt' || status === 'attended';
      const isExcused = status === 'absent_excused' || status === 'vắng có phép' || status === 'excused';
      const isUnexcused = status === 'absent_unexcused' || status === 'vắng không phép' || status === 'unexcused';
      const isLate = status === 'late' || status === 'đi muộn' || (isPresent && mins > 0);

      if (isPresent && !isLate) {
        presentCount++;
      } else if (isLate) {
        lateCount++;
        totalLateMinutes += mins;
        totalDeduction += SpecOracle.calculateLateDeduction(mins);
      } else if (isExcused) {
        if (SpecOracle.isSchoolScheduleConflict(rec)) {
          excusedSchoolCount++;
          // 0 deduction
        } else {
          excusedOtherCount++;
          totalDeduction += 2.0;
        }
      } else if (isUnexcused) {
        unexcusedCount++;
        totalDeduction += 10.0;
      }
    }

    const rawScore = 100.0 - totalDeduction;
    const clampedScore = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

    return {
      attendanceScore: clampedScore,
      presentCount,
      excusedCount: excusedSchoolCount + excusedOtherCount,
      excusedSchoolCount,
      excusedOtherCount,
      unexcusedCount,
      lateCount,
      totalLateMinutes,
      hasData: true
    };
  },

  calculateFinalScore(attendanceScore, captainAdjustment) {
    const base = Number(attendanceScore) || 0;
    const adj = Number(captainAdjustment) || 0;
    const combined = Math.round((base + adj) * 10) / 10;
    return Math.max(0, Math.min(100, combined));
  },

  getPerformanceTier(finalScore) {
    const score = Number(finalScore) || 0;
    if (score >= 100) {
      return { tier: 'Xuất sắc', label: 'Xuất sắc', color: 'green', badgeClass: 'badge-success' };
    }
    if (score >= 80) {
      return { tier: 'Giỏi', label: 'Giỏi', color: 'blue', badgeClass: 'badge-primary' };
    }
    if (score >= 70) {
      return { tier: 'Khá', label: 'Khá', color: 'cyan', badgeClass: 'badge-info' };
    }
    if (score >= 50) {
      return { tier: 'Cần xem lại', label: 'Cần xem lại', color: 'yellow', badgeClass: 'badge-warning' };
    }
    return { tier: 'Nguy cơ cao', label: 'Nguy cơ cao', color: 'red', badgeClass: 'badge-danger' };
  }
};

// ============================================================================
// SUT Module Resolution & Dynamic Loader
// ============================================================================
function resolveSUT() {
  const candidatePaths = [
    path.resolve(__dirname, '../js/admin/admin.performance.calc.js'),
    path.resolve(__dirname, '../js/admin/admin.performance.js'),
    path.resolve(__dirname, '../js/admin/admin.performance.engine.js')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        // First try CommonJS require
        const requiredModule = require(p);
        if (requiredModule && (requiredModule.PerformanceEngine || requiredModule.calculateLateDeduction)) {
          const engine = requiredModule.PerformanceEngine || requiredModule;
          return { engine, sourcePath: p, mode: 'CommonJS' };
        }
      } catch (e) {
        // If require fails (e.g. browser script with window/document), load via VM sandbox
      }

      try {
        const code = fs.readFileSync(p, 'utf8');
        const sandbox = {
          window: {},
          document: {},
          console,
          Math,
          Date,
          Number,
          String,
          Array,
          RegExp,
          module: { exports: {} },
          exports: {}
        };
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);

        const engine = sandbox.module.exports.PerformanceEngine ||
                       sandbox.module.exports ||
                       sandbox.window.PerformanceEngine ||
                       sandbox.PerformanceEngine;

        if (engine && (typeof engine.calculateLateDeduction === 'function' || typeof engine.calculateAttendanceScore === 'function')) {
          return { engine, sourcePath: p, mode: 'VMSandbox' };
        }
      } catch (err) {
        console.warn(`[WARN] Failed evaluating candidate ${p}: ${err.message}`);
      }
    }
  }

  return null;
}

// ============================================================================
// Test Runner Harness
// ============================================================================
class TestRunner {
  constructor(engine, isOracleFallback, sutInfo) {
    this.engine = engine;
    this.isOracleFallback = isOracleFallback;
    this.sutInfo = sutInfo;
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.results = [];
    this.currentTier = '';
  }

  setTier(tierName) {
    this.currentTier = tierName;
    console.log(`\n${colorize('bold', colorize('magenta', '══════════════════════════════════════════════════════════════════════'))}`);
    console.log(`${colorize('bold', colorize('cyan', `▶ ${tierName}`))}`);
    console.log(`${colorize('bold', colorize('magenta', '══════════════════════════════════════════════════════════════════════'))}`);
  }

  test(description, testFn) {
    const startTime = Date.now();
    try {
      testFn(this.engine);
      const duration = Date.now() - startTime;
      this.passed++;
      this.results.push({ tier: this.currentTier, description, status: 'PASS', duration });
      console.log(`  ${colorize('green', '✔ PASS')} ${colorize('dim', `[${duration}ms]`)} ${description}`);
    } catch (err) {
      const duration = Date.now() - startTime;
      this.failed++;
      this.results.push({ tier: this.currentTier, description, status: 'FAIL', duration, error: err.message });
      console.log(`  ${colorize('red', '✖ FAIL')} ${colorize('dim', `[${duration}ms]`)} ${description}`);
      console.log(`    ${colorize('red', 'Details:')} ${err.message}`);
      if (err.actual !== undefined && err.expected !== undefined) {
        console.log(`    ${colorize('yellow', 'Expected:')} ${JSON.stringify(err.expected)}`);
        console.log(`    ${colorize('yellow', 'Actual:  ')} ${JSON.stringify(err.actual)}`);
      }
    }
  }

  summary() {
    const total = this.passed + this.failed;
    console.log(`\n${colorize('bold', '──────────────────────────────────────────────────────────────────────')}`);
    console.log(`${colorize('bold', 'TEST EXECUTION SUMMARY')}`);
    console.log(`──────────────────────────────────────────────────────────────────────`);
    console.log(`  Mode:        ${this.isOracleFallback ? colorize('yellow', 'Runner Verification (Specification Oracle)') : colorize('green', `Live SUT (${this.sutInfo.sourcePath})`)}`);
    console.log(`  Total Tests: ${total}`);
    console.log(`  Passed:      ${colorize('green', this.passed)}`);
    console.log(`  Failed:      ${this.failed > 0 ? colorize('red', this.failed) : colorize('green', '0')}`);
    console.log(`  Pass Rate:   ${total > 0 ? ((this.passed / total) * 100).toFixed(1) : 0}%`);
    console.log(`──────────────────────────────────────────────────────────────────────\n`);
    return this.failed === 0;
  }
}

// Helper to extract tier label
function extractTierLabel(tierResult) {
  if (!tierResult) return '';
  if (typeof tierResult === 'string') return tierResult;
  return tierResult.label || tierResult.tier || '';
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
function runAllTests() {
  const sut = resolveSUT();
  let engine = null;
  let isOracleFallback = false;

  if (sut) {
    console.log(`\n${colorize('bold', colorize('green', `[SUT DETECTED]`))} Using implementation from: ${sut.sourcePath} (${sut.mode})`);
    engine = sut.engine;
  } else {
    console.log(`\n${colorize('bold', colorize('yellow', `[SUT PENDING]`))} No live SUT file found yet (waiting for M2).`);
    console.log(`Running in ${colorize('cyan', 'Runner Verification Mode')} against Specification Reference Oracle.`);
    engine = SpecOracle;
    isOracleFallback = true;
  }

  const runner = new TestRunner(engine, isOracleFallback, sut);

  // ==========================================================================
  // TIER 1: Feature Coverage (>=5 test cases per feature for happy paths)
  // ==========================================================================
  runner.setTier('Tier 1: Feature Coverage (Core Requirements Happy Path)');

  // Feature F6: Base Score & Perfect Attendance (Happy Path)
  runner.test('F6.1 - Single attended session maintains 100 points with zero deductions', (sut) => {
    const records = [{ status: 'present', lateMinutes: 0 }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.presentCount, 1);
    assert.strictEqual(res.hasData, true);
  });

  runner.test('F6.2 - Multiple attended sessions (5 sessions) maintain 100 points', (sut) => {
    const records = Array(5).fill({ status: 'present', lateMinutes: 0 });
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.presentCount, 5);
  });

  runner.test('F6.3 - Attended sessions with Vietnamese label "Có mặt" accurately counted', (sut) => {
    const records = [
      { status: 'Có mặt', lateMinutes: 0 },
      { status: 'có mặt', lateMinutes: 0 }
    ];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.presentCount, 2);
  });

  runner.test('F6.4 - Perfect attendance yields 0 unexcused, 0 excused, and 0 late count', (sut) => {
    const records = [{ status: 'present' }, { status: 'present' }, { status: 'present' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.unexcusedCount, 0);
    assert.strictEqual(res.excusedCount, 0);
    assert.strictEqual(res.lateCount, 0);
    assert.strictEqual(res.totalLateMinutes, 0);
  });

  runner.test('F6.5 - Monthly full attendance (20 sessions) yields perfect 100 score', (sut) => {
    const records = Array(20).fill({ status: 'present', lateMinutes: 0 });
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.presentCount, 20);
  });

  // Feature F7: Excused Absences & School Conflict Exemptions (Happy Path)
  runner.test('F7.1 - Excused absence with category "Học trường" incurs 0 deduction', (sut) => {
    const records = [{ status: 'excused', category: 'Học trường' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.excusedSchoolCount, 1);
    assert.strictEqual(res.excusedOtherCount, 0);
  });

  runner.test('F7.2 - Excused absence with note mentioning "trùng lịch học" incurs 0 deduction', (sut) => {
    const records = [{ status: 'vắng có phép', note: 'Xin phép vắng do trùng lịch học' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.excusedSchoolCount, 1);
  });

  runner.test('F7.3 - Excused absence with note mentioning "Lịch thi học kỳ" incurs 0 deduction', (sut) => {
    const records = [{ status: 'excused', note: 'Vướng lịch thi kết thúc học phần' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.excusedSchoolCount, 1);
  });

  runner.test('F7.4 - Standard excused absence (illness/personal) deducts exactly 2 points per session', (sut) => {
    const records = [{ status: 'vắng có phép', note: 'Em bị sốt xuất huyết nghỉ ốm' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 98);
    assert.strictEqual(res.excusedOtherCount, 1);
    assert.strictEqual(res.excusedSchoolCount, 0);
  });

  runner.test('F7.5 - Multiple standard excused absences (3 sessions) deduct exactly 6 points', (sut) => {
    const records = [
      { status: 'excused', note: 'Khám bệnh' },
      { status: 'vắng có phép', note: 'Việc gia đình' },
      { status: 'excused', note: 'Nghỉ ốm' }
    ];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 94);
    assert.strictEqual(res.excusedOtherCount, 3);
  });

  runner.test('F7.6 - Mixed excused absences (2 school conflicts + 1 personal) deduct exactly 2 points', (sut) => {
    const records = [
      { status: 'excused', category: 'Học trường' },
      { status: 'vắng có phép', note: 'trùng lịch thí nghiệm' },
      { status: 'excused', note: 'bận việc cá nhân' }
    ];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 98);
    assert.strictEqual(res.excusedSchoolCount, 2);
    assert.strictEqual(res.excusedOtherCount, 1);
  });

  // Feature F8: Unexcused Absence Deductions (Happy Path)
  runner.test('F8.1 - Single unexcused absence deducts exactly 10 points (score: 90)', (sut) => {
    const records = [{ status: 'absent_unexcused' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 90);
    assert.strictEqual(res.unexcusedCount, 1);
  });

  runner.test('F8.2 - Two unexcused absences deduct exactly 20 points (score: 80)', (sut) => {
    const records = [{ status: 'absent_unexcused' }, { status: 'absent_unexcused' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 80);
    assert.strictEqual(res.unexcusedCount, 2);
  });

  runner.test('F8.3 - Three unexcused absences deduct exactly 30 points (score: 70)', (sut) => {
    const records = Array(3).fill({ status: 'absent_unexcused' });
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 70);
    assert.strictEqual(res.unexcusedCount, 3);
  });

  runner.test('F8.4 - Four unexcused absences deduct exactly 40 points (score: 60)', (sut) => {
    const records = Array(4).fill({ status: 'absent_unexcused' });
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 60);
    assert.strictEqual(res.unexcusedCount, 4);
  });

  runner.test('F8.5 - Five unexcused absences deduct exactly 50 points (score: 50)', (sut) => {
    const records = Array(5).fill({ status: 'absent_unexcused' });
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 50);
    assert.strictEqual(res.unexcusedCount, 5);
  });

  // Feature F9: Linear Late Deductions (Happy Path)
  runner.test('F9.1 - Exactly 10 minutes late incurs exactly 1.0 point deduction', (sut) => {
    const deduction = sut.calculateLateDeduction(10);
    assert.strictEqual(Math.round(deduction * 10) / 10, 1.0);
  });

  runner.test('F9.2 - Exactly 55 minutes late incurs exactly 10.5 points deduction (midpoint)', (sut) => {
    const deduction = sut.calculateLateDeduction(55);
    assert.strictEqual(Math.round(deduction * 10) / 10, 10.5);
  });

  runner.test('F9.3 - Exactly 100 minutes late incurs exactly 20.0 points deduction', (sut) => {
    const deduction = sut.calculateLateDeduction(100);
    assert.strictEqual(Math.round(deduction * 10) / 10, 20.0);
  });

  runner.test('F9.4 - Linear interpolation check at 30 minutes late (approx 5.22 points)', (sut) => {
    const deduction = sut.calculateLateDeduction(30);
    // 1 + (20 * 19 / 90) = 5.222
    assert(Math.abs(deduction - 5.22) < 0.05, `Expected ~5.22, got ${deduction}`);
  });

  runner.test('F9.5 - Linear interpolation check at 70 minutes late (approx 13.67 points)', (sut) => {
    const deduction = sut.calculateLateDeduction(70);
    // 1 + (60 * 19 / 90) = 13.667
    assert(Math.abs(deduction - 13.67) < 0.05, `Expected ~13.67, got ${deduction}`);
  });

  runner.test('F9.6 - Multiple late sessions aggregate deductions accurately in attendance score', (sut) => {
    const records = [
      { status: 'late', lateMinutes: 10 }, // 1.0 pt
      { status: 'late', lateMinutes: 55 }  // 10.5 pt
    ];
    const res = sut.calculateAttendanceScore(records);
    // Total deduction = 11.5 -> Score = 88.5
    assert.strictEqual(res.attendanceScore, 88.5);
    assert.strictEqual(res.lateCount, 2);
    assert.strictEqual(res.totalLateMinutes, 65);
  });

  // Feature F11 & F12: Captain Score Adjustments (Happy Path)
  runner.test('F11.1 - Positive captain adjustment (+5.0) on base score (90) yields 95.0', (sut) => {
    const finalScore = sut.calculateFinalScore(90, 5.0);
    assert.strictEqual(finalScore, 95.0);
  });

  runner.test('F11.2 - Negative captain adjustment (-5.0) on base score (90) yields 85.0', (sut) => {
    const finalScore = sut.calculateFinalScore(90, -5.0);
    assert.strictEqual(finalScore, 85.0);
  });

  runner.test('F11.3 - Fractional positive adjustment (+2.5) on base score (85) yields 87.5', (sut) => {
    const finalScore = sut.calculateFinalScore(85, 2.5);
    assert.strictEqual(finalScore, 87.5);
  });

  runner.test('F11.4 - Fractional negative adjustment (-3.7) on base score (80) yields 76.3', (sut) => {
    const finalScore = sut.calculateFinalScore(80, -3.7);
    assert.strictEqual(finalScore, 76.3);
  });

  runner.test('F11.5 - Zero captain adjustment (0.0) leaves base score unchanged (88.0)', (sut) => {
    const finalScore = sut.calculateFinalScore(88, 0);
    assert.strictEqual(finalScore, 88.0);
  });

  // Feature F14: 5-Tier Performance Classification (Happy Path)
  runner.test('F14.1 - Score 100.0 classified as "Xuất sắc"', (sut) => {
    const tier = sut.getPerformanceTier(100.0);
    assert.strictEqual(extractTierLabel(tier), 'Xuất sắc');
  });

  runner.test('F14.2 - Score 88.5 (within [80, 99.99]) classified as "Giỏi"', (sut) => {
    const tier = sut.getPerformanceTier(88.5);
    assert.strictEqual(extractTierLabel(tier), 'Giỏi');
  });

  runner.test('F14.3 - Score 74.0 (within [70, 79.99]) classified as "Khá"', (sut) => {
    const tier = sut.getPerformanceTier(74.0);
    assert.strictEqual(extractTierLabel(tier), 'Khá');
  });

  runner.test('F14.4 - Score 58.0 (within [50, 69.99]) classified as "Cần xem lại"', (sut) => {
    const tier = sut.getPerformanceTier(58.0);
    assert.strictEqual(extractTierLabel(tier), 'Cần xem lại');
  });

  runner.test('F14.5 - Score 35.0 (< 50) classified as "Nguy cơ cao"', (sut) => {
    const tier = sut.getPerformanceTier(35.0);
    assert.strictEqual(extractTierLabel(tier), 'Nguy cơ cao');
  });

  // ==========================================================================
  // TIER 2: Boundary & Corner Cases (Limits, Grace Windows, Clamping, Empty)
  // ==========================================================================
  runner.setTier('Tier 2: Boundary & Corner Cases');

  // Late Duration Boundaries
  runner.test('B2.1 - Exactly 0 minutes late incurs 0 deduction', (sut) => {
    assert.strictEqual(sut.calculateLateDeduction(0), 0);
  });

  runner.test('B2.2 - Sub-10 minutes late (5 minutes grace) incurs 0 deduction', (sut) => {
    assert.strictEqual(sut.calculateLateDeduction(5), 0);
  });

  runner.test('B2.3 - Sub-10 minutes upper edge (9 minutes grace) incurs 0 deduction', (sut) => {
    assert.strictEqual(sut.calculateLateDeduction(9), 0);
  });

  runner.test('B2.4 - Late > 100 minutes (101 minutes) capped at 20.0 points maximum', (sut) => {
    assert.strictEqual(sut.calculateLateDeduction(101), 20.0);
  });

  runner.test('B2.5 - Extreme late duration (180 minutes) capped at 20.0 points maximum', (sut) => {
    assert.strictEqual(sut.calculateLateDeduction(180), 20.0);
  });

  runner.test('B2.6 - Late > 100 minutes never converts to absent status in calculation', (sut) => {
    const records = [{ status: 'late', lateMinutes: 150 }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.unexcusedCount, 0);
    assert.strictEqual(res.lateCount, 1);
    assert.strictEqual(res.attendanceScore, 80.0); // 100 - 20
  });

  // Score Clamping Boundaries [0, 100]
  runner.test('B2.7 - Accumulation of 11 unexcused absences (deduction 110) strictly clamped to 0 floor', (sut) => {
    const records = Array(11).fill({ status: 'absent_unexcused' });
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 0.0);
  });

  runner.test('B2.8 - Exactly 10 unexcused absences (deduction 100) yields exactly 0.0 floor', (sut) => {
    const records = Array(10).fill({ status: 'absent_unexcused' });
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 0.0);
  });

  runner.test('B2.9 - Perfect attendance with 0 deductions strictly capped at 100 ceiling', (sut) => {
    const records = Array(10).fill({ status: 'present' });
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100.0);
  });

  runner.test('B2.10 - Negative late minutes input safely treated as 0 deduction', (sut) => {
    assert.strictEqual(sut.calculateLateDeduction(-15), 0);
    const records = [{ status: 'present', lateMinutes: -10 }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100.0);
  });

  runner.test('B2.11 - 6 sessions with >100 min late (deduction 120) strictly clamped to 0 floor', (sut) => {
    const records = Array(6).fill({ status: 'late', lateMinutes: 120 });
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 0.0);
  });

  // Captain Adjustment Clamping Boundaries [0, 100]
  runner.test('B2.12 - Large positive captain adjustment (+50 on 90) clamped strictly to 100 ceiling', (sut) => {
    assert.strictEqual(sut.calculateFinalScore(90, 50), 100.0);
  });

  runner.test('B2.13 - Positive adjustment on perfect score (+10 on 100) clamped strictly to 100 ceiling', (sut) => {
    assert.strictEqual(sut.calculateFinalScore(100, 10), 100.0);
  });

  runner.test('B2.14 - Extreme negative adjustment (-80 on 50) clamped strictly to 0 floor', (sut) => {
    assert.strictEqual(sut.calculateFinalScore(50, -80), 0.0);
  });

  runner.test('B2.15 - Negative adjustment on 0 score (-20 on 0) clamped strictly to 0 floor', (sut) => {
    assert.strictEqual(sut.calculateFinalScore(0, -20), 0.0);
  });

  runner.test('B2.16 - String numeric inputs ("+15", "-25") safely coerced without NaN', (sut) => {
    assert.strictEqual(sut.calculateFinalScore(80, "+15"), 95.0);
    assert.strictEqual(sut.calculateFinalScore(80, "-25"), 55.0);
  });

  // School Conflict Regex Variations & Corner Cases
  runner.test('B2.17 - Case-insensitivity: Note with uppercase "TRÙNG LỊCH HỌC" incurs 0 deduction', (sut) => {
    const records = [{ status: 'vắng có phép', note: 'TRÙNG LỊCH HỌC KỲ' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.excusedSchoolCount, 1);
  });

  runner.test('B2.18 - Partial keyword match: Note with "lịch thi tốt nghiệp" incurs 0 deduction', (sut) => {
    const recordWithKeyword = [{ status: 'excused', note: 'vướng lịch thi tốt nghiệp' }];
    const res = sut.calculateAttendanceScore(recordWithKeyword);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.excusedSchoolCount, 1);
  });

  runner.test('B2.19 - Substring match: Note with "trùng lịch" inside sentence incurs 0 deduction', (sut) => {
    const records = [{ status: 'vắng có phép', note: 'Hôm nay em bị trùng lịch với lớp kỹ năng mềm' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.excusedSchoolCount, 1);
  });

  runner.test('B2.20 - Empty note and category null with excused status incurs standard 2 points deduction', (sut) => {
    const records = [{ status: 'excused', note: '', category: null }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 98);
    assert.strictEqual(res.excusedOtherCount, 1);
  });

  runner.test('B2.21 - Unrelated study note (e.g. "ôn thi tại phòng trọ") incurs standard 2 points deduction', (sut) => {
    const records = [{ status: 'vắng có phép', note: 'Em ở nhà ôn bài chuẩn bị kiểm tra' }];
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 98);
    assert.strictEqual(res.excusedOtherCount, 1);
  });

  // Empty / No Data States
  runner.test('B2.22 - Member with empty records array [] defaults to 100 points with hasData: false', (sut) => {
    const res = sut.calculateAttendanceScore([]);
    assert.strictEqual(res.attendanceScore, 100);
    assert.strictEqual(res.hasData, false);
    assert.strictEqual(res.presentCount, 0);
  });

  runner.test('B2.23 - Member with null/undefined records defaults to 100 points with hasData: false', (sut) => {
    const resNull = sut.calculateAttendanceScore(null);
    assert.strictEqual(resNull.attendanceScore, 100);
    assert.strictEqual(resNull.hasData, false);

    const resUndef = sut.calculateAttendanceScore(undefined);
    assert.strictEqual(resUndef.attendanceScore, 100);
    assert.strictEqual(resUndef.hasData, false);
  });

  runner.test('B2.24 - Missing optional fields inside record handled gracefully without NaN', (sut) => {
    const records = [{ status: 'late' }]; // missing lateMinutes
    const res = sut.calculateAttendanceScore(records);
    assert(!isNaN(res.attendanceScore), 'Score should not be NaN');
    assert.strictEqual(res.attendanceScore, 100); // 0 late minutes = 0 deduction
  });

  runner.test('B2.25 - Unknown attendance status string safely defaults to unexcused absence per LH-NaviX domain rules', (sut) => {
    const records = [{ status: 'unknown_status' }];
    const res = sut.calculateAttendanceScore(records);
    assert(!isNaN(res.attendanceScore));
    assert.strictEqual(res.unexcusedCount, 1);
    assert.strictEqual(res.attendanceScore, 90);
    assert.strictEqual(res.hasData, true);
  });

  // ==========================================================================
  // TIER 3: Cross-Feature Combinations & Tier Transitions
  // ==========================================================================
  runner.setTier('Tier 3: Cross-Feature Combinations & Tier Transitions');

  runner.test('C3.1 - Compound Composite Attendance: Present + School Excused + Regular Excused + Unexcused + Late', (sut) => {
    const records = [
      { status: 'present' },                                             // 0 pt
      { status: 'excused', category: 'Học trường' },                      // 0 pt
      { status: 'vắng có phép', note: 'trùng lịch thực tập' },           // 0 pt
      { status: 'excused', note: 'việc riêng' },                         // -2.0 pt
      { status: 'absent_unexcused' },                                     // -10.0 pt
      { status: 'late', lateMinutes: 55 }                                 // -10.5 pt
    ];
    // Total deductions = 2.0 + 10.0 + 10.5 = 22.5
    // Attendance score = 100 - 22.5 = 77.5
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 77.5);
    assert.strictEqual(res.presentCount, 1);
    assert.strictEqual(res.excusedSchoolCount, 2);
    assert.strictEqual(res.excusedOtherCount, 1);
    assert.strictEqual(res.unexcusedCount, 1);
    assert.strictEqual(res.lateCount, 1);
  });

  runner.test('C3.2 - Promotion across tier boundary: Base 77.5 ("Khá") + Captain +5.0 = 82.5 ("Giỏi")', (sut) => {
    const attendanceScore = 77.5;
    const finalScore = sut.calculateFinalScore(attendanceScore, 5.0);
    assert.strictEqual(finalScore, 82.5);

    const baseTier = sut.getPerformanceTier(attendanceScore);
    const promotedTier = sut.getPerformanceTier(finalScore);
    assert.strictEqual(extractTierLabel(baseTier), 'Khá');
    assert.strictEqual(extractTierLabel(promotedTier), 'Giỏi');
  });

  runner.test('C3.3 - Demotion across tier boundary: Base 77.5 ("Khá") + Captain -10.0 = 67.5 ("Cần xem lại")', (sut) => {
    const finalScore = sut.calculateFinalScore(77.5, -10.0);
    assert.strictEqual(finalScore, 67.5);

    const demotedTier = sut.getPerformanceTier(finalScore);
    assert.strictEqual(extractTierLabel(demotedTier), 'Cần xem lại');
  });

  runner.test('C3.4 - Heavy Penalties + Captain Penalty Hitting Absolute Floor (15 - 25 = 0.0 -> "Nguy cơ cao")', (sut) => {
    const finalScore = sut.calculateFinalScore(15, -25.0);
    assert.strictEqual(finalScore, 0.0);

    const tier = sut.getPerformanceTier(finalScore);
    assert.strictEqual(extractTierLabel(tier), 'Nguy cơ cao');
  });

  runner.test('C3.5 - Exact Boundary Precision: 49.9 ("Nguy cơ cao") vs 50.0 ("Cần xem lại")', (sut) => {
    const t49 = sut.getPerformanceTier(49.9);
    const t50 = sut.getPerformanceTier(50.0);
    assert.strictEqual(extractTierLabel(t49), 'Nguy cơ cao');
    assert.strictEqual(extractTierLabel(t50), 'Cần xem lại');
  });

  runner.test('C3.6 - Exact Boundary Precision: 69.9 ("Cần xem lại") vs 70.0 ("Khá")', (sut) => {
    const t69 = sut.getPerformanceTier(69.9);
    const t70 = sut.getPerformanceTier(70.0);
    assert.strictEqual(extractTierLabel(t69), 'Cần xem lại');
    assert.strictEqual(extractTierLabel(t70), 'Khá');
  });

  runner.test('C3.7 - Exact Boundary Precision: 79.9 ("Khá") vs 80.0 ("Giỏi")', (sut) => {
    const t79 = sut.getPerformanceTier(79.9);
    const t80 = sut.getPerformanceTier(80.0);
    assert.strictEqual(extractTierLabel(t79), 'Khá');
    assert.strictEqual(extractTierLabel(t80), 'Giỏi');
  });

  runner.test('C3.8 - Exact Boundary Precision: 99.9 ("Giỏi") vs 100.0 ("Xuất sắc")', (sut) => {
    const t99 = sut.getPerformanceTier(99.9);
    const t100 = sut.getPerformanceTier(100.0);
    assert.strictEqual(extractTierLabel(t99), 'Giỏi');
    assert.strictEqual(extractTierLabel(t100), 'Xuất sắc');
  });

  runner.test('C3.9 - Multi-late compound accumulation (10m, 55m, 120m) yields 68.5 score', (sut) => {
    const records = [
      { status: 'late', lateMinutes: 10 },  // 1.0 pt
      { status: 'late', lateMinutes: 55 },  // 10.5 pt
      { status: 'late', lateMinutes: 120 }  // 20.0 pt max
    ];
    // Deductions: 1.0 + 10.5 + 20.0 = 31.5 -> Score = 68.5
    const res = sut.calculateAttendanceScore(records);
    assert.strictEqual(res.attendanceScore, 68.5);
    assert.strictEqual(res.lateCount, 3);
  });

  runner.test('C3.10 - Captain adjustment on new member (base 100) with negative adjustment -15 yields 85 ("Giỏi")', (sut) => {
    const records = [];
    const attRes = sut.calculateAttendanceScore(records);
    assert.strictEqual(attRes.attendanceScore, 100);
    assert.strictEqual(attRes.hasData, false);

    const finalScore = sut.calculateFinalScore(attRes.attendanceScore, -15);
    assert.strictEqual(finalScore, 85.0);

    const tier = sut.getPerformanceTier(finalScore);
    assert.strictEqual(extractTierLabel(tier), 'Giỏi');
  });

  // ==========================================================================
  // TIER 4: Real-World Application Scenarios (Workloads & Cohorts)
  // ==========================================================================
  runner.setTier('Tier 4: Real-World Application Scenarios (Cohorts & Workloads)');

  runner.test('R4.1 - Comprehensive Subteam Cohort Evaluation (8 diverse team member profiles)', (sut) => {
    const roster = [
      {
        mssv: 'SV001',
        name: 'Trần Văn A (Đội trưởng)',
        records: Array(10).fill({ status: 'present' }),
        captainAdjustment: 5.0,
        expectedAttendance: 100.0,
        expectedFinal: 100.0,
        expectedTier: 'Xuất sắc'
      },
      {
        mssv: 'SV002',
        name: 'Lê Thị B (Sinh viên chăm chỉ vướng lịch học)',
        records: [
          ...Array(6).fill({ status: 'present' }),
          ...Array(4).fill({ status: 'excused', category: 'Học trường' })
        ],
        captainAdjustment: 0.0,
        expectedAttendance: 100.0,
        expectedFinal: 100.0,
        expectedTier: 'Xuất sắc'
      },
      {
        mssv: 'SV003',
        name: 'Nguyễn Văn C (Chuyên cần tốt, xin phép 1 buổi)',
        records: [
          ...Array(9).fill({ status: 'present' }),
          { status: 'vắng có phép', note: 'Khám răng' } // -2 pt
        ],
        captainAdjustment: 2.0, // Compensated by captain
        expectedAttendance: 98.0,
        expectedFinal: 100.0, // 98 + 2 = 100
        expectedTier: 'Xuất sắc'
      },
      {
        mssv: 'SV004',
        name: 'Phạm Thị D (Đi muộn nhẹ 2 lần)',
        records: [
          ...Array(8).fill({ status: 'present' }),
          { status: 'late', lateMinutes: 10 }, // -1.0 pt
          { status: 'late', lateMinutes: 55 }  // -10.5 pt
        ],
        captainAdjustment: 0.0,
        expectedAttendance: 88.5,
        expectedFinal: 88.5,
        expectedTier: 'Giỏi'
      },
      {
        mssv: 'SV005',
        name: 'Hoàng Văn E (Vi phạm vừa phải, vắng 1 không phép + 1 trễ nặng)',
        records: [
          ...Array(7).fill({ status: 'present' }),
          { status: 'absent_unexcused' },         // -10.0 pt
          { status: 'late', lateMinutes: 100 }    // -20.0 pt
        ],
        captainAdjustment: -2.0,
        expectedAttendance: 70.0, // 100 - 30 = 70
        expectedFinal: 68.0,      // 70 - 2 = 68
        expectedTier: 'Cần xem lại'
      },
      {
        mssv: 'SV006',
        name: 'Vũ Thị F (Nhiều vi phạm chuyên cần)',
        records: [
          ...Array(4).fill({ status: 'present' }),
          { status: 'absent_unexcused' },         // -10.0 pt
          { status: 'absent_unexcused' },         // -10.0 pt
          { status: 'late', lateMinutes: 120 }    // -20.0 pt
        ],
        captainAdjustment: -15.0,
        expectedAttendance: 60.0, // 100 - 40 = 60
        expectedFinal: 45.0,      // 60 - 15 = 45
        expectedTier: 'Nguy cơ cao'
      },
      {
        mssv: 'SV007',
        name: 'Đỗ Văn G (Bỏ bê điểm danh nghiêm trọng)',
        records: Array(11).fill({ status: 'absent_unexcused' }), // -110 pt -> 0
        captainAdjustment: -10.0,
        expectedAttendance: 0.0,
        expectedFinal: 0.0,
        expectedTier: 'Nguy cơ cao'
      },
      {
        mssv: 'SV008',
        name: 'Bùi Thị H (Thành viên mới gia nhập)',
        records: [],
        captainAdjustment: 0.0,
        expectedAttendance: 100.0,
        expectedFinal: 100.0,
        expectedTier: 'Xuất sắc',
        expectedHasData: false
      }
    ];

    for (const member of roster) {
      const attRes = sut.calculateAttendanceScore(member.records);
      assert.strictEqual(attRes.attendanceScore, member.expectedAttendance, `${member.name} attendanceScore mismatch`);
      if (member.expectedHasData !== undefined) {
        assert.strictEqual(attRes.hasData, member.expectedHasData, `${member.name} hasData mismatch`);
      }

      const finalScore = sut.calculateFinalScore(attRes.attendanceScore, member.captainAdjustment);
      assert.strictEqual(finalScore, member.expectedFinal, `${member.name} finalScore mismatch`);

      const tier = sut.getPerformanceTier(finalScore);
      assert.strictEqual(extractTierLabel(tier), member.expectedTier, `${member.name} tier mismatch`);
    }
  });

  runner.test('R4.2 - Multi-Period Date Filtering Simulation', (sut) => {
    // Member has records in Month 10 and Month 11
    const allRecords = [
      { date: '2026-10-05', status: 'present' },
      { date: '2026-10-12', status: 'absent_unexcused' }, // -10 in Oct
      { date: '2026-11-02', status: 'present' },
      { date: '2026-11-09', status: 'present' }
    ];

    // Filter for October: '2026-10-01' to '2026-10-31'
    const octRecords = allRecords.filter(r => r.date >= '2026-10-01' && r.date <= '2026-10-31');
    const octRes = sut.calculateAttendanceScore(octRecords);
    assert.strictEqual(octRes.attendanceScore, 90.0);
    assert.strictEqual(octRes.unexcusedCount, 1);

    // Filter for November: '2026-11-01' to '2026-11-30'
    const novRecords = allRecords.filter(r => r.date >= '2026-11-01' && r.date <= '2026-11-30');
    const novRes = sut.calculateAttendanceScore(novRecords);
    assert.strictEqual(novRes.attendanceScore, 100.0);
    assert.strictEqual(novRes.unexcusedCount, 0);
  });

  runner.test('R4.3 - Real-Time UI Adjustment Reactivity Simulation', (sut) => {
    // Simulating captain opening modal and testing various adjustment values
    const baseScore = 75.0; // "Khá"
    let currentScore = sut.calculateFinalScore(baseScore, 0);
    assert.strictEqual(currentScore, 75.0);
    assert.strictEqual(extractTierLabel(sut.getPerformanceTier(currentScore)), 'Khá');

    // Captain types +10
    currentScore = sut.calculateFinalScore(baseScore, 10);
    assert.strictEqual(currentScore, 85.0);
    assert.strictEqual(extractTierLabel(sut.getPerformanceTier(currentScore)), 'Giỏi');

    // Captain changes mind, types -10
    currentScore = sut.calculateFinalScore(baseScore, -10);
    assert.strictEqual(currentScore, 65.0);
    assert.strictEqual(extractTierLabel(sut.getPerformanceTier(currentScore)), 'Cần xem lại');

    // Captain types extreme -80
    currentScore = sut.calculateFinalScore(baseScore, -80);
    assert.strictEqual(currentScore, 0.0);
    assert.strictEqual(extractTierLabel(sut.getPerformanceTier(currentScore)), 'Nguy cơ cao');
  });

  runner.test('R4.4 - High-Volume Roster Bulk Stability Benchmark (100 synthetic members)', (sut) => {
    const startTime = Date.now();
    for (let i = 0; i < 100; i++) {
      const records = [
        { status: 'present' },
        { status: 'late', lateMinutes: (i % 60) },
        { status: (i % 5 === 0) ? 'absent_unexcused' : 'present' }
      ];
      const att = sut.calculateAttendanceScore(records);
      const finalScore = sut.calculateFinalScore(att.attendanceScore, (i % 10) - 5);
      const tier = sut.getPerformanceTier(finalScore);
      assert(!isNaN(finalScore));
      assert(extractTierLabel(tier).length > 0);
    }
    const elapsed = Date.now() - startTime;
    assert(elapsed < 200, `Bulk processing took too long: ${elapsed}ms`);
  });

  runner.test('R4.5 - Robustness Against Corrupted or Malformed Database Records', (sut) => {
    const malformedRecords = [
      null,
      undefined,
      {},
      { status: null },
      { status: 'present', lateMinutes: 'invalid_number' },
      { status: 'absent_excused', note: null, category: undefined }
    ];
    // Filter out nulls if calling array methods, but test should not crash
    const sanitized = malformedRecords.filter(Boolean);
    const res = sut.calculateAttendanceScore(sanitized);
    assert(!isNaN(res.attendanceScore));
    assert(res.attendanceScore >= 0 && res.attendanceScore <= 100);
  });

  // ==========================================================================
  // Report Summary & Exit
  // ==========================================================================
  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

// Execute test suite
runAllTests();
