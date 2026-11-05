/* =====================================================================
   LH-NaviX Admin — admin.performance.calc.js
   Module tính toán hiệu suất thành viên (Pure Calculation Engine)
   Hỗ trợ cả môi trường Browser (window.PerformanceEngine) và Node.js CommonJS
   ===================================================================== */

/**
 * Tính số điểm trừ khi đi muộn theo công thức tuyến tính.
 * - Dưới 10 phút: không trừ (0 điểm).
 * - Từ 10 đến 100 phút: trừ từ 1 đến 20 điểm theo tỉ lệ: 1 + (m - 10) * 19 / 90.
 * - Trên 100 phút: phạt tối đa 20 điểm, giữ nguyên trạng thái đi muộn (không chuyển thành vắng).
 *
 * @param {number|string} lateMinutes - Số phút đi muộn (m)
 * @returns {number} Số điểm bị trừ (>= 0)
 */
function calculateLateDeduction(lateMinutes) {
  const m = Number(lateMinutes);
  if (isNaN(m) || m < 10) {
    return 0;
  }
  if (m <= 100) {
    return 1 + ((m - 10) * 19) / 90;
  }
  return 20;
}

/**
 * Trích xuất số phút đi muộn từ ghi chú hoặc chênh lệch mốc thời gian.
 *
 * @param {string|number|null} note - Ghi chú hoặc lý do đi muộn
 * @param {string|Date|null} createdAt - Thời gian quét điểm danh thực tế
 * @param {string|Date|null} sessionStartedAt - Thời gian bắt đầu phiên
 * @param {number|null} sessionWarnMin - Ngưỡng cảnh báo muộn của phiên (mặc định 30 phút)
 * @returns {number} Số phút đi muộn
 */
function parseLateMinutes(note, createdAt, sessionStartedAt, sessionWarnMin) {
  if (typeof note === 'number' && !isNaN(note)) {
    return Math.max(0, Math.round(note));
  }

  if (typeof note === 'string' && note.trim().length > 0) {
    const text = note.trim();
    const regexMatch = text.match(/\+?(\d+)\s*(?:phút|p)/i);
    if (regexMatch && regexMatch[1]) {
      return parseInt(regexMatch[1], 10);
    }
    const directNumMatch = text.match(/^\+?(\d+)$/);
    if (directNumMatch && directNumMatch[1]) {
      return parseInt(directNumMatch[1], 10);
    }
  }

  if (createdAt && sessionStartedAt) {
    const createdMs = new Date(createdAt).getTime();
    const startMs = new Date(sessionStartedAt).getTime();
    if (!isNaN(createdMs) && !isNaN(startMs)) {
      const warnMin = (typeof sessionWarnMin === 'number' && !isNaN(sessionWarnMin))
        ? sessionWarnMin
        : (Number(sessionWarnMin) || 30);
      const diffMinutes = Math.round((createdMs - (startMs + warnMin * 60000)) / 60000);
      return Math.max(1, diffMinutes);
    }
  }

  return 0;
}

/**
 * Kiểm tra xem buổi vắng có phải do trùng lịch học (trường / thi) hay không.
 *
 * @param {Object|string} record - Bản ghi điểm danh hoặc chuỗi lý do
 * @returns {boolean} True nếu là trùng lịch học
 */
function isSchoolScheduleConflict(record) {
  if (!record) return false;

  const keywords = ['lịch học', 'lịch thi', 'trùng lịch', 'học trường'];

  if (typeof record === 'string') {
    const s = record.toLowerCase().trim();
    if (s === 'học trường') return true;
    return keywords.some(function (kw) {
      return s.includes(kw);
    });
  }

  if (typeof record !== 'object') return false;

  const category = (record.category || '').toString().trim().toLowerCase();
  if (category === 'học trường') {
    return true;
  }

  const textToSearch = [
    record.category,
    record.note,
    record.reason,
    record.notes,
    record.description,
    record.reason_detail
  ].filter(Boolean).join(' ').toLowerCase();

  return keywords.some(function (kw) {
    return textToSearch.includes(kw);
  });
}

/**
 * Tính điểm chuyên cần tự động từ danh sách bản ghi điểm danh trong kỳ.
 *
 * @param {Array<Object>} records - Danh sách bản ghi điểm danh
 * @returns {Object} Thống kê chi tiết và điểm chuyên cần
 */
function calculateAttendanceScore(records) {
  const emptyResult = {
    attendanceScore: 100,
    presentCount: 0,
    excusedCount: 0,
    excusedSchoolCount: 0,
    excusedOtherCount: 0,
    unexcusedCount: 0,
    lateCount: 0,
    totalLateMinutes: 0,
    totalLateDeduction: 0,
    hasData: false
  };

  if (!records || !Array.isArray(records) || records.length === 0) {
    return emptyResult;
  }

  let presentCount = 0;
  let excusedSchoolCount = 0;
  let excusedOtherCount = 0;
  let unexcusedCount = 0;
  let lateCount = 0;
  let totalLateMinutes = 0;
  let totalLateDeduction = 0;
  let validRecordsCount = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record || typeof record !== 'object') continue;
    validRecordsCount++;

    const normStatus = (record.status || record.type || '').toString().trim().toLowerCase();

    // 1. Kiểm tra Đi muộn
    const isLate = (
      ['đi muộn', 'di muon', 'muộn', 'muon', 'late'].includes(normStatus) ||
      record.is_late === true ||
      record.isLate === true ||
      (!['có mặt', 'co mat', 'present', 'vắng có phép', 'vang co phep', 'có phép', 'co phep', 'excused', 'p', 'vắng không phép', 'vang khong phep', 'không phép', 'khong phep', 'unexcused', 'kp', 'absent', 'vắng', 'vang'].includes(normStatus) &&
       (Number(record.late_minutes) > 0 || Number(record.lateMinutes) > 0 || Number(record.minutes) > 0))
    );

    if (isLate) {
      lateCount++;
      let m = 0;
      if (typeof record.late_minutes === 'number' && !isNaN(record.late_minutes)) {
        m = record.late_minutes;
      } else if (typeof record.lateMinutes === 'number' && !isNaN(record.lateMinutes)) {
        m = record.lateMinutes;
      } else if (typeof record.minutes === 'number' && !isNaN(record.minutes)) {
        m = record.minutes;
      } else if (record.late_minutes !== undefined && record.late_minutes !== null && record.late_minutes !== '') {
        m = Number(record.late_minutes);
      } else if (record.lateMinutes !== undefined && record.lateMinutes !== null && record.lateMinutes !== '') {
        m = Number(record.lateMinutes);
      } else {
        m = parseLateMinutes(
          record.note || record.notes || record.reason,
          record.created_at || record.createdAt,
          record.session_started_at || record.sessionStartedAt || (record.session && record.session.started_at),
          record.session_warn_min || record.sessionWarnMin || (record.session && record.session.warn_min)
        );
      }
      m = Math.max(0, Number(m) || 0);
      totalLateMinutes += m;
      const deduction = calculateLateDeduction(m);
      totalLateDeduction += deduction;
      continue;
    }

    // 2. Kiểm tra Vắng có phép
    const isExcused = (
      ['vắng có phép', 'vang co phep', 'có phép', 'co phep', 'excused', 'p'].includes(normStatus) ||
      record.is_excused === true ||
      record.isExcused === true ||
      ((normStatus === 'vắng' || normStatus === 'absent') && record.excused === true)
    );

    if (isExcused) {
      if (isSchoolScheduleConflict(record)) {
        excusedSchoolCount++;
      } else {
        excusedOtherCount++;
      }
      continue;
    }

    // 3. Kiểm tra Có mặt
    const isPresent = (
      ['có mặt', 'co mat', 'present', 'attended', 'attending'].includes(normStatus) ||
      record.is_present === true ||
      record.isPresent === true ||
      record.present === true
    );

    if (isPresent) {
      presentCount++;
      continue;
    }

    // 4. Mặc định là Vắng không phép
    unexcusedCount++;
  }

  if (validRecordsCount === 0) {
    return emptyResult;
  }

  const excusedCount = excusedSchoolCount + excusedOtherCount;
  const totalDeduction = (excusedOtherCount * 2) + (unexcusedCount * 10) + totalLateDeduction;
  const attendanceScore = Math.max(0, Math.min(100, Math.round((100 - totalDeduction) * 10) / 10));

  return {
    attendanceScore: attendanceScore,
    presentCount: presentCount,
    excusedCount: excusedCount,
    excusedSchoolCount: excusedSchoolCount,
    excusedOtherCount: excusedOtherCount,
    unexcusedCount: unexcusedCount,
    lateCount: lateCount,
    totalLateMinutes: totalLateMinutes,
    totalLateDeduction: Math.round(totalLateDeduction * 100) / 100,
    hasData: true
  };
}

/**
 * Tính tổng điểm cuối cùng sau khi cộng/trừ điểm điều chỉnh của đội trưởng.
 * Giới hạn nghiêm ngặt trong khoảng [0, 100], làm tròn 1 chữ số thập phân.
 *
 * @param {number|string} attendanceScore - Điểm chuyên cần tự động
 * @param {number|string} captainAdjustment - Điểm điều chỉnh của đội trưởng (+/-)
 * @returns {number} Điểm cuối cùng [0, 100]
 */
function calculateFinalScore(attendanceScore, captainAdjustment) {
  const base = (typeof attendanceScore === 'number' && !isNaN(attendanceScore))
    ? attendanceScore
    : (Number(attendanceScore) || 0);

  const adjustment = (typeof captainAdjustment === 'number' && !isNaN(captainAdjustment))
    ? captainAdjustment
    : (Number(captainAdjustment) || 0);

  const rawFinal = base + adjustment;
  return Math.max(0, Math.min(100, Math.round(rawFinal * 10) / 10));
}

/**
 * Xếp loại thành viên theo 5 bậc dựa trên tổng điểm cuối cùng.
 * - 100 điểm: Xuất sắc (EXCELLENT, #10b981)
 * - 80 đến 99.99 điểm: Giỏi (GOOD, #2563eb)
 * - 70 đến 79.99 điểm: Khá (FAIR, #0891b2)
 * - 50 đến 69.99 điểm: Cần xem lại (NEEDS_IMPROVEMENT, #d97706)
 * - Dưới 50 điểm (49.99 xuống 0): Nguy cơ cao (HIGH_RISK, #dc2626)
 *
 * @param {number|string} finalScore - Tổng điểm cuối cùng
 * @returns {Object} Thông tin xếp loại { tier, label, color, badgeClass }
 */
function getPerformanceTier(finalScore) {
  const score = (typeof finalScore === 'number' && !isNaN(finalScore))
    ? finalScore
    : (Number(finalScore) || 0);

  if (score >= 100) {
    return {
      tier: 'EXCELLENT',
      label: 'Xuất sắc',
      color: '#10b981',
      badgeClass: 'st-excellent'
    };
  }
  if (score >= 80) {
    return {
      tier: 'GOOD',
      label: 'Giỏi',
      color: '#2563eb',
      badgeClass: 'st-good'
    };
  }
  if (score >= 70) {
    return {
      tier: 'FAIR',
      label: 'Khá',
      color: '#0891b2',
      badgeClass: 'st-fair'
    };
  }
  if (score >= 50) {
    return {
      tier: 'NEEDS_IMPROVEMENT',
      label: 'Cần xem lại',
      color: '#d97706',
      badgeClass: 'st-warn'
    };
  }
  return {
    tier: 'HIGH_RISK',
    label: 'Nguy cơ cao',
    color: '#dc2626',
    badgeClass: 'st-danger'
  };
}

const TIERS = {
  EXCELLENT: 'EXCELLENT',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  NEEDS_IMPROVEMENT: 'NEEDS_IMPROVEMENT',
  HIGH_RISK: 'HIGH_RISK'
};

const PerformanceEngine = {
  calculateLateDeduction: calculateLateDeduction,
  parseLateMinutes: parseLateMinutes,
  isSchoolScheduleConflict: isSchoolScheduleConflict,
  calculateAttendanceScore: calculateAttendanceScore,
  calculateFinalScore: calculateFinalScore,
  getPerformanceTier: getPerformanceTier,
  TIERS: TIERS
};

// Xuất module tương thích môi trường Browser và CommonJS
if (typeof window !== 'undefined') {
  window.PerformanceEngine = PerformanceEngine;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PerformanceEngine = PerformanceEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceEngine;
}
