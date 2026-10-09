with open('admin.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Locate the exact start of <main class="content-area"> and end of </main>
main_start_tag = '<main class="content-area">'
main_end_tag = '</main>'

start_pos = html.find(main_start_tag)
end_pos = html.find(main_end_tag, start_pos)

if start_pos == -1 or end_pos == -1:
    print("Error: Could not find main tags!")
    exit(1)

clean_main_content = """<main class="content-area">

    <!-- ==========================================================
         VIEW 1: TỔNG QUAN (OVERVIEW)
         ========================================================== -->
    <section class="app-view active" id="view-overview">
      <div class="overview-layout">
        <!-- Hero Session Status Box -->
        <div class="card hero-session-card" id="heroSessionCard">
          <div class="hero-session-left">
            <div class="hero-session-icon" id="heroSessionIcon">⚡</div>
            <div>
              <div class="hero-session-title" id="heroSessionTitle">Phiên điểm danh hiện tại</div>
              <div class="hero-session-sub" id="heroSessionSubtitle">Đang kiểm tra trạng thái phiên điểm danh...</div>
            </div>
          </div>
          <div class="hero-session-actions" id="heroSessionActions">
            <button class="btn btn-primary" onclick="navTo('attendance')" id="btnHeroGoAttendance">Đi tới màn hình Điểm danh →</button>
          </div>
        </div>

        <!-- Dải KPI Cards (Khớp chính xác giao diện ảnh mẫu) -->
        <div class="kpi-grid">
          <div class="card kpi-card">
            <div class="kpi-top">
              <span class="kpi-label">TỔNG QUÂN SỐ</span>
              <span class="kpi-icon-badge purple-box">👥</span>
            </div>
            <div class="kpi-val text-dark" id="kpiTotalStudents">31</div>
            <div class="kpi-sub">Thành viên đội Robocon (23TD111)</div>
          </div>

          <div class="card kpi-card">
            <div class="kpi-top">
              <span class="kpi-label">TỈ LỆ CÓ MẶT</span>
              <span class="kpi-icon-badge green-box">📈</span>
            </div>
            <div class="kpi-val text-green" id="kpiPresentRate">57%</div>
            <div class="kpi-sub">Trung bình các phiên gần đây</div>
          </div>

          <div class="card kpi-card">
            <div class="kpi-top">
              <span class="kpi-label">TỈ LỆ VẮNG</span>
              <span class="kpi-icon-badge pink-box">📉</span>
            </div>
            <div class="kpi-val text-red" id="kpiAbsentRate">43%</div>
            <div class="kpi-sub">Cần cải thiện chuyên cần</div>
          </div>

          <div class="card kpi-card">
            <div class="kpi-top">
              <span class="kpi-label">LỊCH HỌC TRƯỜNG HÔM NAY</span>
              <span class="kpi-icon-badge blue-box">🏫</span>
            </div>
            <div class="kpi-val text-blue" id="kpiBusyCount">29</div>
            <div class="kpi-sub">SV có lịch học trên trường</div>
          </div>
        </div>

        <!-- LUẬT ĐIỂM DANH ROBOCON & GHI CHÚ (TẠO, SỬA, XÓA) -->
        <section class="card rules-widget-card" id="roboconRulesCard">
          <div class="rules-head">
            <div class="rules-title-wrap">
              <div class="rules-icon">📜</div>
              <div>
                <h3 class="rules-title">Luật điểm danh Robocon & Ghi chú xưởng</h3>
                <p class="rules-sub">Quy định giờ giấc, chấm công, trừ điểm chuyên cần và nội quy làm việc tại xưởng.</p>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary btn-sm" onclick="resetDefaultRoboconRules()">↻ Khôi phục mẫu</button>
              <button class="btn btn-primary btn-sm" onclick="openAddRuleModal()">＋ Thêm quy định / Ghi chú</button>
            </div>
          </div>

          <div class="rules-list" id="roboconRulesList"><div class="schedule-loading">Đang tải quy định...</div></div>
        </section>

        <!-- Bố cục Tổng quan: Tóm tắt quân số rảnh/bận & Phím tắt tác vụ nhanh -->
        <div class="overview-quick-grid">
          <!-- Thẻ Tóm tắt quân số rảnh/bận hôm nay -->
          <section class="card" style="padding:20px 22px">
            <div class="widget-head" style="margin-bottom:12px">
              <div class="widget-title-wrap">
                <span style="font-size:18px">🏫</span>
                <div>
                  <h3 class="widget-title" style="margin:0">Tình hình quân số hôm nay</h3>
                  <div style="font-size:11.5px;color:var(--muted)" id="overviewDateSummary">Thời gian thực giờ Việt Nam</div>
                </div>
              </div>
              <button class="btn btn-sm btn-secondary" onclick="navTo('schedules')">Xem chi tiết TKB →</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
              <div style="padding:12px;background:var(--ok-bg);border:1px solid rgba(15,122,74,0.2);border-radius:9px;text-align:center">
                <span style="font-size:11px;font-weight:800;color:var(--ok);text-transform:uppercase">Đang rảnh</span>
                <div style="font-size:24px;font-weight:800;color:var(--ok);line-height:1.2;margin:4px 0" id="overviewFreeCount">—</div>
                <span style="font-size:11px;color:var(--muted)">Sẵn sàng lên xưởng</span>
              </div>
              <div style="padding:12px;background:var(--err-bg);border:1px solid rgba(194,56,46,0.2);border-radius:9px;text-align:center">
                <span style="font-size:11px;font-weight:800;color:var(--err);text-transform:uppercase">Có lịch học</span>
                <div style="font-size:24px;font-weight:800;color:var(--err);line-height:1.2;margin:4px 0" id="overviewBusyCount">—</div>
                <span style="font-size:11px;color:var(--muted)">Có tiết học trường</span>
              </div>
            </div>
            <p style="font-size:12px;color:var(--muted);margin:0">Tiết học đã kết thúc trong ngày tự động tính là đang rảnh.</p>
          </section>

          <!-- Thẻ Phím tắt tác vụ nhanh -->
          <section class="card" style="padding:20px 22px">
            <h3 class="widget-title" style="margin:0 0 14px">⚡ Lối tắt tác vụ xưởng</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="quick-action-btn" onclick="navTo('attendance')">
                <span style="font-size:20px">📋</span>
                <div>
                  <div>Mở điểm danh</div>
                  <div style="font-size:11px;color:var(--muted);font-weight:500">Quét QR & chấm công</div>
                </div>
              </div>
              <div class="quick-action-btn" onclick="navTo('tasks')">
                <span style="font-size:20px">📌</span>
                <div>
                  <div>Nhiệm vụ xưởng</div>
                  <div style="font-size:11px;color:var(--muted);font-weight:500">Giao việc nhóm / cá nhân</div>
                </div>
              </div>
              <div class="quick-action-btn" onclick="navTo('teams')">
                <span style="font-size:20px">👥</span>
                <div>
                  <div>Quản lý nhóm</div>
                  <div style="font-size:11px;color:var(--muted);font-weight:500">Cơ khí, Mạch, Lập trình</div>
                </div>
              </div>
              <div class="quick-action-btn" onclick="navTo('zalo')">
                <span style="font-size:20px">🤖</span>
                <div>
                  <div>Lịch gửi Zalo</div>
                  <div style="font-size:11px;color:var(--muted);font-weight:500">Báo lịch rảnh ngày mai</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW 2: ĐIỂM DANH (ATTENDANCE)
         ========================================================== -->
    <section class="app-view" id="view-attendance">
      <!-- Màn hình khi CHƯA có phiên điểm danh đang mở: Form tạo phiên chuẩn -->
      <div id="emptyState" class="empty-layout" style="display:none">
        <section class="card session-create-card" id="attendanceSessionCreateCard" style="max-width:680px;margin:0 auto;padding:26px 28px">
          <div class="scc-header" style="margin-bottom:18px">
            <div class="scc-icon" style="width:44px;height:44px;font-size:22px">⚡</div>
            <div>
              <h2 class="scc-title" style="font-size:17px">Khởi tạo phiên điểm danh mới</h2>
              <p class="scc-sub">Mã QR đứng yên — thuận tiện chiếu máy chiếu cả buổi cho sinh viên quét.</p>
            </div>
          </div>

          <div class="session-form">
            <div class="form-field" style="margin-bottom:12px">
              <label for="quickName">Tên phiên điểm danh *</label>
              <input type="text" id="quickName" placeholder="VD: Buổi làm Robocon C503 - Ca Sáng" style="font-size:14px;padding:11px 14px">
            </div>
            <div class="form-row-2">
              <div class="form-field">
                <label for="quickDuration">Thời lượng phiên (phút)</label>
                <input type="number" id="quickDuration" value="90" min="1" style="font-size:14px;padding:11px 14px">
              </div>
              <button class="btn btn-primary btn-open-session" onclick="openSession()" style="padding:12px 20px;font-size:14px">▶ Bắt đầu phiên điểm danh</button>
            </div>
          </div>
        </section>
      </div>

      <!-- Màn hình khi ĐANG có phiên mở: Dashboard + QR + Bảng sinh viên -->
      <div class="dashboard" id="dashboard" style="display:none">
        <div class="card session-bar">
          <div class="session-bar-left">
            <span class="session-pill pill-on" id="sessionBarPill"><span class="net-dot"></span>Đang mở</span>
            <div style="min-width:0">
              <div class="session-bar-name" id="sessionBarName">—</div>
              <div class="session-bar-meta">
                <span>📅 <span id="sessionStartTime">—</span></span>
                <span>🔑 ID: <code id="sessionIdDisplay">—</code></span>
                <span>⏱ <span id="sessionDurationDisplay">—</span></span>
              </div>
            </div>
            <div class="countdown-chip" id="countdownChip">⏱ <span id="countdownText">--:--</span></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn" id="btnBackToActive" onclick="backFromPastSession()" style="display:none;background:var(--surface-2);border:1px solid var(--border);color:var(--text);font-weight:600">← Quay lại</button>
            <button class="btn btn-primary" id="btnReopenSession" onclick="confirmReopenSession()" style="display:none;background:var(--info);border:none;color:#fff;font-weight:700">🔄 Mở lại phiên</button>
            <button class="btn btn-danger" id="btnCloseSession" onclick="openCloseModal()">■ Đóng phiên</button>
          </div>
        </div>

        <div class="main-grid">
          <aside class="card qr-panel" id="qrPanel">
            <div class="qr-panel-title">Mã QR điểm danh</div>
            <div class="qr-frame"><div id="qrCanvas"></div></div>
            <div class="qr-timestamp">🔒 Sinh lúc <b id="qrBorn">—</b></div>
            <div class="qr-actions">
              <button class="btn btn-refresh" id="btnRefreshQr" onclick="regenerateQR()">🔄 Đổi QR</button>
              <button class="btn" onclick="toggleFullscreen()">⛶ Phóng to</button>
            </div>
            <div class="qr-hint">💡 QR này <b>đứng yên</b> cho đến khi bạn bấm "Đổi QR". Phù hợp chiếu máy chiếu.</div>
            <div class="qr-warning" id="qrWarning"><span>⚠️</span><span><b>Phiên sắp kết thúc.</b> Hãy nhắc sinh viên khẩn trương quét mã.</span></div>
          </aside>

          <section class="card main-panel">
            <div class="stats-grid">
              <div class="stat"><div class="stat-label">Tổng SV</div><div class="stat-num blue" id="statTotal">0</div></div>
              <div class="stat"><div class="stat-label">Có mặt</div><div class="stat-num green" id="statPresent">0</div></div>
              <div class="stat"><div class="stat-label">Đi muộn</div><div class="stat-num amber" id="statLate">0</div></div>
              <div class="stat"><div class="stat-label">Vắng K.phép</div><div class="stat-num red" id="statAbsent">0</div></div>
              <div class="stat"><div class="stat-label">Có phép</div><div class="stat-num purple" id="statExcused">0</div></div>
              <div class="stat" id="statUnmarkedCard" style="display:none"><div class="stat-label">Chưa quét</div><div class="stat-num gray" id="statUnmarked">0</div></div>
            </div>

            <div class="progress-wrap">
              <div class="progress-row">
                <span class="progress-lbl">Tỉ lệ điểm danh</span>
                <span class="progress-pct" id="progressPct">0%</span>
              </div>
              <div class="progress-track"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
            </div>

            <div class="feed-wrap">
              <div class="feed-header">
                <div class="feed-title"><span class="feed-live-dot"></span><span>Vừa điểm danh</span></div>
              </div>
              <div class="feed-list" id="feedList"><div class="feed-empty">Chưa có ai điểm danh</div></div>
            </div>

            <div class="session-tabs">
              <button class="session-tab active" id="tabBtnStudents" onclick="switchSessionTab('students')">📋 Danh sách điểm danh</button>
              <button class="session-tab" id="tabBtnAudit" onclick="switchSessionTab('audit')">🕒 Lịch sử thay đổi (Audit Log) <span id="auditLogCountBadge" style="font-size:11px;font-weight:800;padding:1px 7px;border-radius:99px;background:rgba(0,0,0,.07)">0</span></button>
            </div>

            <div id="studentsTabPanel">
              <div class="thead-block">
                <div class="thead-top">
                  <div>
                    <div class="thead-title">Danh sách sinh viên</div>
                    <div class="filters" id="filters">
                      <button class="filter active" data-status="all">Tất cả <span class="count">0</span></button>
                      <button class="filter" data-status="present">Có mặt <span class="count">0</span></button>
                      <button class="filter" data-status="late">Đi muộn <span class="count">0</span></button>
                      <button class="filter" data-status="absent">Vắng K.phép <span class="count">0</span></button>
                      <button class="filter" data-status="excused">Có phép <span class="count">0</span></button>
                      <button class="filter" data-status="unmarked" id="filterUnmarked" style="display:none">Chưa điểm danh <span class="count">0</span></button>
                    </div>
                  </div>
                  <div class="thead-actions">
                    <div class="search-wrap">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input type="text" id="searchInput" placeholder="Tìm tên hoặc MSSV...">
                    </div>
                    <button class="btn" style="background:#0ea5e9;color:#fff;border:none" onclick="copyAttendanceList()">📋 Copy</button>
                    <button class="btn btn-danger" onclick="confirmMarkAllAbsent()">✗ Vắng tất cả</button>
                    <button class="btn btn-success" onclick="confirmMarkAllPresent()">✓ Có mặt tất cả</button>
                  </div>
                </div>
              </div>

              <div class="tbl-wrap">
                <div class="tbl-scroll">
                  <table>
                    <thead><tr><th style="width:40%">Sinh viên</th><th style="width:18%">MSSV</th><th style="width:24%">Trạng thái</th><th style="width:18%">Thời gian</th></tr></thead>
                    <tbody id="studentTbody"></tbody>
                  </table>
                </div>
                <div class="pager">
                  <div class="pager-info" id="pagerInfo">—</div>
                  <div class="pager-ctrl">
                    <select id="pagerSize">
                      <option value="10">10 / trang</option>
                      <option value="20" selected>20 / trang</option>
                      <option value="50">50 / trang</option>
                      <option value="100">100 / trang</option>
                    </select>
                    <button class="pager-btn" id="pagerPrev">‹ Trước</button>
                    <span class="pager-info" style="padding:0 4px" id="pagerNum"><b>1</b>/1</span>
                    <button class="pager-btn" id="pagerNext">Sau ›</button>
                  </div>
                </div>
              </div>
            </div>

            <div id="auditLogPanel" style="display:none">
              <div class="tbl-wrap" style="padding:16px;background:var(--surface)">
                <div id="auditLogList">
                  <div style="text-align:center;padding:24px;color:var(--muted);font-style:italic">Đang tải lịch sử thay đổi...</div>
                </div>
              </div>
            </div>

            <div class="danger-zone">
              <div class="danger-zone-txt">
                <b>⚠️ Đóng phiên điểm danh</b>
                <p>Sau khi đóng, sinh viên không thể điểm danh được nữa.</p>
              </div>
              <button class="btn btn-danger" style="padding:9px 18px;font-size:13px" onclick="openCloseModal()">■ Đóng phiên</button>
            </div>
          </section>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW 3: QUẢN LÝ NHÓM (TEAMS)
         ========================================================== -->
    <section class="app-view" id="view-teams">
      <section class="card team-admin" id="teamManagement" style="margin:0">
        <div class="team-admin-head">
          <div>
            <div class="team-admin-title">👥 Danh sách nhóm & Phân ca</div>
            <div class="team-admin-sub">Tạo nhóm theo lĩnh vực, chọn đội trưởng và theo dõi lịch rảnh / bận của thành viên.</div>
          </div>
          <button class="btn btn-primary" onclick="openCreateTeamModal()">＋ Tạo nhóm mới</button>
        </div>
        <div id="teamGroupsList" class="team-groups-list"><div class="schedule-loading">Đang tải nhóm...</div></div>
      </section>
    </section>

    <!-- ==========================================================
         VIEW 4: NHIỆM VỤ (TASKS)
         ========================================================== -->
    <section class="app-view" id="view-tasks">
      <div class="tasks-header">
        <div>
          <h2 style="font-size:16.5px;font-weight:800;letter-spacing:-0.01em">📌 Quản lý nhiệm vụ xưởng & đội Robocon</h2>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">Phân công công việc theo nhóm hoặc cá nhân, theo dõi tiến độ và hạn hoàn thành.</p>
        </div>
        <button class="btn btn-primary" onclick="openCreateTaskModal()">＋ Giao nhiệm vụ mới</button>
      </div>

      <div class="tasks-tabs">
        <button class="tasks-tab active" id="tabTaskGroup" onclick="switchTaskTab('group')">
          👥 Nhiệm vụ chung (Nhóm/Xưởng) <span class="count-badge" id="countGroupTasks">0</span>
        </button>
        <button class="tasks-tab" id="tabTaskPersonal" onclick="switchTaskTab('personal')">
          👤 Nhiệm vụ cá nhân <span class="count-badge" id="countPersonalTasks">0</span>
        </button>
      </div>

      <div class="tasks-filter-bar">
        <div class="tasks-filter-item">
          <label>Nhóm:</label>
          <select id="taskFilterGroup" onchange="applyTaskFilters()">
            <option value="all">Tất cả nhóm</option>
          </select>
        </div>

        <div class="tasks-filter-item">
          <label>Trạng thái:</label>
          <select id="taskFilterStatus" onchange="applyTaskFilters()">
            <option value="all">Tất cả</option>
            <option value="todo">Chưa bắt đầu</option>
            <option value="doing">Đang làm</option>
            <option value="done">Hoàn thành</option>
          </select>
        </div>

        <div class="tasks-filter-item">
          <label>Ưu tiên:</label>
          <select id="taskFilterPriority" onchange="applyTaskFilters()">
            <option value="all">Tất cả</option>
            <option value="high">Cao 🔥</option>
            <option value="med">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
        </div>

        <div class="search-wrap" style="margin-left:auto">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="taskSearchInput" placeholder="Tìm tên nhiệm vụ..." oninput="applyTaskFilters()">
        </div>
      </div>

      <div class="tasks-grid" id="tasksListGrid"><div class="empty-state">Chọn mục Nhiệm vụ để tải dữ liệu.</div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW 5: LỊCH HỌC & RẢNH/BẬN (SCHEDULES)
         ========================================================== -->
    <section class="app-view" id="view-schedules">
      <div class="schedules-container">
        <!-- Header Ngày giờ thực tế & Thống kê nhanh -->
        <div class="sched-hero-header">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <h2 style="font-size:17px;font-weight:800;margin:0">📅 Thời khóa biểu & Sinh viên rảnh / bận hôm nay</h2>
              <span class="sched-time-badge" id="schedRealtimeHeader">🕒 Đang lấy giờ...</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin:4px 0 0">
              Trạng thái rảnh/bận tính theo giờ Việt Nam hiện tại. Tiết học đã kết thúc được tính là đang rảnh.
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="sched-pill-stat sched-pill-free" id="schedFreeCountBadge">🟢 0 Bạn rảnh</span>
            <span class="sched-pill-stat sched-pill-busy" id="schedBusyCountBadge">🔴 0 Bạn bận học</span>
            <button class="btn btn-secondary btn-sm" id="btnSyncME" onclick="syncSchedulesFromME()">🔄 Đồng bộ từ ME</button>
            <a href="lichhoc.html" class="btn btn-primary btn-sm">Xem lưới TKB tuần →</a>
          </div>
        </div>

        <!-- 2 Cột: Đang Rảnh vs Đang Bận học -->
        <div class="sched-split-grid">
          <!-- Cột Trái: Danh sách thành viên Đang Rảnh -->
          <div class="sched-panel">
            <div class="sched-panel-head">
              <div class="sched-panel-title">
                <span style="color:var(--ok)">🟢</span>
                <span>Thành viên đang rảnh</span>
                <span class="count-badge" id="schedFreeCount">0</span>
              </div>
              <span style="font-size:11.5px;color:var(--muted)">Không có lịch học lúc này</span>
            </div>
            <div id="schedFreeListWrap" style="max-height:600px;overflow-y:auto">
              <div class="schedule-loading">Đang phân tích lịch...</div>
            </div>
          </div>

          <!-- Cột Phải: Danh sách thành viên Bận học trường hôm nay -->
          <div class="sched-panel">
            <div class="sched-panel-head">
              <div class="sched-panel-title">
                <span style="color:var(--err)">🔴</span>
                <span>Thành viên có lịch học trường</span>
                <span class="count-badge" id="schedBusyCount">0</span>
              </div>
              <span style="font-size:11.5px;color:var(--muted)">Chi tiết môn học & ca học</span>
            </div>
            <div id="schedBusyListWrap" style="max-height:600px;overflow-y:auto">
              <div class="schedule-loading">Đang phân tích lịch...</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW 6: PHẢN HỒI ẨN DANH (FEEDBACK)
         ========================================================== -->
    <section class="app-view" id="view-feedback">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:16.5px;font-weight:800;letter-spacing:-0.01em">💬 Hộp thư phản hồi & Đóng góp ý kiến ẩn danh</h2>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">Tiếp nhận ý kiến đóng góp, báo cáo hỏng hóc hoặc đề xuất thiết bị từ thành viên xưởng.</p>
        </div>
        <button class="btn btn-secondary" onclick="window.open('checkin.html','_blank')">📝 Gửi phản hồi từ trang sinh viên</button>
      </div>

      <div class="fb-privacy-banner">
        <span style="font-size:18px">🛡️</span>
        <div>
          <b>Cam kết bảo mật danh tính tuyệt đối:</b> Giao diện và hệ thống hoàn toàn <u>không lưu hay hiển thị</u> tên, MSSV, IP hay bất kỳ thông tin nhận diện nào của người gửi.
        </div>
      </div>

      <div class="tasks-filter-bar">
        <div class="tasks-filter-item">
          <label>Loại ý kiến:</label>
          <select id="fbFilterType" onchange="applyFeedbackFilters()">
            <option value="all">Tất cả loại</option>
            <option value="gopy">💡 Góp ý xưởng</option>
            <option value="suco">⚠️ Báo hỏng / Sự cố</option>
            <option value="muasam">🛠 Đề xuất thiết bị</option>
            <option value="khac">💬 Khác</option>
          </select>
        </div>

        <div class="tasks-filter-item">
          <label>Trạng thái:</label>
          <select id="fbFilterStatus" onchange="applyFeedbackFilters()">
            <option value="all">Tất cả</option>
            <option value="new">Mới nhận</option>
            <option value="seen">Đã xem</option>
            <option value="resolved">Đã xử lý</option>
          </select>
        </div>
      </div>

      <div class="fb-list" id="feedbackList"><div class="empty-state">Đang tải phản hồi...</div></div>
    </section>

    <!-- ==========================================================
         VIEW 7: LỊCH GỬI ZALO (ZALO AUTOMATION)
         ========================================================== -->
    <section class="app-view" id="view-zalo">
      <section class="card" style="max-width:900px;margin:0 auto;padding:22px">
        <div style="margin-bottom:16px">
          <h2 style="font-size:17px;font-weight:800">📋 Lịch ngày mai để gửi Zalo</h2>
          <p style="font-size:12px;color:var(--muted);margin-top:5px">Đồng bộ lịch từ ME, xem trước ảnh gọn gồm người rảnh và bận, rồi tải ảnh để gửi vào Zalo.</p>
        </div>
        <button class="btn btn-primary" id="zaloSyncCopyButton" onclick="syncAndCreateZaloImage()">🔄 Đồng bộ lịch ngày mai & tạo ảnh</button>
        <div id="zaloImageStatus" style="margin-top:16px;color:var(--muted);font-size:13px">Bấm nút đồng bộ để tạo ảnh lịch.</div>
        <div id="zaloImageArea" hidden style="margin-top:16px">
          <img id="zaloImagePreview" alt="Ảnh lịch rảnh và bận ngày mai" style="display:block;width:100%;height:auto;border:1px solid var(--border);border-radius:14px;background:#f3f5f8">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <a class="btn btn-primary" id="zaloImageDownload" download="lich-ranh-ngay-mai.png">⬇ Tải ảnh PNG</a>
            <button class="btn" type="button" onclick="copyZaloCaption()">📋 Sao chép lời nhắn</button>
          </div>
          <div class="zalo-bubble" style="margin-top:12px">
            <div class="zalo-bubble-badge">📱 Lời nhắn gửi kèm ảnh</div>
            <div id="zaloCaptionPreview"></div>
          </div>
        </div>
      </section>
    </section>

    <!-- ==========================================================
         VIEW 8: LỊCH SỬ (HISTORY)
         ========================================================== -->
    <section class="app-view" id="view-history">
      <section class="card history-widget-card" style="margin:0">
        <div class="widget-head">
          <div>
            <div class="widget-title">🕒 Lịch sử các phiên điểm danh</div>
            <p class="widget-sub">Xem lại kết quả, sửa đổi và thống kê chuyên cần</p>
          </div>
          <div class="widget-actions">
            <button class="btn btn-danger" onclick="confirmDeleteHistory()">🗑 Xóa toàn bộ lịch sử</button>
            <button class="btn btn-icon" onclick="loadTodayHistory()">↻</button>
          </div>
        </div>
        <div class="history-list-wrap detail-list" id="historyFullList"><div class="schedule-loading">Đang tải lịch sử...</div></div>
      </section>
    </section>
"""

new_html = html[:start_pos] + clean_main_content + html[end_pos:]

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(new_html)

print("SUCCESS: Clean pristine views assembled with ZERO leak outside sections!")
