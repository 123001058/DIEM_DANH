/**
 * DIEM_DANH — lichhoc.js
 * Quản lý & hiển thị Thời Khóa Biểu thông minh (Lưới tuần, Xem cả lớp, Xuất iCal, In PDF, Xuất Excel ma trận)
 */

(function () {
  'use strict';

  // State
  let allStudentsData = [];
  let currentStudent = null;
  let currentWeekIndex = 0; // 0-based
  let semesterWeeks = [];
  let currentView = 'grid'; // 'grid' | 'today' | 'list'
  let todaySelectedDate = new Date();

  // Color palette pool
  const PALETTES = [
    'theme-indigo',
    'theme-blue',
    'theme-teal',
    'theme-emerald',
    'theme-amber',
    'theme-orange',
    'theme-purple',
    'theme-rose'
  ];

  // Map subject name to a consistent color palette
  const subjectColorCache = new Map();
  function getSubjectTheme(subjectName) {
    if (!subjectName) return PALETTES[0];
    if (subjectColorCache.has(subjectName)) {
      return subjectColorCache.get(subjectName);
    }
    let hash = 0;
    for (let i = 0; i < subjectName.length; i++) {
      hash = (hash << 5) - hash + subjectName.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % PALETTES.length;
    const theme = PALETTES[idx];
    subjectColorCache.set(subjectName, theme);
    return theme;
  }

  // DOM Elements
  const studentSelect = document.getElementById('studentSelect');
  const studentSearch = document.getElementById('studentSearch');
  const studentInfoBadge = document.getElementById('studentInfoBadge');
  const weekLabel = document.getElementById('weekLabel');
  const weekDates = document.getElementById('weekDates');
  const btnPrevWeek = document.getElementById('btnPrevWeek');
  const btnNextWeek = document.getElementById('btnNextWeek');
  const btnCurrentWeek = document.getElementById('btnCurrentWeek');
  const timetableContainer = document.getElementById('timetableContainer');
  const todayContainer = document.getElementById('todayContainer');
  const listContainer = document.getElementById('listContainer');
  const freeTimeContainer = document.getElementById('freeTimeContainer');
  const tabGrid = document.getElementById('tabGrid');
  const tabToday = document.getElementById('tabToday');
  const tabFreeTime = document.getElementById('tabFreeTime');
  const tabList = document.getElementById('tabList');

  // Free Time Filter state
  let freeFilterThu = 2; // default: Thứ Hai (2)
  let freeFilterBuoi = 1; // default: Sáng (1)
  let freeFilterWeek = 'week'; // 'week' | 'all'

  // Format Date helpers
  function formatDateVN(date) {
    const d = ('0' + date.getDate()).slice(-2);
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }

  function formatShortDate(date) {
    const d = ('0' + date.getDate()).slice(-2);
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    return `${d}/${m}`;
  }

  // Chuyển đối tượng Date thành chuỗi 'YYYY-MM-DD' chuẩn giờ địa phương (tránh lỗi lệch ngày của toISOString)
  function toLocalDateStr(date) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
  }

  function parseISODateOnly(isoString) {
    if (!isoString) return new Date();
    // Handles format "2026-09-28T07:30:00"
    const parts = isoString.split('T')[0].split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }

  function formatTimeFromISO(isoString) {
    if (!isoString || !isoString.includes('T')) return '';
    return isoString.split('T')[1].slice(0, 5);
  }

  // Show Toast
  function showToast(msg) {
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'toast-msg';
    t.innerHTML = `<span>✓</span><span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 250);
    }, 2800);
  }

  // Generate Weeks from Semester Range
  function buildSemesterWeeks() {
    // Semester range: 28/09/2026 -> 29/11/2026 (9 weeks)
    // Find Monday of first week: 2026-09-28
    const startDate = new Date(2026, 8, 28); // Sep is month 8 in JS
    semesterWeeks = [];

    for (let w = 0; w < 10; w++) {
      const mon = new Date(startDate);
      mon.setDate(startDate.getDate() + w * 7);
      mon.setHours(0, 0, 0, 0);

      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      sun.setHours(23, 59, 59, 999); // Khớp trọn vẹn cả ngày Chủ Nhật

      // 7 days of the week: Mon -> Sun
      const days = [];
      for (let d = 0; d < 7; d++) {
        const curDay = new Date(mon);
        curDay.setDate(mon.getDate() + d);
        days.push(curDay);
      }

      semesterWeeks.push({
        index: w,
        weekNum: w + 1,
        startDate: mon,
        endDate: sun,
        label: `Tuần ${w + 1} (Học kỳ 1, 2026-2027)`,
        dateRangeText: `${formatDateVN(mon)} – ${formatDateVN(sun)}`,
        days: days
      });
    }

    // Determine current week by today's date
    const now = new Date();
    let matchedIndex = 0;
    for (let i = 0; i < semesterWeeks.length; i++) {
      const sw = semesterWeeks[i];
      if (now >= sw.startDate && now <= sw.endDate) {
        matchedIndex = i;
        break;
      }
    }
    currentWeekIndex = matchedIndex;
  }

  // Fetch data
  async function loadData() {
    // Tự động nhận diện sinh viên nếu đã đăng nhập
    try {
      if (typeof supabase !== 'undefined') {
        const { data: authData } = await supabase.auth.getSession();
        if (authData?.session?.user) {
          const { data: prof } = await supabase
            .from('profiles').select('mssv').eq('user_id', authData.session.user.id).maybeSingle();
          if (prof?.mssv) {
            localStorage.setItem('selected_tkb_mssv', prof.mssv);
          }
        }
      }
    } catch (e) {
      console.warn('[auth check lichhoc]', e);
    }

    try {
      const res = await fetch('lich_hoc_tong_hop.json?t=' + Date.now());
      if (!res.ok) throw new Error('Không thể tải file lich_hoc_tong_hop.json');
      allStudentsData = await res.json();

      buildSemesterWeeks();
      renderStudentDropdown();

      // Pick default student: check localStorage or default to 123001058
      const savedMssv = localStorage.getItem('selected_tkb_mssv') || '123001058';
      let target = allStudentsData.find(s => s.mssv === savedMssv);
      if (!target && allStudentsData.length > 0) target = allStudentsData[0];

      selectStudent(target);
      updateWeekUI();
      renderView();
    } catch (err) {
      console.error(err);
      if (timetableContainer) {
        timetableContainer.innerHTML = `
          <div class="tkb-empty-state">
            <p style="color:var(--err);font-weight:700;">Lỗi tải dữ liệu lịch học: ${err.message}</p>
            <p>Vui lòng đảm bảo server đang chạy và file lich_hoc_tong_hop.json có sẵn.</p>
          </div>
        `;
      }
    }
  }

  // Render Student Dropdown
  function renderStudentDropdown() {
    if (!studentSelect) return;
    studentSelect.innerHTML = '';

    const todayISO = toLocalDateStr(new Date());

    allStudentsData.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.mssv;
      const schedule = s.schedule || [];
      const total = schedule.length;
      const remaining = schedule.filter(it => it.ThoiGianBD.split('T')[0] >= todayISO).length;
      opt.textContent = `${s.name} (${s.mssv}) — Còn ${remaining}/${total} buổi`;
      studentSelect.appendChild(opt);
    });

    studentSelect.addEventListener('change', (e) => {
      const selected = allStudentsData.find(s => s.mssv === e.target.value);
      if (selected) {
        selectStudent(selected);
        renderView();
      }
    });

    if (studentSearch) {
      studentSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const found = allStudentsData.find(s =>
          s.mssv.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query)
        );
        if (found) {
          studentSelect.value = found.mssv;
          selectStudent(found);
          renderView();
        }
      });
    }
  }

  function selectStudent(student) {
    currentStudent = student;
    localStorage.setItem('selected_tkb_mssv', student.mssv);
    if (studentSelect) studentSelect.value = student.mssv;

    if (studentInfoBadge) {
      const schedule = student.schedule || [];
      const totalSessions = schedule.length;
      const uniqueSubjects = new Set(schedule.map(x => x.TenMonHoc)).size;

      // Tính số buổi đã diễn ra vs số buổi còn lại theo thời gian thực (tự động giảm theo từng ngày)
      const todayISO = toLocalDateStr(new Date());
      let pastCount = 0;
      let remainingCount = 0;

      schedule.forEach(item => {
        const itemDateStr = item.ThoiGianBD.split('T')[0];
        if (itemDateStr < todayISO) {
          pastCount++;
        } else {
          remainingCount++;
        }
      });

      studentInfoBadge.innerHTML = `
        <span>Sinh viên: <b>${student.name}</b></span>
        <span class="badge">MSSV: ${student.mssv}</span>
        <span class="badge">${uniqueSubjects} Môn học</span>
        <span class="badge" title="Tổng số buổi học trong toàn học kỳ">Tổng: ${totalSessions} buổi</span>
        <span class="badge" style="background:var(--ok-bg);color:var(--ok);" title="Số buổi học sắp tới (tự động giảm dần khi qua các ngày)">Còn lại: <b>${remainingCount}</b> buổi</span>
        <span class="badge" style="background:var(--surface-2);color:var(--muted);" title="Số buổi đã diễn ra trước hôm nay">Đã qua: ${pastCount} buổi</span>
      `;
    }
  }

  // Week Navigator Controls
  function updateWeekUI() {
    const cur = semesterWeeks[currentWeekIndex];
    if (!cur) return;

    if (weekLabel) weekLabel.textContent = cur.label;
    if (weekDates) weekDates.textContent = cur.dateRangeText;

    if (btnPrevWeek) btnPrevWeek.disabled = currentWeekIndex <= 0;
    if (btnNextWeek) btnNextWeek.disabled = currentWeekIndex >= semesterWeeks.length - 1;
  }

  if (btnPrevWeek) {
    btnPrevWeek.addEventListener('click', () => {
      if (currentWeekIndex > 0) {
        currentWeekIndex--;
        updateWeekUI();
        renderView();
      }
    });
  }

  if (btnNextWeek) {
    btnNextWeek.addEventListener('click', () => {
      if (currentWeekIndex < semesterWeeks.length - 1) {
        currentWeekIndex++;
        updateWeekUI();
        renderView();
      }
    });
  }

  if (btnCurrentWeek) {
    btnCurrentWeek.addEventListener('click', () => {
      buildSemesterWeeks();
      updateWeekUI();
      renderView();
      showToast('Đã quay về tuần học hiện tại');
    });
  }

  // Switch View
  function setView(viewName) {
    currentView = viewName;
    [tabGrid, tabToday, tabFreeTime, tabList].forEach(t => t && t.classList.remove('active'));

    timetableContainer.style.display = 'none';
    todayContainer.style.display = 'none';
    if (freeTimeContainer) freeTimeContainer.style.display = 'none';
    listContainer.style.display = 'none';

    const weekNavBlock = document.querySelector('.week-nav');

    if (viewName === 'grid') {
      if (tabGrid) tabGrid.classList.add('active');
      timetableContainer.style.display = 'block';
      if (weekNavBlock) weekNavBlock.style.display = 'flex';
      renderWeeklyGrid();
    } else if (viewName === 'today') {
      if (tabToday) tabToday.classList.add('active');
      todayContainer.style.display = 'block';
      if (weekNavBlock) weekNavBlock.style.display = 'none';
      renderClassToday();
    } else if (viewName === 'freetime') {
      if (tabFreeTime) tabFreeTime.classList.add('active');
      if (freeTimeContainer) freeTimeContainer.style.display = 'block';
      if (weekNavBlock) weekNavBlock.style.display = 'none';
      renderFreeTimeFilter();
    } else if (viewName === 'list') {
      if (tabList) tabList.classList.add('active');
      listContainer.style.display = 'block';
      if (weekNavBlock) weekNavBlock.style.display = 'none';
      renderSemesterList();
    }
  }

  if (tabGrid) tabGrid.addEventListener('click', () => setView('grid'));
  if (tabToday) tabToday.addEventListener('click', () => setView('today'));
  if (tabFreeTime) tabFreeTime.addEventListener('click', () => setView('freetime'));
  if (tabList) tabList.addEventListener('click', () => setView('list'));

  function renderView() {
    if (currentView === 'grid') renderWeeklyGrid();
    else if (currentView === 'today') renderClassToday();
    else if (currentView === 'freetime') renderFreeTimeFilter();
    else if (currentView === 'list') renderSemesterList();
  }

  // ==========================================================
  // RENDER 1: LƯỚI THỜI KHÓA BIỂU TUẦN (WEEKLY GRID)
  // ==========================================================
  function renderWeeklyGrid() {
    if (!currentStudent || !timetableContainer) return;

    const curWeek = semesterWeeks[currentWeekIndex];
    if (!curWeek) return;

    const todayStr = formatDateVN(new Date());

    const daysConfig = [
      { thuNum: 2, label: 'Thứ Hai', dayIndex: 0 },
      { thuNum: 3, label: 'Thứ Ba', dayIndex: 1 },
      { thuNum: 4, label: 'Thứ Tư', dayIndex: 2 },
      { thuNum: 5, label: 'Thứ Năm', dayIndex: 3 },
      { thuNum: 6, label: 'Thứ Sáu', dayIndex: 4 },
      { thuNum: 7, label: 'Thứ Bảy', dayIndex: 5 },
      { thuNum: 8, label: 'Chủ Nhật', dayIndex: 6 }
    ];

    const sessionsConfig = [
      { buoi: 1, name: 'Sáng', time: '07:30 – 11:25', icon: '🌅' },
      { buoi: 2, name: 'Chiều', time: '12:50 – 16:45', icon: '☀️' },
      { buoi: 3, name: 'Tối', time: '17:30 – 20:50', icon: '🌙' }
    ];

    // Filter student's schedule for this specific week dates
    const scheduleInWeek = (currentStudent.schedule || []).filter(item => {
      const itemDateStr = item.ThoiGianBD.split('T')[0];
      const weekStartStr = toLocalDateStr(curWeek.startDate);
      const weekEndStr = toLocalDateStr(curWeek.endDate);
      return itemDateStr >= weekStartStr && itemDateStr <= weekEndStr;
    });

    let html = `
      <table class="timetable-grid">
        <thead>
          <tr>
            <th class="col-session">Buổi / Tiết</th>
    `;

    daysConfig.forEach(d => {
      const dayDate = curWeek.days[d.dayIndex];
      const isToday = formatDateVN(dayDate) === todayStr;
      html += `
        <th>
          <div class="day-header ${isToday ? 'is-today' : ''}">
            <span class="day-name">${d.label}</span>
            <span class="day-date">${formatShortDate(dayDate)}</span>
            ${isToday ? '<span class="day-badge">Hôm nay</span>' : ''}
          </div>
        </th>
      `;
    });

    html += `
          </tr>
        </thead>
        <tbody>
    `;

    sessionsConfig.forEach(sess => {
      html += `
        <tr>
          <td class="session-cell">
            <div class="session-name">${sess.icon} ${sess.name}</div>
            <div class="session-time">${sess.time}</div>
          </td>
      `;

      daysConfig.forEach(d => {
        const dayDate = curWeek.days[d.dayIndex];
        const dayDateISO = toLocalDateStr(dayDate);

        // Find match in student's schedule
        const matches = scheduleInWeek.filter(it => {
          const itDate = it.ThoiGianBD.split('T')[0];
          return itDate === dayDateISO && it.Buoi === sess.buoi;
        });

        html += `<td class="slot-cell">`;
        if (matches.length === 0) {
          html += `<div class="slot-empty">—</div>`;
        } else {
          matches.forEach(item => {
            const theme = getSubjectTheme(item.TenMonHoc);
            const timeBD = formatTimeFromISO(item.ThoiGianBD);
            const timeKT = formatTimeFromISO(item.ThoiGianKT);
            const mapLink = item.GoogleMap
              ? `<a class="card-campus-link" href="${item.GoogleMap}" target="_blank" title="Xem trên Google Maps">📍 ${item.TenCoSo || 'Trường'}</a>`
              : `<span>📍 ${item.TenCoSo || 'Cơ sở'}</span>`;

            html += `
              <div class="subject-card ${theme}">
                <div class="card-top">
                  <div class="card-subject-name">${item.TenMonHoc}</div>
                  <span class="card-group">${item.TenNhom || ''}</span>
                </div>
                <div class="card-room-badge">
                  <span>Phòng:</span> <b>${item.TenPhong || 'Chưa rõ'}</b>
                </div>
                <div class="card-meta">
                  <div class="card-meta-item">
                    <span>👨‍🏫 ${item.GiaoVien || 'Giảng viên'}</span>
                  </div>
                  <div class="card-meta-item">
                    ${mapLink}
                  </div>
                  <div class="card-meta-item" style="color:var(--text);font-weight:700;">
                    <span>⏱ ${timeBD} – ${timeKT}</span>
                  </div>
                </div>
              </div>
            `;
          });
        }
        html += `</td>`;
      });

      html += `</tr>`;
    });

    html += `
        </tbody>
      </table>
    `;

    timetableContainer.innerHTML = html;
  }

  // ==========================================================
  // RENDER 2: LỊCH HỌC CẢ LỚP HÔM NAY (CLASS TODAY VIEW)
  // ==========================================================
  function renderClassToday() {
    if (!todayContainer) return;

    const dateStr = toLocalDateStr(todaySelectedDate);
    const displayDate = formatDateVN(todaySelectedDate);

    // Collect all sessions for all 29 students on this date
    // Group by unique subject + room + buoi
    const sessionMap = new Map();

    allStudentsData.forEach(student => {
      (student.schedule || []).forEach(item => {
        const itDate = item.ThoiGianBD.split('T')[0];
        if (itDate === dateStr) {
          const key = `${item.TenMonHoc}__${item.TenPhong}__${item.Buoi}`;
          if (!sessionMap.has(key)) {
            sessionMap.set(key, {
              info: item,
              students: []
            });
          }
          sessionMap.get(key).students.push({
            mssv: student.mssv,
            name: student.name
          });
        }
      });
    });

    const sessions = Array.from(sessionMap.values()).sort((a, b) => a.info.Buoi - b.info.Buoi);

    const totalStudentsInClassToday = new Set(
      sessions.flatMap(s => s.students.map(st => st.mssv))
    ).size;

    let html = `
      <div class="class-today-container">
        <div class="card today-header-card">
          <div>
            <h2 style="font-size:18px;font-weight:800;">Lịch học toàn lớp</h2>
            <p style="color:var(--muted);font-size:13px;margin-top:2px;">
              Xem những ai có lịch học vào ngày <b>${displayDate}</b>
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="date" id="classDatePicker" value="${dateStr}" style="width:170px;padding:8px 12px;font-size:13px;">
            <button class="btn-action" id="btnTodayPick">Hôm nay</button>
          </div>
          <div class="today-summary-stats">
            <div class="stat-chip">
              <span class="stat-num">${sessions.length}</span>
              <span class="stat-title">Lớp học diễn ra</span>
            </div>
            <div class="stat-chip">
              <span class="stat-num">${totalStudentsInClassToday} / ${allStudentsData.length}</span>
              <span class="stat-title">Sinh viên có lịch</span>
            </div>
          </div>
        </div>
    `;

    if (sessions.length === 0) {
      html += `
        <div class="tkb-empty-state card">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <h3 style="margin-bottom:6px;">Không có lớp học nào vào ngày ${displayDate}</h3>
          <p>Cả lớp được nghỉ hoặc chưa có lịch giảng dạy trong ngày này.</p>
        </div>
      `;
    } else {
      html += `<div class="class-session-grid">`;
      sessions.forEach(sess => {
        const it = sess.info;
        const buoiBadge = it.Buoi === 1
          ? '<span class="session-badge session-badge-morning">🌅 Sáng (07:30 - 11:25)</span>'
          : it.Buoi === 2
          ? '<span class="session-badge session-badge-afternoon">☀️ Chiều (12:50 - 16:45)</span>'
          : '<span class="session-badge session-badge-evening">🌙 Tối (17:30 - 20:50)</span>';

        const mapBtn = it.GoogleMap
          ? `<a href="${it.GoogleMap}" target="_blank" style="color:var(--info);font-weight:600;text-decoration:none;">📍 ${it.TenCoSo} ↗</a>`
          : `<span>📍 ${it.TenCoSo}</span>`;

        html += `
          <div class="class-session-card">
            <div class="session-header">
              <div class="session-subject-title">${it.TenMonHoc}</div>
              ${buoiBadge}
            </div>
            <div class="session-details">
              <div><b>Phòng:</b> <span style="color:var(--text);font-weight:800;">${it.TenPhong}</span></div>
              <div><b>Giảng viên:</b> ${it.GiaoVien}</div>
              <div><b>Nhóm:</b> ${it.TenNhom || '—'}</div>
              <div><b>Cơ sở:</b> ${mapBtn}</div>
            </div>
            <div class="student-list-box">
              <div class="student-list-title">Danh sách sinh viên tham gia (${sess.students.length}):</div>
              <div class="student-tags">
                ${sess.students.map(st => `
                  <span class="student-tag" title="MSSV: ${st.mssv}">
                    ${st.name} <small style="color:var(--muted)">(${st.mssv.slice(-4)})</small>
                  </span>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div>`;
    todayContainer.innerHTML = html;

    // Attach date picker events
    const picker = document.getElementById('classDatePicker');
    if (picker) {
      picker.addEventListener('change', (e) => {
        if (e.target.value) {
          const parts = e.target.value.split('-');
          todaySelectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          renderClassToday();
        }
      });
    }

    const btnToday = document.getElementById('btnTodayPick');
    if (btnToday) {
      btnToday.addEventListener('click', () => {
        todaySelectedDate = new Date();
        renderClassToday();
      });
    }
  }

  // ==========================================================
  // RENDER 2b: LỌC TÌM BẠN RẢNH THEO THỨ & BUỔI (FREE TIME FILTER)
  // ==========================================================
  function renderFreeTimeFilter() {
    if (!freeTimeContainer) return;

    const curWeek = semesterWeeks[currentWeekIndex] || semesterWeeks[0];
    const daysConfig = [
      { thuNum: 2, label: 'Thứ Hai', short: 'T2', dayIndex: 0 },
      { thuNum: 3, label: 'Thứ Ba', short: 'T3', dayIndex: 1 },
      { thuNum: 4, label: 'Thứ Tư', short: 'T4', dayIndex: 2 },
      { thuNum: 5, label: 'Thứ Năm', short: 'T5', dayIndex: 3 },
      { thuNum: 6, label: 'Thứ Sáu', short: 'T6', dayIndex: 4 },
      { thuNum: 7, label: 'Thứ Bảy', short: 'T7', dayIndex: 5 },
      { thuNum: 8, label: 'Chủ Nhật', short: 'CN', dayIndex: 6 }
    ];

    const sessionsConfig = [
      { buoi: 1, label: 'Sáng', time: '07:30 – 11:25', icon: '🌅' },
      { buoi: 2, label: 'Chiều', time: '12:50 – 16:45', icon: '☀️' },
      { buoi: 3, label: 'Tối', time: '17:30 – 20:50', icon: '🌙' },
      { buoi: 'all', label: 'Cả ngày', time: 'Tất cả các ca', icon: '📅' }
    ];

    // Determine target date or semester mode
    let targetDateStr = '';
    let targetDateDisplay = '';
    let scopeLabel = '';

    if (freeFilterWeek !== 'all' && curWeek) {
      const dayObj = daysConfig.find(d => d.thuNum === freeFilterThu);
      if (dayObj) {
        const d = curWeek.days[dayObj.dayIndex];
        targetDateStr = toLocalDateStr(d);
        targetDateDisplay = formatDateVN(d);
        scopeLabel = `${curWeek.label} (${targetDateDisplay})`;
      }
    } else {
      scopeLabel = 'Toàn bộ học kỳ';
    }

    // Filter students: free vs busy
    const freeStudents = [];
    const busyStudents = [];

    allStudentsData.forEach(st => {
      let isBusy = false;
      let busyReason = null;

      const schedule = st.schedule || [];

      if (freeFilterWeek !== 'all') {
        // Specific date in the selected week
        const match = schedule.find(item => {
          const itemDate = item.ThoiGianBD.split('T')[0];
          if (itemDate !== targetDateStr) return false;
          if (freeFilterBuoi === 'all') return true;
          return item.Buoi === freeFilterBuoi;
        });

        if (match) {
          isBusy = true;
          busyReason = match;
        }
      } else {
        // All semester on this Thu & Buoi
        const match = schedule.find(item => {
          if (item.Thu !== freeFilterThu) return false;
          if (freeFilterBuoi === 'all') return true;
          return item.Buoi === freeFilterBuoi;
        });

        if (match) {
          isBusy = true;
          busyReason = match;
        }
      }

      if (isBusy) {
        busyStudents.push({ student: st, busyItem: busyReason });
      } else {
        freeStudents.push(st);
      }
    });

    const activeThuObj = daysConfig.find(d => d.thuNum === freeFilterThu) || daysConfig[0];
    const activeBuoiObj = sessionsConfig.find(s => s.buoi === freeFilterBuoi) || sessionsConfig[0];

    let html = `
      <div class="freetime-wrapper">
        <div class="card freetime-filter-card">
          <div class="freetime-filter-header">
            <div>
              <h2>⚡ Tra cứu & Lọc người rảnh</h2>
              <p style="color:var(--muted);font-size:13px;margin-top:2px;">
                Chọn <b>Thứ</b> và <b>Buổi</b> để xem ngay những bạn không có lịch học (rảnh để họp / phân công).
              </p>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <label style="font-size:13px;font-weight:700;color:var(--muted);">Tuần:</label>
              <select id="freeWeekSelect" style="padding:7px 12px;font-size:13px;border-radius:var(--radius-sm);border:1.5px solid var(--border);background:var(--surface-2);color:var(--text);font-weight:600;">
    `;

    semesterWeeks.forEach((w, idx) => {
      const isSel = (freeFilterWeek !== 'all' && currentWeekIndex === idx) ? 'selected' : '';
      html += `<option value="${idx}" ${isSel}>${w.label} (${w.dateRangeText})</option>`;
    });
    html += `
                <option value="all" ${freeFilterWeek === 'all' ? 'selected' : ''}>-- Toàn học kỳ --</option>
              </select>
            </div>
          </div>

          <!-- Bước 1: Chọn Thứ -->
          <div class="freetime-section">
            <div class="freetime-section-title">
              <span>📅 BƯỚC 1: BẤM CHỌN THỨ</span>
            </div>
            <div class="freetime-pills" id="thuPillsGroup">
    `;

    daysConfig.forEach(d => {
      const isActive = d.thuNum === freeFilterThu ? 'active' : '';
      html += `
        <button type="button" class="freetime-pill ${isActive}" data-thu="${d.thuNum}">
          ${d.label}
        </button>
      `;
    });

    html += `
            </div>
          </div>

          <!-- Bước 2: Chọn Buổi -->
          <div class="freetime-section" style="margin-bottom:0;">
            <div class="freetime-section-title">
              <span>⏰ BƯỚC 2: CHỌN BUỔI (SÁNG / CHIỀU / TỐI)</span>
            </div>
            <div class="freetime-pills" id="buoiPillsGroup">
    `;

    sessionsConfig.forEach(s => {
      const isActive = s.buoi === freeFilterBuoi ? 'active' : '';
      html += `
        <button type="button" class="freetime-pill ${isActive}" data-buoi="${s.buoi}">
          ${s.icon} ${s.label} <span style="font-size:11px;opacity:0.8;">(${s.time})</span>
        </button>
      `;
    });

    html += `
            </div>
          </div>
        </div>

        <!-- Banner kết quả & Nút copy -->
        <div class="freetime-stats-banner card">
          <div class="freetime-counts">
            <div class="freetime-badge-free">
              <span>✓ RẢNH: <b>${freeStudents.length}</b> bạn</span>
            </div>
            <div class="freetime-badge-busy">
              <span>✕ BẬN: <b>${busyStudents.length}</b> bạn</span>
            </div>
            <span style="font-size:13px;color:var(--muted);font-weight:600;">
              Đang xem: <b>${activeBuoiObj.label} ${activeThuObj.label}</b> · ${scopeLabel}
            </span>
          </div>
          <button type="button" class="btn-action" id="btnCopyFreeList" style="font-weight:700;">
            📋 Sao chép danh sách rảnh (${freeStudents.length})
          </button>
        </div>

        <!-- Kết quả 2 cột -->
        <div class="freetime-columns">
          <!-- Cột Bạn Rảnh -->
          <div class="freetime-col-card col-free card">
            <div class="freetime-col-header">
              <div class="freetime-col-title" style="color:#059669;">
                <span>🟢 DANH SÁCH BẠN RẢNH (${freeStudents.length})</span>
              </div>
              <span style="font-size:12px;color:var(--muted);font-weight:600;">Không có lịch học</span>
            </div>
            <div class="freetime-student-list">
    `;

    if (freeStudents.length === 0) {
      html += `<div style="text-align:center;padding:30px;color:var(--muted);font-size:13.5px;">Không có ai rảnh vào thời gian này.</div>`;
    } else {
      freeStudents.forEach((st, idx) => {
        const initial = (st.name || 'S').trim().slice(-1).toUpperCase();
        html += `
          <div class="freetime-student-item">
            <div class="freetime-student-left">
              <div class="freetime-avatar" style="background:#ecfdf5;color:#059669;border-color:#a7f3d0;">${initial}</div>
              <div>
                <div class="freetime-student-name">${idx + 1}. ${st.name}</div>
                <div class="freetime-student-mssv">MSSV: ${st.mssv}</div>
              </div>
            </div>
            <span class="freetime-tag-free">✓ Rảnh</span>
          </div>
        `;
      });
    }

    html += `
            </div>
          </div>

          <!-- Cột Bạn Bận -->
          <div class="freetime-col-card col-busy card">
            <div class="freetime-col-header">
              <div class="freetime-col-title" style="color:#dc2626;">
                <span>🔴 DANH SÁCH BẠN BẬN (${busyStudents.length})</span>
              </div>
              <span style="font-size:12px;color:var(--muted);font-weight:600;">Có lịch học tại trường</span>
            </div>
            <div class="freetime-student-list">
    `;

    if (busyStudents.length === 0) {
      html += `<div style="text-align:center;padding:30px;color:var(--muted);font-size:13.5px;">Tất cả các bạn đều rảnh!</div>`;
    } else {
      busyStudents.forEach((item, idx) => {
        const st = item.student;
        const b = item.busyItem || {};
        const initial = (st.name || 'S').trim().slice(-1).toUpperCase();
        html += `
          <div class="freetime-student-item">
            <div class="freetime-student-left">
              <div class="freetime-avatar" style="background:#fef2f2;color:#dc2626;border-color:#fecaca;">${initial}</div>
              <div>
                <div class="freetime-student-name">${idx + 1}. ${st.name}</div>
                <div class="freetime-student-mssv">MSSV: ${st.mssv}</div>
              </div>
            </div>
            <div class="freetime-busy-info">
              <div class="freetime-busy-subject" title="${b.TenMonHoc || 'Có lịch học'}">${b.TenMonHoc || 'Đang học'}</div>
              <div class="freetime-busy-meta">Phòng ${b.TenPhong || '—'} · ${formatTimeFromISO(b.ThoiGianBD) || ''}</div>
            </div>
          </div>
        `;
      });
    }

    html += `
            </div>
          </div>
        </div>
      </div>
    `;

    freeTimeContainer.innerHTML = html;

    // Attach event listeners for Pills & Buttons
    const thuPills = freeTimeContainer.querySelectorAll('#thuPillsGroup .freetime-pill');
    thuPills.forEach(pill => {
      pill.addEventListener('click', () => {
        freeFilterThu = parseInt(pill.getAttribute('data-thu'), 10);
        renderFreeTimeFilter();
      });
    });

    const buoiPills = freeTimeContainer.querySelectorAll('#buoiPillsGroup .freetime-pill');
    buoiPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const v = pill.getAttribute('data-buoi');
        freeFilterBuoi = v === 'all' ? 'all' : parseInt(v, 10);
        renderFreeTimeFilter();
      });
    });

    const weekSel = freeTimeContainer.querySelector('#freeWeekSelect');
    if (weekSel) {
      weekSel.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'all') {
          freeFilterWeek = 'all';
        } else {
          freeFilterWeek = 'week';
          currentWeekIndex = parseInt(val, 10);
          updateWeekLabel();
        }
        renderFreeTimeFilter();
      });
    }

    const btnCopy = freeTimeContainer.querySelector('#btnCopyFreeList');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const lines = [
          `📋 DANH SÁCH BẠN RẢNH (${activeBuoiObj.label} ${activeThuObj.label} - ${scopeLabel}):`,
          `----------------------------------`
        ];
        freeStudents.forEach((st, i) => {
          lines.push(`${i + 1}. ${st.name} - MSSV: ${st.mssv}`);
        });
        lines.push(`\nTổng cộng: ${freeStudents.length} bạn rảnh.`);
        navigator.clipboard.writeText(lines.join('\n')).then(() => {
          showToast(`Đã sao chép danh sách ${freeStudents.length} bạn rảnh vào bộ nhớ tạm!`);
        }).catch(() => {
          showToast(`Đã chọn danh sách (vui lòng copy thủ công)`);
        });
      });
    }
  }

  // ==========================================================
  // RENDER 3: DANH SÁCH MÔN HỌC TOÀN KỲ (SEMESTER LIST)
  // ==========================================================
  function renderSemesterList() {
    if (!currentStudent || !listContainer) return;

    const list = currentStudent.schedule || [];

    let html = `
      <div class="list-view-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <div>
            <h2 style="font-size:17px;font-weight:800;">Danh sách toàn bộ các buổi học trong kỳ</h2>
            <p style="color:var(--muted);font-size:13px;">Sinh viên: <b>${currentStudent.name}</b> (MSSV: ${currentStudent.mssv})</p>
          </div>
          <span class="badge" style="background:var(--accent);color:#fff;padding:6px 12px;border-radius:8px;font-weight:700;">
            Tổng cộng: ${list.length} buổi học
          </span>
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Ngày học</th>
                <th>Thứ</th>
                <th>Buổi</th>
                <th>Tên môn học</th>
                <th>Phòng</th>
                <th>Giảng viên</th>
                <th>Cơ sở</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (list.length === 0) {
      html += `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted);">Chưa có lịch học nào.</td></tr>`;
    } else {
      list.forEach((it, idx) => {
        const d = parseISODateOnly(it.ThoiGianBD);
        const buoiText = it.Buoi === 1 ? 'Sáng' : it.Buoi === 2 ? 'Chiều' : 'Tối';
        const thuText = it.Thu === 8 ? 'Chủ Nhật' : `Thứ ${it.Thu}`;
        html += `
          <tr>
            <td>${idx + 1}</td>
            <td><b>${formatDateVN(d)}</b></td>
            <td>${thuText}</td>
            <td><span class="badge" style="font-size:11px;padding:2px 6px;">${buoiText}</span></td>
            <td><b>${it.TenMonHoc}</b> <small style="color:var(--muted);">${it.TenNhom || ''}</small></td>
            <td><b style="color:var(--accent);">${it.TenPhong}</b></td>
            <td>${it.GiaoVien}</td>
            <td>${it.TenCoSo}</td>
          </tr>
        `;
      });
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    listContainer.innerHTML = html;
  }

  // ==========================================================
  // EXPORT 1: TẢI FILE iCAL (.ics) ĐỒNG BỘ GOOGLE / APPLE CALENDAR
  // ==========================================================
  function exportICalendar() {
    if (!currentStudent || !currentStudent.schedule || currentStudent.schedule.length === 0) {
      showToast('Không có lịch học để xuất iCal');
      return;
    }

    const formatICalDate = (isoStr) => {
      // Input: "2026-09-28T07:30:00" -> Output: "20260928T073000"
      return isoStr.replace(/[-:]/g, '').split('.')[0];
    };

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DIEM_DANH//LHU Student Timetable//VI',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:TKB - ${currentStudent.name}`
    ];

    currentStudent.schedule.forEach(item => {
      const dtStart = formatICalDate(item.ThoiGianBD);
      const dtEnd = formatICalDate(item.ThoiGianKT);
      const summary = `${item.TenMonHoc} - Phòng ${item.TenPhong}`;
      const desc = `Môn học: ${item.TenMonHoc}\\nNhóm: ${item.TenNhom || ''}\\nPhòng: ${item.TenPhong}\\nGiảng viên: ${item.GiaoVien}\\nCơ sở: ${item.TenCoSo}`;
      const location = `${item.TenPhong}, ${item.TenCoSo}, ĐH Lạc Hồng`;

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:lhu_${currentStudent.mssv}_${item.ID}_${dtStart}@diemdanh.local`);
      icsContent.push(`DTSTAMP:${formatICalDate(new Date().toISOString())}Z`);
      icsContent.push(`DTSTART:${dtStart}`);
      icsContent.push(`DTEND:${dtEnd}`);
      icsContent.push(`SUMMARY:${summary}`);
      icsContent.push(`DESCRIPTION:${desc}`);
      icsContent.push(`LOCATION:${location}`);
      // Alarm 15 minutes before
      icsContent.push('BEGIN:VALARM');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Nhắc nhở lịch học: ${item.TenMonHoc}`);
      icsContent.push('TRIGGER:-PT15M');
      icsContent.push('END:VALARM');
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TKB_${currentStudent.mssv}_${currentStudent.name.replace(/\s+/g, '_')}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast(`Đã tải file lịch iCal! Hãy mở file để thêm vào Google/Apple Calendar.`);
  }

  // ==========================================================
  // EXPORT 2: XUẤT EXCEL MA TRẬN LỊCH TUẦN (HTML TABLE XLS)
  // ==========================================================
  function exportMatrixExcel() {
    if (!currentStudent || !currentStudent.schedule) {
      showToast('Không có dữ liệu');
      return;
    }

    const curWeek = semesterWeeks[currentWeekIndex];
    if (!curWeek) return;

    const daysConfig = [
      { thuNum: 2, label: 'Thứ Hai', dayIndex: 0 },
      { thuNum: 3, label: 'Thứ Ba', dayIndex: 1 },
      { thuNum: 4, label: 'Thứ Tư', dayIndex: 2 },
      { thuNum: 5, label: 'Thứ Năm', dayIndex: 3 },
      { thuNum: 6, label: 'Thứ Sáu', dayIndex: 4 },
      { thuNum: 7, label: 'Thứ Bảy', dayIndex: 5 },
      { thuNum: 8, label: 'Chủ Nhật', dayIndex: 6 }
    ];

    const sessionsConfig = [
      { buoi: 1, name: 'Sáng (07:30 - 11:25)' },
      { buoi: 2, name: 'Chiều (12:50 - 16:45)' },
      { buoi: 3, name: 'Tối (17:30 - 20:50)' }
    ];

    const scheduleInWeek = (currentStudent.schedule || []).filter(item => {
      const itemDateStr = item.ThoiGianBD.split('T')[0];
      const weekStartStr = toLocalDateStr(curWeek.startDate);
      const weekEndStr = toLocalDateStr(curWeek.endDate);
      return itemDateStr >= weekStartStr && itemDateStr <= weekEndStr;
    });

    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <style>
          th { background: #3b82f6; color: #ffffff; border: 1px solid #000; text-align: center; font-size: 11pt; padding: 6px; }
          td { border: 1px solid #cccccc; vertical-align: top; padding: 6px; font-size: 10pt; }
          .sess-col { background: #e5e7eb; font-weight: bold; text-align: center; }
          .subj-title { font-weight: bold; color: #1e3a8a; }
          .room { color: #b91c1c; font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>THỜI KHÓA BIỂU — ${currentStudent.name.toUpperCase()} (MSSV: ${currentStudent.mssv})</h2>
        <p><b>Thời gian:</b> ${curWeek.label} (${curWeek.dateRangeText})</p>
        <table border="1">
          <thead>
            <tr>
              <th style="width:120px;">Buổi</th>
    `;

    daysConfig.forEach(d => {
      const dayDate = curWeek.days[d.dayIndex];
      tableHtml += `<th style="width:160px;">${d.label}<br>(${formatDateVN(dayDate)})</th>`;
    });

    tableHtml += `</tr></thead><tbody>`;

    sessionsConfig.forEach(sess => {
      tableHtml += `<tr><td class="sess-col">${sess.name}</td>`;
      daysConfig.forEach(d => {
        const dayDate = curWeek.days[d.dayIndex];
        const dayDateISO = toLocalDateStr(dayDate);
        const matches = scheduleInWeek.filter(it => it.ThoiGianBD.split('T')[0] === dayDateISO && it.Buoi === sess.buoi);

        tableHtml += `<td>`;
        if (matches.length > 0) {
          matches.forEach(m => {
            tableHtml += `
              <div class="subj-title">${m.TenMonHoc}</div>
              <div class="room">Phòng: ${m.TenPhong}</div>
              <div>GV: ${m.GiaoVien}</div>
              <div>${m.TenCoSo}</div>
              <hr style="border:0.5px dashed #ddd;">
            `;
          });
        }
        tableHtml += `</td>`;
      });
      tableHtml += `</tr>`;
    });

    tableHtml += `</tbody></table></body></html>`;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TKB_MaTran_${currentStudent.mssv}_Tuan${currentWeekIndex + 1}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast(`Đã xuất file Excel dạng Lưới Ma trận Tuần!`);
  }

  // Export 3: In TKB / Lưu PDF
  function printTimetable() {
    window.print();
  }

  // Bind Export Buttons
  const btnExportICal = document.getElementById('btnExportICal');
  if (btnExportICal) btnExportICal.addEventListener('click', exportICalendar);

  const btnExportExcel = document.getElementById('btnExportExcel');
  if (btnExportExcel) btnExportExcel.addEventListener('click', exportMatrixExcel);

  const btnPrintTKB = document.getElementById('btnPrintTKB');
  if (btnPrintTKB) btnPrintTKB.addEventListener('click', printTimetable);

  // Initialize
  document.addEventListener('DOMContentLoaded', loadData);

})();
