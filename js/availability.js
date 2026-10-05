/**
 * DIEM_DANH — js/availability.js
 * Tiện ích tính LỊCH RẢNH dùng chung cho trang Đội trưởng & Thành viên.
 *
 * Nguồn dữ liệu:
 *   1) lich_hoc_tong_hop.json — lịch học thực tế (Thu: 2..8, Buoi: 1..3)
 *   2) availability_blocks (DB) — khoảng bận do chính thành viên khai báo
 *
 * Quy tắc: thành viên RẢNH khi (không có lớp học) VÀ (không bị chặn).
 *
 * Yêu cầu: js/config.js + js/roles.js phải nạp TRƯỚC js/availability.js.
 */

// Cache lịch học trong bộ nhớ để không tải lại nhiều lần
let _timetableCache = null;

/** Tải & cache lich_hoc_tong_hop.json (mảng { mssv, schedule[] }) */
async function loadTimetable() {
  if (_timetableCache) return _timetableCache;
  try {
    const res = await fetch('lich_hoc_tong_hop.json?t=' + Date.now());
    if (!res.ok) throw new Error('Không tải được lich_hoc_tong_hop.json');
    _timetableCache = await res.json();
    if (!Array.isArray(_timetableCache)) _timetableCache = [];
    return _timetableCache;
  } catch (e) {
    console.warn('[loadTimetable]', e);
    _timetableCache = [];
    return _timetableCache = [];
  }
}

/** Làm mới cache lịch học (dùng sau khi cần dữ liệu mới nhất) */
function clearTimetableCache() {
  _timetableCache = null;
}

/**
 * Tìm môn học của một MSSV tại khung giờ (thu, buoi).
 * @returns {object|null} item trong schedule, hoặc null nếu rảnh
 */
async function findClassAt(mssv, thu, buoi) {
  if (!mssv || !thu) return null;
  const all = await loadTimetable();
  const stu = all.find((s) => s.mssv === mssv);
  if (!stu || !Array.isArray(stu.schedule)) return null;

  return stu.schedule.find((item) => {
    if (item.Thu !== Number(thu)) return false;
    if (buoi && item.Buoi !== Number(buoi)) return false;
    return true;
  }) || null;
}

/**
 * Kiểm tra một thành viên có rảnh tại khung (thu, buoi) hay không.
 * @param {string} mssv MSSV của thành viên
 * @param {number} thu  2..8
 * @param {number} buoi 1..3 (bỏ trống = cả ngày)
 * @param {Array} blocks Mảng khoảng bận đã khai báo của thành viên
 * @returns {Promise<{free:boolean, reason:string, classItem:object|null}>}
 */
async function checkMemberFree(mssv, thu, buoi, blocks = []) {
  // 1. Có lớp học không?
  const classItem = await findClassAt(mssv, thu, buoi);
  if (classItem) {
    return {
      free: false,
      reason: `Có lớp: ${classItem.TenMonHoc || 'Không rõ'}`,
      classItem,
    };
  }

  // 2. Có khoảng bận thủ công không?
  const blocked = (blocks || []).find(
    (b) => Number(b.thu) === Number(thu) && (!buoi || Number(b.buoi) === Number(buoi))
  );
  if (blocked) {
    return {
      free: false,
      reason: blocked.reason ? `Đã báo bận: ${blocked.reason}` : 'Đã báo bận',
      classItem: null,
    };
  }

  return { free: true, reason: 'Rảnh', classItem: null };
}

/**
 * Lấy lịch rảnh đầy đủ (7 thứ × 3 buổi) cho một danh sách thành viên.
 * @param {Array} members Mảng { user_id, mssv, full_name, blocks }
 * @param {number} thu   Chỉ tính một thứ (bỏ trống = cả tuần)
 * @returns {Promise<Object>} { 'thu-buoi': { free, reason } }
 */
async function buildAvailabilityMatrix(members, thu = null) {
  const matrix = {};
  const thuList = thu ? [Number(thu)] : [2, 3, 4, 5, 6, 7, 8];
  const buoiList = [1, 2, 3];

  for (const m of members) {
    for (const th of thuList) {
      for (const bu of buoiList) {
        const r = await checkMemberFree(m.mssv, th, bu, m.blocks);
        matrix[`${m.user_id}|${th}|${bu}`] = r;
      }
    }
  }

  return matrix;
}

/** Mô tả ngắn gọn trạng thái rảnh để hiển thị */
function freeLabel(free, reason) {
  if (free) return { text: 'Rảnh', cls: 'is-free', mark: '✓' };
  if (reason && reason.startsWith('Có lớp')) return { text: 'Có lớp', cls: 'is-busy-class', mark: '📚' };
  return { text: 'Bận', cls: 'is-busy', mark: '✕' };
}
