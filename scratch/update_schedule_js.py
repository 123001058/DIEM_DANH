with open('admin.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace loadTodaySchoolSchedule with an advanced, robust Vietnam-time free/busy calculator
old_func_start = html.find('async function loadTodaySchoolSchedule()')
old_func_end = html.find('async function syncSchedulesFromME', old_func_start)

new_func = """async function loadTodaySchoolSchedule(){
  const freeWrap = document.getElementById('schedFreeListWrap');
  const busyWrap = document.getElementById('schedBusyListWrap');
  const timeHeader = document.getElementById('schedRealtimeHeader');
  const freeBadge = document.getElementById('schedFreeCountBadge');
  const busyBadge = document.getElementById('schedBusyCountBadge');
  const freeCountEl = document.getElementById('schedFreeCount');
  const busyCountEl = document.getElementById('schedBusyCount');
  const ovFreeCount = document.getElementById('overviewFreeCount');
  const ovBusyCount = document.getElementById('overviewBusyCount');
  const ovDateSummary = document.getElementById('overviewDateSummary');
  const kpiBusyEl = document.getElementById('kpiBusyCount');

  try {
    const now = new Date();
    // Format Vietnam time header
    const vnDateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
    const vnTimeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    
    if (timeHeader) timeHeader.textContent = `🕒 ${vnDateStr} • ${vnTimeStr}`;
    if (ovDateSummary) ovDateSummary.textContent = `${vnDateStr} • ${vnTimeStr}`;

    const todayKey = getVietnamDateKey(0);
    const startStr = new Date(`${todayKey}T00:00:00+07:00`).toISOString();
    const endStr = new Date(new Date(startStr).getTime() + 86400000).toISOString();

    const { data, error } = await supabase
      .from('student_schedules')
      .select('mssv, subject_name, room_name, teacher_name, start_time, end_time')
      .gte('start_time', startStr)
      .lt('start_time', endStr)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Lỗi khi tải lịch học trường:', error);
      if (freeWrap) freeWrap.innerHTML = '<div class="schedule-loading">Không thể tải dữ liệu thời khóa biểu.</div>';
      if (busyWrap) busyWrap.innerHTML = '<div class="schedule-loading">Không thể tải dữ liệu thời khóa biểu.</div>';
      return;
    }

    const items = data || [];
    const allStudents = (students && students.length > 0) ? students : [
      { mssv: '123000555', name: 'Nguyễn Văn A' }, { mssv: '123000078', name: 'Huỳnh Tuấn Tú' },
      { mssv: '125001343', name: 'Dương Công Mạnh' }, { mssv: '123001058', name: 'Võ Duy Khang' },
      { mssv: '123000651', name: 'Nguyễn Văn Trung' }
    ];

    const studentMap = {};
    allStudents.forEach(s => { studentMap[s.mssv] = s.name; });

    // Group schedules by MSSV
    const scheduleByStudent = {};
    items.forEach(item => {
      if (!scheduleByStudent[item.mssv]) scheduleByStudent[item.mssv] = [];
      scheduleByStudent[item.mssv].push(item);
    });

    const nowMs = now.getTime();
    const freeList = [];
    const busyList = [];

    allStudents.forEach(s => {
      const sMssv = s.mssv;
      const sName = s.name || studentMap[sMssv] || sMssv;
      const sScheds = scheduleByStudent[sMssv] || [];

      if (sScheds.length === 0) {
        freeList.push({
          mssv: sMssv,
          name: sName,
          status: 'free_all_day',
          statusText: '🟢 Rảnh cả ngày',
          classes: []
        });
      } else {
        // Has classes today - check real-time state
        let currentlyInClass = false;
        let futureClasses = 0;
        let pastClasses = 0;

        const classDetails = sScheds.map(c => {
          const cStart = new Date(c.start_time).getTime();
          const cEnd = new Date(c.end_time).getTime();
          let stateTag = '';
          let stateClass = '';

          if (nowMs >= cStart && nowMs < cEnd) {
            currentlyInClass = true;
            stateTag = '🔴 Đang trong giờ học';
            stateClass = 'tag-busy-now';
          } else if (nowMs < cStart) {
            futureClasses++;
            stateTag = '⏳ Sắp học';
            stateClass = 'tag-busy-future';
          } else {
            pastClasses++;
            stateTag = '✅ Đã kết thúc';
            stateClass = 'tag-busy-past';
          }

          const tStart = new Date(c.start_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
          const tEnd = new Date(c.end_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

          return {
            subject: c.subject_name || 'Môn học',
            room: c.room_name || 'Chưa xếp phòng',
            teacher: c.teacher_name || '',
            timeRange: `${tStart} – ${tEnd}`,
            stateTag,
            stateClass,
            isCurrent: (nowMs >= cStart && nowMs < cEnd)
          };
        });

        if (currentlyInClass) {
          busyList.push({
            mssv: sMssv,
            name: sName,
            status: 'in_class',
            statusText: '🔴 Đang học',
            tagClass: 'tag-busy-now',
            classes: classDetails
          });
        } else if (futureClasses > 0) {
          busyList.push({
            mssv: sMssv,
            name: sName,
            status: 'upcoming_class',
            statusText: '⏳ Có ca học sắp tới',
            tagClass: 'tag-busy-future',
            classes: classDetails
          });
        } else {
          // All classes have ended -> Currently free!
          freeList.push({
            mssv: sMssv,
            name: sName,
            status: 'finished_classes',
            statusText: '🟢 Đã xong ca học (Đang rảnh)',
            classes: classDetails
          });
        }
      }
    });

    // Update counts
    const freeCount = freeList.length;
    const busyCount = busyList.length;
    const totalTodayClasses = Object.keys(scheduleByStudent).length;

    if (freeBadge) freeBadge.textContent = `🟢 ${freeCount} Bạn đang rảnh`;
    if (busyBadge) busyBadge.textContent = `🔴 ${busyCount} Bạn bận học`;
    if (freeCountEl) freeCountEl.textContent = freeCount;
    if (busyCountEl) busyCountEl.textContent = busyCount;
    if (ovFreeCount) ovFreeCount.textContent = freeCount;
    if (ovBusyCount) ovBusyCount.textContent = busyCount;
    if (kpiBusyEl) kpiBusyEl.textContent = totalTodayClasses || busyCount;

    // Render Free list
    if (freeWrap) {
      if (freeList.length === 0) {
        freeWrap.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">
            <div style="font-size:24px;margin-bottom:6px">📚</div>
            <b>Hiện tại toàn bộ thành viên đều đang có lịch học!</b>
          </div>`;
      } else {
        freeWrap.innerHTML = freeList.map(s => `
          <div class="sched-student-card">
            <div class="sched-card-top">
              <div>
                <span class="sched-student-name">${escapeHtml(s.name)}</span>
                <span class="sched-student-mssv">(${escapeHtml(s.mssv)})</span>
              </div>
              <span class="sched-status-tag tag-free-now">${escapeHtml(s.statusText)}</span>
            </div>
            ${s.classes && s.classes.length > 0 ? `
              <div class="sched-class-info">
                <span style="font-size:11.5px;color:var(--muted)">Đã hoàn thành ${s.classes.length} ca học trước đó trong ngày.</span>
              </div>` : ''}
          </div>
        `).join('');
      }
    }

    // Render Busy list
    if (busyWrap) {
      if (busyList.length === 0) {
        busyWrap.innerHTML = `
          <div style="padding:28px 16px;text-align:center;color:var(--muted);font-size:13px">
            <div style="font-size:26px;margin-bottom:6px">🎉</div>
            <b>Không có thành viên nào đang bận học lúc này!</b>
            <p style="font-size:12px;margin-top:4px;color:var(--faint)">Tất cả thành viên đều có thể tập trung tại xưởng.</p>
          </div>`;
      } else {
        busyWrap.innerHTML = busyList.map(s => `
          <div class="sched-student-card" style="${s.status === 'in_class' ? 'border-left:3px solid #dc2626' : ''}">
            <div class="sched-card-top">
              <div>
                <span class="sched-student-name">${escapeHtml(s.name)}</span>
                <span class="sched-student-mssv">(${escapeHtml(s.mssv)})</span>
              </div>
              <span class="sched-status-tag ${s.tagClass}">${escapeHtml(s.statusText)}</span>
            </div>
            <div class="sched-class-info">
              ${s.classes.map(c => `
                <div style="margin-bottom:4px">
                  <div class="sched-subject-line">📚 ${escapeHtml(c.subject)}</div>
                  <div class="sched-meta-line">
                    <span>⏱ ${c.timeRange}</span>
                    <span class="room-chip">🚪 ${escapeHtml(c.room)}</span>
                    <span class="sched-status-tag ${c.stateClass}" style="font-size:9.5px">${c.stateTag}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('');
      }
    }

  } catch (err) {
    console.error('loadTodaySchoolSchedule error:', err);
    if (freeWrap) freeWrap.innerHTML = '<div class="schedule-loading">Lỗi khi phân tích lịch học.</div>';
    if (busyWrap) busyWrap.innerHTML = '<div class="schedule-loading">Lỗi khi phân tích lịch học.</div>';
  }
}

"""

html = html[:old_func_start] + new_func + html[old_func_end:]

# Update showEmpty and showDashboard to update Hero card without showing forms on overview
html = html.replace(
"""function showEmpty(){
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-off';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đã đóng</span>';
  const navBadge = document.getElementById('navAttendanceBadge');
  if (navBadge) { navBadge.textContent = 'Đã đóng'; navBadge.style.background = 'rgba(0,0,0,0.06)'; navBadge.style.color = 'var(--muted)'; }
  
  const heroCard = document.getElementById('heroSessionCard');
  if (heroCard) {
    document.getElementById('heroSessionIcon').textContent = '⏹';
    document.getElementById('heroSessionTitle').textContent = 'Chưa có phiên điểm danh nào đang mở';
    document.getElementById('heroSessionSubtitle').textContent = 'Mở phiên mới bên dưới để bắt đầu điểm danh xưởng.';
    document.getElementById('heroSessionActions').innerHTML = '<button class="btn btn-primary" onclick="document.getElementById(\\'quickName\\').focus()">＋ Mở phiên mới</button>';
  }
  const createBox = document.getElementById('overviewSessionCreateBox');
  if (createBox) createBox.style.display = 'block';

  const btnBack = document.getElementById('btnBackToActive');
  if (btnBack) btnBack.style.display = 'none';
  clearInterval(countdownTimer);
  loadTodayHistory();
  loadTodaySchoolSchedule();
}""",
"""function showEmpty(){
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('topbarSessionPill').className = 'session-pill pill-off';
  document.getElementById('topbarSessionPill').innerHTML = '<span class="net-dot"></span><span>Đã đóng</span>';
  const navBadge = document.getElementById('navAttendanceBadge');
  if (navBadge) { navBadge.textContent = 'Đã đóng'; navBadge.style.background = 'rgba(0,0,0,0.06)'; navBadge.style.color = 'var(--muted)'; }
  
  const heroCard = document.getElementById('heroSessionCard');
  if (heroCard) {
    document.getElementById('heroSessionIcon').textContent = '⏹';
    document.getElementById('heroSessionTitle').textContent = 'Chưa có phiên điểm danh nào đang mở';
    document.getElementById('heroSessionSubtitle').textContent = 'Vào mục Điểm danh từ thanh menu để mở phiên và chiếu mã QR.';
    document.getElementById('heroSessionActions').innerHTML = '<button class="btn btn-primary" onclick="navTo(\\'attendance\\')">Tạo phiên điểm danh mới →</button>';
  }

  const btnBack = document.getElementById('btnBackToActive');
  if (btnBack) btnBack.style.display = 'none';
  clearInterval(countdownTimer);
  loadTodayHistory();
  loadTodaySchoolSchedule();
}""")

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("SUCCESS: Javascript schedule & view routing logic updated!")
