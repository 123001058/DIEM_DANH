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
    if (typeof initFaceCamInAdmin === 'function') initFaceCamInAdmin(false);
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



/* ==========================================================
   HỆ THỐNG THÔNG BÁO & NHẮC VIỆC CHO ADMIN (NOTIFICATION CENTER)
   ========================================================== */
let adminPendingWorkData = {
  leaveCount: 0,
  resetCount: 0
};

function toggleAdminNotifyDropdown() {
  const dd = document.getElementById('adminNotifyDropdown');
  if (!dd) return;
  const isHidden = (dd.style.display === 'none' || !dd.style.display);
  dd.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    checkAdminPendingWork();
  }
}

// Tự động đóng dropdown khi click ra ngoài
document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.topbar-notify-wrap');
  const dd = document.getElementById('adminNotifyDropdown');
  if (dd && wrap && !wrap.contains(e.target)) {
    dd.style.display = 'none';
  }
});

async function checkAdminPendingWork() {
  const badgeBell = document.getElementById('adminNotifyBadge');
  const listEl = document.getElementById('adminNotifyList');
  const totalText = document.getElementById('adminNotifyTotalText');
  const navLeaveBadge = document.getElementById('navLeaveBadge');
  const navResetBadge = document.getElementById('navPasswordResetBadge');

  try {
    if (typeof supabase === 'undefined') return;

    // 1. Đếm đơn xin nghỉ chờ duyệt
    const { count: leaveCount } = await supabase.from('leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    // 2. Đếm yêu cầu đặt lại mật khẩu
    const { count: resetCount } = await supabase.from('password_reset_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const lCount = leaveCount || 0;
    const rCount = resetCount || 0;
    const total = lCount + rCount;

    adminPendingWorkData.leaveCount = lCount;
    adminPendingWorkData.resetCount = rCount;

    // Cập nhật Badge trên Menu bên trái
    if (navLeaveBadge) {
      navLeaveBadge.textContent = lCount;
      navLeaveBadge.style.background = lCount > 0 ? '#ef4444' : 'var(--surface-2)';
      navLeaveBadge.style.color = lCount > 0 ? '#ffffff' : 'var(--muted)';
      navLeaveBadge.style.fontWeight = lCount > 0 ? '800' : '600';
    }

    if (navResetBadge) {
      navResetBadge.textContent = rCount;
      navResetBadge.style.display = rCount > 0 ? 'inline-flex' : 'none';
      navResetBadge.style.background = '#f59e0b';
      navResetBadge.style.color = '#ffffff';
      navResetBadge.style.fontWeight = '800';
    }

    // Cập nhật Chuông Thông Báo trên Topbar
    if (badgeBell) {
      if (total > 0) {
        badgeBell.textContent = total;
        badgeBell.style.display = 'inline-block';
      } else {
        badgeBell.style.display = 'none';
      }
    }

    if (totalText) {
      totalText.textContent = total > 0 ? `${total} việc cần xử lý` : 'Đã xong hết';
    }

    // Render danh sách việc vào Dropdown
    if (listEl) {
      if (total === 0) {
        listEl.innerHTML = `
          <div style="text-align:center;padding:26px 12px;color:var(--muted);font-size:12px;">
            <div style="font-size:24px;margin-bottom:6px;">🎉</div>
            <div style="font-weight:700;color:var(--text);">Không có việc nào tồn đọng!</div>
            <div style="margin-top:2px;">Tất cả đơn xin nghỉ và yêu cầu đã được xử lý.</div>
          </div>
        `;
      } else {
        let itemsHtml = '';

        if (lCount > 0) {
          itemsHtml += `
            <div onclick="navTo('leave');toggleAdminNotifyDropdown()" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;background:var(--surface-2);border:1px solid var(--border);cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='var(--surface-2)'">
              <span style="font-size:20px;">📋</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;font-weight:700;color:var(--text);">Có <b>${lCount}</b> đơn xin nghỉ chờ duyệt</div>
                <div style="font-size:11px;color:var(--primary);margin-top:2px;">Bấm để vào duyệt đơn ngay →</div>
              </div>
              <span style="font-size:11px;font-weight:800;background:#ef4444;color:#fff;padding:2px 7px;border-radius:99px;">${lCount}</span>
            </div>
          `;
        }

        if (rCount > 0) {
          itemsHtml += `
            <div onclick="navTo('password-reset');toggleAdminNotifyDropdown()" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;background:var(--surface-2);border:1px solid var(--border);cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='var(--surface-2)'">
              <span style="font-size:20px;">🔑</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;font-weight:700;color:var(--text);">Có <b>${rCount}</b> sinh viên yêu cầu cấp lại mật khẩu</div>
                <div style="font-size:11px;color:var(--primary);margin-top:2px;">Bấm để xem và cấp lại →</div>
              </div>
              <span style="font-size:11px;font-weight:800;background:#f59e0b;color:#fff;padding:2px 7px;border-radius:99px;">${rCount}</span>
            </div>
          `;
        }

        listEl.innerHTML = itemsHtml;
      }
    }
  } catch (err) {
    console.warn('Lỗi kiểm tra việc pending admin:', err);
  }
}

// Khởi chạy kiểm tra ngay khi mở trang và lặp lại định kỳ mỗi 30s
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkAdminPendingWork, 1500);
  setInterval(checkAdminPendingWork, 30000);
});

/* ==========================================================
   QUẢN LÝ AVATAR (ẢNH ĐẠI DIỆN) ADMIN (THỰC TẾ 100%)
   ========================================================== */
// Chống lỗi HTML lồng modal sai: nếu một modal nằm bên trong modal khác
// (cha đang display:none) thì nó sẽ vô hình dù đã "mở" -> tự kéo ra body.
function repairNestedModals() {
  document.querySelectorAll('.modal-bg .modal-bg').forEach(m => document.body.appendChild(m));
}
document.addEventListener('DOMContentLoaded', repairNestedModals);

let adminCurrentUserId = null;
let adminCurrentMssv = '123001058';
let adminCurrentName = 'Nguyễn Khánh Hoà';
let pendingAdminAvatarDataUrl = null;

function applyAdminAvatar(avatarUrl, name) {
  const topEl = document.getElementById('topbarAvatar');
  const sideEl = document.getElementById('sidebarAvatar');
  const displayName = name || adminCurrentName || document.getElementById('adminName')?.textContent || 'Nguyễn Khánh Hoà';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'A';

  const effectiveUrl = avatarUrl 
    || localStorage.getItem('admin_custom_avatar') 
    || (adminCurrentUserId ? localStorage.getItem('admin_custom_avatar_' + adminCurrentUserId) : null);

  const content = effectiveUrl
    ? ('<img src="' + effectiveUrl + '" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">')
    : initial;

  if (topEl) topEl.innerHTML = content;
  if (sideEl) sideEl.innerHTML = content;
}

// Tự động nạp avatar admin ngay khi mở trang
document.addEventListener('DOMContentLoaded', () => {
  try {
    applyAdminAvatar();
  } catch (_) {}
});

async function loadAdminAvatar(userId, mssv, name) {
  if (userId) adminCurrentUserId = userId;
  if (mssv && mssv !== '—') adminCurrentMssv = mssv;
  if (name) adminCurrentName = name;

  // 1. Áp dụng ngay từ localStorage (nếu có) để UI hiện tức thì không bị giật
  const savedAvatar = localStorage.getItem('admin_custom_avatar') || (userId ? localStorage.getItem('admin_custom_avatar_' + userId) : null);
  if (savedAvatar) {
    applyAdminAvatar(savedAvatar, adminCurrentName);
  }

  // 2. Tải avatar từ Database Supabase (bảng students)
  if (typeof supabase !== 'undefined') {
    try {
      const targetMssv = (adminCurrentMssv && adminCurrentMssv !== '—') ? adminCurrentMssv : '123001058';
      const { data: st } = await supabase.from('students').select('avatar').eq('mssv', targetMssv).maybeSingle();
      if (st?.avatar) {
        localStorage.setItem('admin_custom_avatar', st.avatar);
        if (userId) localStorage.setItem('admin_custom_avatar_' + userId, st.avatar);
        applyAdminAvatar(st.avatar, adminCurrentName);
        return;
      }
    } catch (e) {
      console.warn('[Admin Avatar] Lỗi nạp avatar từ Supabase:', e);
    }
  }

  // 3. Fallback nếu chưa có avatar
  if (!savedAvatar) {
    applyAdminAvatar(null, adminCurrentName);
  }
}

function triggerAdminAvatarChange() {
  if (typeof closeSidebar === 'function') closeSidebar();
  let fileInput = document.getElementById('adminAvatarFileInput');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'adminAvatarFileInput';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.style.display = 'none';
    fileInput.onchange = handleAdminAvatarSelectedDirect;
    document.body.appendChild(fileInput);
  }
  fileInput.click();
}
// Alias để tương thích ngược mọi nơi gọi
window.openAdminAvatarModal = triggerAdminAvatarChange;
window.closeAdminAvatarModal = function() {};

async function handleAdminAvatarSelectedDirect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    if (typeof toast === 'function') toast('info', 'Đang cập nhật', 'Đang cắt và tối ưu hóa ảnh đại diện Admin...');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Không thể tải định dạng ảnh này'));
    });

    // Cắt vuông tâm (Center-Crop) và resize về 256x256 để tối ưu tốc độ và dung lượng
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const size = Math.min(img.width, img.height);
    const sx = (img.width - size) / 2;
    const sy = (img.height - size) / 2;

    ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.88);

    const targetMssv = (adminCurrentMssv && adminCurrentMssv !== '—') ? adminCurrentMssv : '123001058';

    // 1. Cập nhật ngay UI và LocalStorage
    localStorage.setItem('admin_custom_avatar', croppedDataUrl);
    if (adminCurrentUserId) {
      localStorage.setItem('admin_custom_avatar_' + adminCurrentUserId, croppedDataUrl);
    }
    applyAdminAvatar(croppedDataUrl, adminCurrentName);

    // 2. Lưu vào Supabase qua RPC chuyên dụng
    let savedToCloud = false;
    if (typeof supabase !== 'undefined') {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_update_avatar', {
          p_mssv: targetMssv,
          p_avatar: croppedDataUrl
        });
        if (!rpcErr && rpcRes?.ok) {
          savedToCloud = true;
        } else {
          await supabase.rpc('admin_set_my_avatar', { p_avatar: croppedDataUrl });
          savedToCloud = true;
        }
      } catch (cloudErr) {
        console.warn('[Admin Avatar] Lỗi RPC Supabase:', cloudErr);
      }
    }

    if (typeof toast === 'function') {
      toast('ok', 'Đã đổi ảnh đại diện!', savedToCloud ? 'Đã lưu avatar vào Database thành công.' : 'Ảnh đại diện Admin đã được cập nhật.');
    }

    // 3. NỀN: Tải lên Storage Supabase để lưu URL bền vững
    setTimeout(async () => {
      try {
        if (typeof supabase === 'undefined') return;
        const res = await fetch(croppedDataUrl);
        const blob = await res.blob();
        const path = targetMssv + '/avatar.jpg';

        const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

        if (!upErr) {
          const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
          const finalUrl = pub?.publicUrl ? (pub.publicUrl + '?t=' + Date.now()) : null;
          if (finalUrl) {
            await supabase.rpc('admin_update_avatar', { p_mssv: targetMssv, p_avatar: finalUrl });
            localStorage.setItem('admin_custom_avatar', finalUrl);
            if (adminCurrentUserId) localStorage.setItem('admin_custom_avatar_' + adminCurrentUserId, finalUrl);
            applyAdminAvatar(finalUrl, adminCurrentName);
          }
        }
      } catch (bgErr) {
        console.warn('[Admin Avatar] Background storage sync:', bgErr);
      }
    }, 200);

  } catch (err) {
    console.error('Lỗi lưu avatar admin:', err);
    if (typeof toast === 'function') toast('err', 'Lỗi lưu avatar', err.message || 'Không thể cập nhật ảnh.');
  } finally {
    event.target.value = '';
  }
}

// Tự động nạp trước mô hình Face AI ở nền để khi mở phiên điểm danh là camera sẵn sàng ngay
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof initFaceCamInAdmin === 'function' && typeof adminFaceModelsLoaded !== 'undefined' && !adminFaceModelsLoaded) {
      initFaceCamInAdmin(true);
    }
  }, 2500);
});
