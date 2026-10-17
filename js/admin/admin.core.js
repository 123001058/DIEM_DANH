/* =====================================================================
   LH-NaviX Admin — admin.core.js
   Điều hướng view, sidebar, tiện ích dùng chung
   (Tách từ admin.html; các file nạp theo thứ tự, không đổi thứ tự.)
   ===================================================================== */

window.addEventListener('error', event => {
  console.error('[admin runtime error]', event.message, event.filename, event.lineno);
  const summary = document.getElementById('overviewGroupTasksSummary');
  if (summary && /Đang tải/.test(summary.textContent)) {
    summary.textContent = 'Trang gặp lỗi JavaScript. Mở Console để xem dòng lỗi đầu tiên.';
  }
});
window.addEventListener('unhandledrejection', event => {
  console.error('[admin unhandled rejection]', event.reason);
});
window.sleep = function(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};
function sleep(ms) {
  return window.sleep(ms);
}
/* ==========================================================
   VIEW ROUTING & SIDEBAR DRAWER CONTROLLER
   ========================================================== */
let currentView = 'overview';

const viewTitlesMap = {
  overview: 'Tổng quan hệ thống',
  attendance: 'Phiên điểm danh hiện tại & QR',
  history: 'Danh sách các phiên điểm danh',
  'face-cam': 'Camera Điểm danh ESP32',
  students: 'Quản lý nhóm & Sinh viên',
  tasks: 'Nhiệm vụ xưởng & Đội Robocon',
  leave: 'Quản lý đơn xin nghỉ',
  schedules: 'Thời khóa biểu ME',
  feedback: 'Phản hồi ẩn danh',
  'password-reset': 'Reset mật khẩu',
  zalo: 'Lịch rảnh / bận'
};

/* Ngăn trượt (accordion): bấm tiêu đề để mở/đóng, onOpen = hàm nạp dữ liệu khi vừa mở */
function toggleAcc(head, onOpen) {
  const open = head.parentElement.classList.toggle('open');
  head.setAttribute('aria-expanded', open);
  if (open && typeof onOpen === 'function') onOpen();
}
function openAttendanceReportPanel() { initializeAttendanceReportDates(); loadAttendanceReport(); }
function openHistoryAndReport() { initializeAttendanceReportDates(); loadAttendanceReport(); }
/* Khung TKB ME: chỉ nạp lichhoc.html lần đầu vào màn hình này (?embed=1 ẩn header của trang đó) */
function initMeTimetableFrame() {
  const f = document.getElementById('meTimetableFrame');
  if (f && !f.getAttribute('src')) f.src = 'lichhoc.html?embed=1';
}

function navTo(viewName) {
  if (viewName === 'teams') {
    navTo('students');
    if (typeof openTeamsListModal === 'function') openTeamsListModal();
    return;
  }

  currentView = viewName;
  document.querySelectorAll('.content-area > .app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(btn => btn.classList.remove('active'));

  const targetView = document.getElementById('view-' + viewName);
  if (targetView) targetView.classList.add('active');
  const targetNav = document.getElementById('nav-' + viewName);
  if (targetNav) targetNav.classList.add('active');

  // Đồng bộ trạng thái active trên Bottom Navigation Mobile
  document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });

  const pageTitle = document.getElementById('pageCurrentSection');
  if (pageTitle) pageTitle.textContent = viewTitlesMap[viewName] || 'Tổng quan';

  closeSidebar();

  if (viewName === 'history') {
    navTo('attendance');
    const rCard = document.getElementById('attendanceReportCard');
    if (rCard) rCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (viewName === 'attendance') {
    if (typeof openHistoryAndReport === 'function') openHistoryAndReport();
  } else if (viewName === 'overview' && typeof loadOverviewGroupTasks === 'function') loadOverviewGroupTasks();
  else if (viewName === 'face-cam') {
    if (typeof initFaceCamInAdmin === 'function') initFaceCamInAdmin();
    const stStatus = document.getElementById('faceCamSessionStatus');
    if (stStatus) {
      stStatus.textContent = currentSession?.id ? `Đang mở: "${currentSession.session_name}"` : '⚠️ Chưa có phiên mở';
      stStatus.style.color = currentSession?.id ? 'var(--ok)' : 'var(--err)';
    }
  }
  else if (viewName === 'students' && typeof loadStudentsManagement === 'function') loadStudentsManagement();
  else if (viewName === 'schedules') initMeTimetableFrame();
  else if (viewName === 'password-reset') loadPasswordResetView();
  else if (viewName === 'leave' && typeof loadLeaveManagement === 'function') loadLeaveManagement();
  else if (viewName === 'tasks') loadAdminTasks();
  else if (viewName === 'feedback') loadAdminFeedback();
  else if (viewName === 'zalo') initZaloScheduleView();
}

