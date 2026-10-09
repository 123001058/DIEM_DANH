import re

with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update CSS to include styles for Tasks, Feedback, Zalo, and Enhanced Team Cards
extra_css = """
/* ==========================================================
   NHIỆM VỤ (TASKS STYLES)
   ========================================================== */
.tasks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.tasks-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.tasks-tab {
  padding: 10px 18px;
  border: none;
  background: transparent;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: .15s;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.tasks-tab:hover { color: var(--text); }
.tasks-tab.active { color: var(--text); border-bottom-color: var(--text); }

.tasks-filter-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.tasks-filter-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tasks-filter-item label {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  margin: 0;
  text-transform: uppercase;
}
.tasks-filter-item select, .tasks-filter-item input {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border-strong);
  background: var(--surface);
}

.tasks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}
.task-card {
  padding: 16px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s;
  position: relative;
}
.task-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: var(--border-strong);
}
.task-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.task-title {
  font-size: 14px;
  font-weight: 800;
  line-height: 1.35;
  color: var(--text);
}
.task-badge-priority {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 99px;
  text-transform: uppercase;
  flex: none;
}
.priority-high { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; }
.priority-med { background: #fef3c7; color: #d97706; border: 1px solid #fde68a; }
.priority-low { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }

.task-desc {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.task-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
  font-size: 11.5px;
  background: var(--surface-2);
  padding: 8px 10px;
  border-radius: 8px;
}
.task-meta-row { display: flex; flex-direction: column; }
.task-meta-lbl { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
.task-meta-val { font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.task-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border);
  padding-top: 10px;
  margin-top: auto;
  gap: 8px;
  flex-wrap: wrap;
}
.task-status-chip {
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 99px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.status-todo { background: var(--surface-2); color: var(--muted); border: 1px solid var(--border-strong); }
.status-doing { background: var(--info-bg); color: var(--info); border: 1px solid rgba(42,91,215,0.2); }
.status-done { background: var(--ok-bg); color: var(--ok); border: 1px solid rgba(15,122,74,0.2); }
.status-review { background: #f3e8ff; color: #7c3aed; border: 1px solid rgba(124,58,237,0.2); }

/* ==========================================================
   PHẢN HỒI ẨN DANH (FEEDBACK STYLES)
   ========================================================== */
.fb-privacy-banner {
  padding: 12px 16px;
  background: linear-gradient(135deg, #eef2ff, #e0e7ff);
  border: 1px solid #c7d2fe;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 12.5px;
  color: #3730a3;
  font-weight: 600;
}
.fb-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fb-item {
  padding: 16px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.15s ease;
}
.fb-item:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}
.fb-item-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.fb-anon-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 800;
  color: var(--muted);
  background: var(--surface-2);
  padding: 3px 9px;
  border-radius: 99px;
}
.fb-type-badge {
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
}
.type-gopy { background: #e0f2fe; color: #0369a1; }
.type-suco { background: #fee2e2; color: #b91c1c; }
.type-muasam { background: #fef3c7; color: #b45309; }
.type-khac { background: #f3e8ff; color: #6b21a8; }

.fb-text {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text);
  background: var(--surface-2);
  padding: 10px 14px;
  border-radius: 8px;
  border-left: 3px solid var(--text);
}
.fb-item-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11.5px;
  color: var(--muted);
  gap: 10px;
  flex-wrap: wrap;
}

/* ==========================================================
   LỊCH GỬI ZALO (ZALO AUTOMATION STYLES)
   ========================================================== */
.zalo-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 16px;
}
@media (max-width: 960px) { .zalo-grid { grid-template-columns: 1fr; } }

.switch-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 14px;
}
.switch-control {
  position: relative;
  display: inline-block;
  width: 46px;
  height: 24px;
  flex: none;
}
.switch-control input { opacity: 0; width: 0; height: 0; }
.switch-slider {
  position: absolute; cursor: pointer; inset: 0;
  background-color: var(--border-strong);
  transition: .3s;
  border-radius: 99px;
}
.switch-slider:before {
  position: absolute; content: "";
  height: 18px; width: 18px; left: 3px; bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.switch-control input:checked + .switch-slider { background-color: var(--ok); }
.switch-control input:checked + .switch-slider:before { transform: translateX(22px); }

.zalo-bubble {
  background: #e8f3ff;
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  padding: 16px 18px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 13px;
  line-height: 1.6;
  color: #0f172a;
  box-shadow: 0 4px 14px -4px rgba(37,99,235,0.15);
  position: relative;
  white-space: pre-wrap;
}
.zalo-bubble-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #0068ff;
  color: #fff;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  margin-bottom: 8px;
}

/* Enhanced Team Schedule Timing Badges */
.schedule-tag-ongoing {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
  font-weight: 800;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  animation: pulse 1.6s ease-out infinite;
}
.schedule-tag-upcoming {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
  font-weight: 700;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}
"""

# Insert extra_css into </style>
content = content.replace('</style>', extra_css + '\n</style>')

# 2. Add Navigation Items to Sidebar Drawer
nav_items_old = """    <button class="sidebar-nav-item" id="nav-teams" onclick="navTo('teams')">
      <span class="nav-icon">👥</span>
      <span class="nav-label">Nhóm & Phân ca</span>
    </button>
    <button class="sidebar-nav-item" id="nav-schedules" onclick="navTo('schedules')">
      <span class="nav-icon">📅</span>
      <span class="nav-label">Lịch học & Rảnh/Bận</span>
    </button>
    <button class="sidebar-nav-item" id="nav-history" onclick="navTo('history')">
      <span class="nav-icon">🕒</span>
      <span class="nav-label">Lịch sử phiên</span>
    </button>"""

nav_items_new = """    <button class="sidebar-nav-item" id="nav-teams" onclick="navTo('teams')">
      <span class="nav-icon">👥</span>
      <span class="nav-label">Quản lý nhóm</span>
    </button>
    <button class="sidebar-nav-item" id="nav-tasks" onclick="navTo('tasks')">
      <span class="nav-icon">📌</span>
      <span class="nav-label">Nhiệm vụ</span>
      <span class="nav-badge" id="navTasksBadge">5</span>
    </button>
    <button class="sidebar-nav-item" id="nav-schedules" onclick="navTo('schedules')">
      <span class="nav-icon">📅</span>
      <span class="nav-label">Lịch học & Rảnh/Bận</span>
    </button>
    <button class="sidebar-nav-item" id="nav-feedback" onclick="navTo('feedback')">
      <span class="nav-icon">💬</span>
      <span class="nav-label">Phản hồi ẩn danh</span>
    </button>
    <button class="sidebar-nav-item" id="nav-zalo" onclick="navTo('zalo')">
      <span class="nav-icon">🤖</span>
      <span class="nav-label">Lịch gửi Zalo</span>
    </button>
    <button class="sidebar-nav-item" id="nav-history" onclick="navTo('history')">
      <span class="nav-icon">🕒</span>
      <span class="nav-label">Lịch sử phiên</span>
    </button>"""

content = content.replace(nav_items_old, nav_items_new)

# 3. Add Views for Tasks, Feedback, and Zalo
new_views = """
    <!-- ==========================================================
         VIEW: NHIỆM VỤ (TASKS)
         ========================================================== -->
    <section class="app-view" id="view-tasks">
      <div class="tasks-header">
        <div>
          <h2 style="font-size:16.5px;font-weight:800;letter-spacing:-0.01em">📌 Quản lý nhiệm vụ xưởng & đội Robocon</h2>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">Phân công công việc theo nhóm hoặc cá nhân, theo dõi tiến độ và hạn hoàn thành.</p>
        </div>
        <button class="btn btn-primary" onclick="openCreateTaskModal()">＋ Giao nhiệm vụ mới</button>
      </div>

      <!-- Task Tabs -->
      <div class="tasks-tabs">
        <button class="tasks-tab active" id="tabTaskGroup" onclick="switchTaskTab('group')">
          👥 Nhiệm vụ chung (Nhóm/Xưởng) <span class="count-badge" id="countGroupTasks">3</span>
        </button>
        <button class="tasks-tab" id="tabTaskPersonal" onclick="switchTaskTab('personal')">
          👤 Nhiệm vụ cá nhân <span class="count-badge" id="countPersonalTasks">2</span>
        </button>
      </div>

      <!-- Task Filters Bar -->
      <div class="tasks-filter-bar">
        <div class="tasks-filter-item">
          <label>Nhóm:</label>
          <select id="taskFilterGroup" onchange="applyTaskFilters()">
            <option value="all">Tất cả nhóm</option>
            <option value="Cơ khí">Đội Cơ khí</option>
            <option value="Lập trình">Đội Lập trình - AI</option>
            <option value="Mạch - Điện">Đội Phần cứng - Điện tử</option>
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

      <!-- Tasks Grid List -->
      <div class="tasks-grid" id="tasksListGrid">
        <!-- Sample Interactive Tasks -->
        <div class="task-card" data-type="group" data-group="Cơ khí" data-status="doing" data-priority="high">
          <div class="task-card-top">
            <span class="task-title">Gia công khung gầm Robot tự hành v2</span>
            <span class="task-badge-priority priority-high">Cao 🔥</span>
          </div>
          <p class="task-desc">Cắt nhôm định hình 2020, phay mặt bích động cơ bước và lắp ráp hoàn chỉnh hệ thống treo bánh omni.</p>
          <div class="task-meta-grid">
            <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Admin (Võ Duy Khang)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Nhóm / Lĩnh vực</span><span class="task-meta-val">Đội Cơ khí</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">Toàn đội Cơ khí (4 SV)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val" style="color:var(--err)">12/10/2026 (Còn 3 ngày)</span></div>
          </div>
          <div class="task-card-footer">
            <span class="task-status-chip status-doing">⏳ Đang làm</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" onclick="showTaskDetail('Gia công khung gầm Robot tự hành v2', 'Cắt nhôm định hình 2020, phay mặt bích động cơ bước và lắp ráp hoàn chỉnh hệ thống treo bánh omni.', 'Đội Cơ khí', 'Toàn đội Cơ khí', 'Cao', '12/10/2026', 'Đang làm')">Chi tiết</button>
              <button class="btn btn-sm btn-success" onclick="quickUpdateTaskStatus(this, 'done')">✓ Hoàn tất</button>
            </div>
          </div>
        </div>

        <div class="task-card" data-type="group" data-group="Lập trình" data-status="doing" data-priority="high">
          <div class="task-card-top">
            <span class="task-title">Tối ưu thuật toán quét LiDAR & Định vị SLAM</span>
            <span class="task-badge-priority priority-high">Cao 🔥</span>
          </div>
          <p class="task-desc">Xử lý lọc nhiễu pointcloud từ cảm biến LiDAR RPLIDAR A1 và kết hợp bộ lọc Kalman cho IMU 9 trục.</p>
          <div class="task-meta-grid">
            <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Đội trưởng (Huỳnh Tuấn Tú)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Nhóm / Lĩnh vực</span><span class="task-meta-val">Lập trình - AI</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">Cả nhóm Lập trình</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val">15/10/2026</span></div>
          </div>
          <div class="task-card-footer">
            <span class="task-status-chip status-doing">⏳ Đang làm</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" onclick="showTaskDetail('Tối ưu thuật toán quét LiDAR & Định vị SLAM', 'Xử lý lọc nhiễu pointcloud từ cảm biến LiDAR RPLIDAR A1 và kết hợp bộ lọc Kalman cho IMU 9 trục.', 'Lập trình - AI', 'Cả nhóm Lập trình', 'Cao', '15/10/2026', 'Đang làm')">Chi tiết</button>
              <button class="btn btn-sm btn-success" onclick="quickUpdateTaskStatus(this, 'done')">✓ Hoàn tất</button>
            </div>
          </div>
        </div>

        <div class="task-card" data-type="group" data-group="Mạch - Điện" data-status="todo" data-priority="med">
          <div class="task-card-top">
            <span class="task-title">Layout bo mạch nguồn công suất Driver DC</span>
            <span class="task-badge-priority priority-med">Trung bình</span>
          </div>
          <p class="task-desc">Thiết kế mạch in PCB 2 lớp chịu tải 24V 30A với cầu H BTS7960 và cách ly quang opto PC817.</p>
          <div class="task-meta-grid">
            <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Admin (Võ Duy Khang)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Nhóm / Lĩnh vực</span><span class="task-meta-val">Mạch - Điện tử</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">Toàn đội Phần cứng</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val">18/10/2026</span></div>
          </div>
          <div class="task-card-footer">
            <span class="task-status-chip status-todo">⚪ Chưa bắt đầu</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" onclick="showTaskDetail('Layout bo mạch nguồn công suất Driver DC', 'Thiết kế mạch in PCB 2 lớp chịu tải 24V 30A với cầu H BTS7960 và cách ly quang opto PC817.', 'Mạch - Điện tử', 'Toàn đội Phần cứng', 'Trung bình', '18/10/2026', 'Chưa bắt đầu')">Chi tiết</button>
              <button class="btn btn-sm btn-primary" onclick="quickUpdateTaskStatus(this, 'doing')">▶ Bắt đầu</button>
            </div>
          </div>
        </div>

        <div class="task-card" data-type="personal" data-group="Cơ khí" data-status="doing" data-priority="med">
          <div class="task-card-top">
            <span class="task-title">Vẽ 3D cụm gắp bóng khí nén trên SolidWorks</span>
            <span class="task-badge-priority priority-med">Trung bình</span>
          </div>
          <p class="task-desc">Thiết kế ngàm kẹp 3 chấu ăn khớp xi lanh dẫn hướng SMC và xuất file in 3D nhựa PETG.</p>
          <div class="task-meta-grid">
            <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Đội trưởng Cơ khí</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Nhóm</span><span class="task-meta-val">Cơ khí</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">Dương Công Mạnh (125001343)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val">11/10/2026</span></div>
          </div>
          <div class="task-card-footer">
            <span class="task-status-chip status-doing">⏳ Đang làm</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" onclick="showTaskDetail('Vẽ 3D cụm gắp bóng khí nén trên SolidWorks', 'Thiết kế ngàm kẹp 3 chấu ăn khớp xi lanh dẫn hướng SMC và xuất file in 3D nhựa PETG.', 'Cơ khí', 'Dương Công Mạnh (125001343)', 'Trung bình', '11/10/2026', 'Đang làm')">Chi tiết</button>
              <button class="btn btn-sm btn-success" onclick="quickUpdateTaskStatus(this, 'done')">✓ Xong</button>
            </div>
          </div>
        </div>

        <div class="task-card" data-type="personal" data-group="Lập trình" data-status="done" data-priority="low">
          <div class="task-card-top">
            <span class="task-title">Cấu hình kết nối ESP32 Kiosk điểm danh vào Wifi</span>
            <span class="task-badge-priority priority-low">Thấp</span>
          </div>
          <p class="task-desc">Nạp firmware test HTTP POST gửi mã quét thẻ từ RFID RC522 về server Supabase.</p>
          <div class="task-meta-grid">
            <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Admin (Võ Duy Khang)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Nhóm</span><span class="task-meta-val">Lập trình</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">Nguyễn Văn Trung (123000651)</span></div>
            <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val">09/10/2026</span></div>
          </div>
          <div class="task-card-footer">
            <span class="task-status-chip status-done">✓ Đã hoàn thành</span>
            <button class="btn btn-sm" onclick="showTaskDetail('Cấu hình kết nối ESP32 Kiosk điểm danh vào Wifi', 'Nạp firmware test HTTP POST gửi mã quét thẻ từ RFID RC522 về server Supabase.', 'Lập trình', 'Nguyễn Văn Trung (123000651)', 'Thấp', '09/10/2026', 'Đã hoàn thành')">Chi tiết</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW: PHẢN HỒI ẨN DANH (FEEDBACK)
         ========================================================== -->
    <section class="app-view" id="view-feedback">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:16.5px;font-weight:800;letter-spacing:-0.01em">💬 Hộp thư phản hồi & Đóng góp ý kiến ẩn danh</h2>
          <p style="font-size:12px;color:var(--muted);margin-top:2px">Tiếp nhận ý kiến đóng góp, báo cáo hỏng hóc hoặc đề xuất thiết bị từ thành viên xưởng.</p>
        </div>
        <button class="btn btn-secondary" onclick="openStudentFeedbackModal()">📝 Thử gửi phản hồi ẩn danh (Demo SV)</button>
      </div>

      <div class="fb-privacy-banner">
        <span style="font-size:18px">🛡️</span>
        <div>
          <b>Cam kết bảo mật danh tính tuyệt đối:</b> Giao diện và hệ thống hoàn toàn <u>không lưu hay hiển thị</u> tên, MSSV, IP hay bất kỳ thông tin nhận diện nào của người gửi.
        </div>
      </div>

      <!-- Filters for Feedback -->
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

      <div class="fb-list" id="feedbackList">
        <div class="fb-item" data-type="muasam" data-status="new">
          <div class="fb-item-top">
            <span class="fb-anon-tag">🔒 Người gửi ẩn danh #FB-8842</span>
            <span class="fb-type-badge type-muasam">🛠 Đề xuất mua sắm</span>
          </div>
          <div class="fb-text">
            Xưởng đang thiếu mỏ hàn thiếc mũi nhọn và chì hàn không chì loại tốt. Đội mạch hàn IC dán rất khó thao tác vì mũi hàn cũ bị mòn. Nhờ Admin đề xuất trường cấp thêm 2 bộ hàn Hakko T12 ạ.
          </div>
          <div class="fb-item-bottom">
            <span>📅 Gửi lúc 10:15 hôm nay (09/10/2026)</span>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="task-status-chip status-doing">🔵 Mới nhận</span>
              <button class="btn btn-sm btn-success" onclick="markFeedbackResolved(this)">✓ Đánh dấu đã xử lý</button>
            </div>
          </div>
        </div>

        <div class="fb-item" data-type="suco" data-status="seen">
          <div class="fb-item-top">
            <span class="fb-anon-tag">🔒 Người gửi ẩn danh #FB-8839</span>
            <span class="fb-type-badge type-suco">⚠️ Báo cáo sự cố</span>
          </div>
          <div class="fb-text">
            Ổ cắm điện ở góc bàn gia công cơ khí bị lỏng chân cắm và có hiện tượng xẹt tia lửa điện khi cắm máy cắt cầm tay. Các bạn cẩn thận khi sử dụng khu vực này.
          </div>
          <div class="fb-item-bottom">
            <span>📅 Gửi lúc 16:40 hôm qua (08/10/2026)</span>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="task-status-chip status-review">🟡 Đã xem</span>
              <button class="btn btn-sm btn-success" onclick="markFeedbackResolved(this)">✓ Đánh dấu đã xử lý</button>
            </div>
          </div>
        </div>

        <div class="fb-item" data-type="gopy" data-status="resolved">
          <div class="fb-item-top">
            <span class="fb-anon-tag">🔒 Người gửi ẩn danh #FB-8812</span>
            <span class="fb-type-badge type-gopy">💡 Góp ý xưởng</span>
          </div>
          <div class="fb-text">
            Đề xuất xưởng mình phân ca trực dọn dẹp vệ sinh vào cuối mỗi buổi làm, tránh để phoi nhôm và dây điện vương vãi trên sàn nhà gây nguy hiểm.
          </div>
          <div class="fb-item-bottom">
            <span>📅 Gửi lúc 09:20 ngày 06/10/2026</span>
            <span class="task-status-chip status-done">🟢 Đã xử lý (Đã dán bảng phân ca dọn xưởng)</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ==========================================================
         VIEW: LỊCH GỬI ZALO (ZALO AUTOMATION)
         ========================================================== -->
    <section class="app-view" id="view-zalo">
      <div style="margin-bottom:16px">
        <h2 style="font-size:16.5px;font-weight:800;letter-spacing:-0.01em">🤖 Cài đặt tự động gửi lịch rảnh ngày mai lên Zalo</h2>
        <p style="font-size:12px;color:var(--muted);margin-top:2px">Tự động tổng hợp danh sách thành viên rảnh vào ngày mai và gửi tin nhắn lên nhóm Zalo xưởng vào khung giờ cố định.</p>
      </div>

      <div class="zalo-grid">
        <!-- Cột Cài đặt -->
        <div style="display:flex;flex-direction:column;gap:14px">
          <section class="card" style="padding:20px 22px">
            <div class="switch-wrap">
              <label class="switch-control">
                <input type="checkbox" id="zaloAutoToggle" checked onchange="toggleZaloAuto(this.checked)">
                <span class="switch-slider"></span>
              </label>
              <div>
                <b style="font-size:13.5px;display:block" id="zaloSwitchLabel">Tự động gửi lịch hàng ngày: ĐANG BẬT</b>
                <span style="font-size:11.5px;color:var(--muted)">Hệ thống sẽ quét thời khóa biểu ngày mai và tự động phát thông báo.</span>
              </div>
            </div>

            <div class="form-field" style="margin-bottom:12px">
              <label for="zaloSendHour">Khung giờ gửi hàng ngày:</label>
              <input type="time" id="zaloSendHour" value="20:00" style="font-weight:700;font-size:15px;width:160px">
            </div>

            <div class="form-field" style="margin-bottom:16px">
              <label for="zaloGroupSelect">Nhóm Zalo nhận thông báo:</label>
              <select id="zaloGroupSelect">
                <option value="g1">👥 Nhóm Zalo: Robocon 2026 - Xưởng C503 (Chính thức)</option>
                <option value="g2">👥 Nhóm Zalo: Đội Trọng Điểm LH-NaviX</option>
                <option value="g3">👥 Nhóm Zalo: Ban Cố Vấn & Admin</option>
              </select>
            </div>

            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" onclick="toast('ok', 'Đã lưu cài đặt', 'Lịch tự động Zalo được đặt lúc 20:00 hàng ngày.')">💾 Lưu cấu hình</button>
              <button class="btn btn-secondary" onclick="simulateZaloSend()">🧪 Gửi thử tin nhắn ngay</button>
            </div>
          </section>

          <!-- Bảng lịch sử gửi Zalo -->
          <section class="card" style="padding:20px 22px">
            <h3 style="font-size:14px;font-weight:800;margin-bottom:12px">📜 Lịch sử các lần tự động gửi tin</h3>
            <div class="tbl-wrap">
              <table>
                <thead><tr><th>Thời gian</th><th>Nhóm nhận</th><th>Trạng thái</th></tr></thead>
                <tbody id="zaloHistoryTbody">
                  <tr><td>Hôm nay 20:00</td><td>Robocon 2026 - C503</td><td><span class="team-availability free">✓ Thành công (22 rảnh)</span></td></tr>
                  <tr><td>08/10 20:00</td><td>Robocon 2026 - C503</td><td><span class="team-availability free">✓ Thành công (19 rảnh)</span></td></tr>
                  <tr><td>07/10 20:00</td><td>Robocon 2026 - C503</td><td><span class="team-availability busy">✕ Mất kết nối Bot</span></td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- Cột Xem trước tin nhắn Zalo -->
        <div>
          <section class="card" style="padding:20px 22px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <div class="widget-title">📱 Khung xem trước tin nhắn Zalo</div>
              <button class="btn btn-sm" onclick="generateZaloPreviewText()">↻ Cập nhật mẫu</button>
            </div>
            
            <div class="zalo-bubble">
              <div class="zalo-bubble-badge">💬 Tin nhắn Zalo Bot</div>
<div id="zaloMessagePreview">[THÔNG BÁO LỊCH RẢNH NGÀY MAI - THỨ BẢY 10/10]
🤖 Xưởng Robocon LH-NaviX (Phòng C503)

✅ THÀNH VIÊN RẢNH CẢ NGÀY (18 bạn):
 • Võ Duy Khang (123001058)
 • Dương Công Mạnh (125001343)
 • Nguyễn Văn Trung (123000651)
 • Phan Nhật Nam (124000534)
 • ... và 14 thành viên khác

⚠️ THÀNH VIÊN CÓ LỊCH HỌC TRƯỜNG (4 bạn):
 • Huỳnh Tuấn Tú: Bận Tiết 1-4 (Phòng G306)
 • Trần Minh Trí: Bận Tiết 6-9 (Phòng C203)

📌 Lưu ý: Các bạn rảnh có mặt đúng 07:30 tại xưởng để tiếp tục tiến độ. Chúc cả đội buổi làm việc hiệu quả!</div>
            </div>
          </section>
        </div>
      </div>
    </section>
"""

# Insert new views right after </section> of view-history (around line 450)
view_history_tag = '    <!-- ==========================================================\n         VIEW 5: LỊCH SỬ PHIÊN (HISTORY)\n         ========================================================== -->\n    <section class="app-view" id="view-history">'
if view_history_tag in content:
    content = content.replace(view_history_tag, new_views + '\n' + view_history_tag)

# 4. Add Modals for Task Create/Detail and Student Feedback Submission
new_modals = """
<!-- Modal Giao Nhiệm Vụ Mới -->
<div class="modal-bg" id="taskCreateModal" onclick="if(event.target===this)closeTaskCreateModal()">
  <div class="team-modal-shell" style="max-width:540px">
    <div class="team-modal-head">
      <div>
        <div class="team-modal-title">Giao nhiệm vụ mới</div>
        <div class="team-now">Phân công công việc cho cả nhóm hoặc từng cá nhân</div>
      </div>
      <button class="btn btn-icon" onclick="closeTaskCreateModal()">✕</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px">
      <div class="form-field">
        <label for="taskNewTitle">Tiêu đề nhiệm vụ *</label>
        <input type="text" id="taskNewTitle" placeholder="VD: Thiết kế ngàm kẹp khí nén..." required>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-field">
          <label for="taskNewType">Phạm vi:</label>
          <select id="taskNewType" onchange="toggleTaskAssigneeSelect(this.value)">
            <option value="group">👥 Cho cả nhóm</option>
            <option value="personal">👤 Cho cá nhân</option>
          </select>
        </div>
        <div class="form-field">
          <label for="taskNewGroup">Nhóm / Lĩnh vực:</label>
          <select id="taskNewGroup">
            <option value="Cơ khí">Đội Cơ khí</option>
            <option value="Lập trình">Đội Lập trình - AI</option>
            <option value="Mạch - Điện">Đội Mạch - Điện tử</option>
          </select>
        </div>
      </div>

      <div class="form-field" id="taskAssigneeField" style="display:none">
        <label for="taskNewAssignee">Người nhận cụ thể:</label>
        <select id="taskNewAssignee">
          <option value="Dương Công Mạnh (125001343)">Dương Công Mạnh (125001343)</option>
          <option value="Huỳnh Tuấn Tú (123000078)">Huỳnh Tuấn Tú (123000078)</option>
          <option value="Nguyễn Văn Trung (123000651)">Nguyễn Văn Trung (123000651)</option>
          <option value="Phan Nhật Nam (124000534)">Phan Nhật Nam (124000534)</option>
        </select>
      </div>

      <div class="form-field">
        <label for="taskNewDesc">Mô tả & Yêu cầu kỹ thuật:</label>
        <textarea id="taskNewDesc" rows="3" style="width:100%;padding:10px 12px;border:1px solid var(--border-strong);border-radius:8px;font-family:inherit;font-size:13px;resize:vertical" placeholder="Ghi chú chi tiết yêu cầu, thông số cần đạt..."></textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-field">
          <label for="taskNewPriority">Mức ưu tiên:</label>
          <select id="taskNewPriority">
            <option value="high">🔥 Cao</option>
            <option value="med" selected>🟡 Trung bình</option>
            <option value="low">⚪ Thấp</option>
          </select>
        </div>
        <div class="form-field">
          <label for="taskNewDueDate">Hạn hoàn thành:</label>
          <input type="date" id="taskNewDueDate">
        </div>
      </div>

      <div class="modal-actions" style="margin-top:10px">
        <button onclick="closeTaskCreateModal()">Huỷ</button>
        <button class="btn btn-primary" onclick="submitCreateTask()">✓ Tạo & Giao nhiệm vụ</button>
      </div>
    </div>
  </div>
</div>

<!-- Modal Chi Tiết Nhiệm Vụ -->
<div class="modal-bg" id="taskDetailModal" onclick="if(event.target===this)closeTaskDetailModal()">
  <div class="modal" style="max-width:500px;text-align:left">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px">
      <h3 id="taskDetailTitle" style="font-size:16px;margin:0">Tiêu đề nhiệm vụ</h3>
      <span id="taskDetailPriority" class="task-badge-priority priority-high">Cao</span>
    </div>
    
    <div id="taskDetailDesc" style="font-size:13px;line-height:1.6;color:var(--muted);background:var(--surface-2);padding:12px 14px;border-radius:8px;margin-bottom:14px">
      Mô tả
    </div>

    <div class="task-meta-grid" style="margin-bottom:16px">
      <div class="task-meta-row"><span class="task-meta-lbl">Nhóm</span><span class="task-meta-val" id="taskDetailGroup">—</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val" id="taskDetailAssignee">—</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val" id="taskDetailDue">—</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Trạng thái</span><span class="task-meta-val" id="taskDetailStatus">—</span></div>
    </div>

    <div class="modal-actions">
      <button onclick="closeTaskDetailModal()">Đóng</button>
      <button class="btn btn-primary" onclick="toast('ok', 'Đã đánh dấu', 'Đã lưu trạng thái xem nhiệm vụ'); closeTaskDetailModal()">Đánh dấu đã đọc</button>
    </div>
  </div>
</div>

<!-- Modal Gửi Phản Hồi Ẩn Danh (Sinh viên) -->
<div class="modal-bg" id="studentFeedbackModal" onclick="if(event.target===this)closeStudentFeedbackModal()">
  <div class="modal" style="max-width:480px;text-align:left">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="width:38px;height:38px;border-radius:10px;background:#e0f2fe;color:#0369a1;display:grid;place-items:center;font-size:18px">💬</div>
      <div>
        <h3 style="margin:0;font-size:16px">Gửi phản hồi ẩn danh</h3>
        <p style="margin:2px 0 0;font-size:12px;color:var(--muted)">Ý kiến của bạn sẽ được ẩn danh hoàn toàn 100%.</p>
      </div>
    </div>

    <div class="form-field" style="margin-bottom:12px">
      <label for="fbSendType">Loại ý kiến / phản hồi:</label>
      <select id="fbSendType">
        <option value="gopy">💡 Góp ý xây dựng xưởng</option>
        <option value="suco">⚠️ Báo cáo hỏng hóc thiết bị / an toàn</option>
        <option value="muasam">🛠 Đề xuất mua sắm linh kiện / vật tư</option>
        <option value="khac">💬 Ý kiến đóng góp khác</option>
      </select>
    </div>

    <div class="form-field" style="margin-bottom:16px">
      <label for="fbSendContent">Nội dung phản hồi:</label>
      <textarea id="fbSendContent" rows="4" style="width:100%;padding:10px 12px;border:1px solid var(--border-strong);border-radius:8px;font-family:inherit;font-size:13px;resize:vertical" placeholder="Nhập chi tiết ý kiến, phản ánh của bạn..."></textarea>
    </div>

    <div class="modal-actions">
      <button onclick="closeStudentFeedbackModal()">Huỷ</button>
      <button class="btn btn-primary" onclick="submitStudentFeedback()">🔒 Gửi ẩn danh ngay</button>
    </div>
  </div>
</div>
"""

# Insert modals before </main> or before closing body
content = content.replace('</div>\n\n<script>', new_modals + '\n</div>\n\n<script>')

# 5. Add JavaScript Handlers for Navigation Titles, Tasks, Feedback, and Zalo
js_additions = """
// Register view titles for routing
const viewTitlesMap = {
  overview: 'Tổng quan hệ thống',
  attendance: 'Phiên điểm danh',
  teams: 'Quản lý nhóm',
  tasks: 'Nhiệm vụ xưởng & Đội Robocon',
  schedules: 'Lịch học & Rảnh/Bận',
  feedback: 'Phản hồi ẩn danh',
  zalo: 'Cài đặt gửi Zalo',
  history: 'Lịch sử phiên',
  requests: 'Yêu cầu tài khoản'
};

// Update navTo to support all view titles
const _origNavTo = typeof navTo === 'function' ? navTo : null;
function navTo(viewName) {
  currentView = viewName;
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(btn => btn.classList.remove('active'));

  const targetView = document.getElementById('view-' + viewName);
  if (targetView) targetView.classList.add('active');
  const targetNav = document.getElementById('nav-' + viewName);
  if (targetNav) targetNav.classList.add('active');

  const pageTitle = document.getElementById('pageCurrentSection');
  if (pageTitle) pageTitle.textContent = viewTitlesMap[viewName] || 'LH-NaviX';

  closeSidebar();

  if (viewName === 'teams' && typeof loadTeamGroups === 'function') loadTeamGroups();
  else if (viewName === 'schedules' && typeof loadTodaySchoolSchedule === 'function') loadTodaySchoolSchedule();
  else if (viewName === 'history' && typeof loadTodayHistory === 'function') loadTodayHistory();
  else if (viewName === 'requests' && typeof fetchResetRequests === 'function') fetchResetRequests();
}

/* ==========================================================
   TASK WORKSPACE CONTROLLERS
   ========================================================== */
function switchTaskTab(tabType) {
  document.getElementById('tabTaskGroup')?.classList.toggle('active', tabType === 'group');
  document.getElementById('tabTaskPersonal')?.classList.toggle('active', tabType === 'personal');
  
  const cards = document.querySelectorAll('#tasksListGrid .task-card');
  cards.forEach(c => {
    if (tabType === 'group') {
      c.style.display = (c.dataset.type === 'group') ? 'flex' : 'none';
    } else {
      c.style.display = (c.dataset.type === 'personal') ? 'flex' : 'none';
    }
  });
}

function applyTaskFilters() {
  const grp = document.getElementById('taskFilterGroup')?.value || 'all';
  const st = document.getElementById('taskFilterStatus')?.value || 'all';
  const pri = document.getElementById('taskFilterPriority')?.value || 'all';
  const search = (document.getElementById('taskSearchInput')?.value || '').toLowerCase().trim();

  const cards = document.querySelectorAll('#tasksListGrid .task-card');
  cards.forEach(c => {
    const matchGrp = (grp === 'all' || c.dataset.group === grp);
    const matchSt = (st === 'all' || c.dataset.status === st);
    const matchPri = (pri === 'all' || c.dataset.priority === pri);
    const matchSearch = (!search || c.innerText.toLowerCase().includes(search));
    
    c.style.display = (matchGrp && matchSt && matchPri && matchSearch) ? 'flex' : 'none';
  });
}

function openCreateTaskModal() {
  document.getElementById('taskCreateModal')?.classList.add('show');
}
function closeTaskCreateModal() {
  document.getElementById('taskCreateModal')?.classList.remove('show');
}

function toggleTaskAssigneeSelect(val) {
  const field = document.getElementById('taskAssigneeField');
  if (field) field.style.display = (val === 'personal') ? 'flex' : 'none';
}

function submitCreateTask() {
  const title = document.getElementById('taskNewTitle')?.value?.trim();
  if (!title) { toast('warn', 'Thiếu thông tin', 'Vui lòng nhập tiêu đề nhiệm vụ.'); return; }
  
  const type = document.getElementById('taskNewType')?.value || 'group';
  const group = document.getElementById('taskNewGroup')?.value || 'Cơ khí';
  const assignee = (type === 'personal') ? document.getElementById('taskNewAssignee')?.value : 'Toàn đội ' + group;
  const desc = document.getElementById('taskNewDesc')?.value || 'Thực hiện đúng yêu cầu xưởng.';
  const pri = document.getElementById('taskNewPriority')?.value || 'med';
  const due = document.getElementById('taskNewDueDate')?.value || '15/10/2026';

  const priLabel = pri === 'high' ? 'Cao 🔥' : (pri === 'med' ? 'Trung bình' : 'Thấp');
  const priClass = pri === 'high' ? 'priority-high' : (pri === 'med' ? 'priority-med' : 'priority-low');

  const newCard = document.createElement('div');
  newCard.className = 'task-card';
  newCard.dataset.type = type;
  newCard.dataset.group = group;
  newCard.dataset.status = 'todo';
  newCard.dataset.priority = pri;
  newCard.innerHTML = `
    <div class="task-card-top">
      <span class="task-title">${escapeHtml(title)}</span>
      <span class="task-badge-priority ${priClass}">${priLabel}</span>
    </div>
    <p class="task-desc">${escapeHtml(desc)}</p>
    <div class="task-meta-grid">
      <div class="task-meta-row"><span class="task-meta-lbl">Người giao</span><span class="task-meta-val">Admin</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Nhóm</span><span class="task-meta-val">${escapeHtml(group)}</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Người nhận</span><span class="task-meta-val">${escapeHtml(assignee)}</span></div>
      <div class="task-meta-row"><span class="task-meta-lbl">Hạn chót</span><span class="task-meta-val">${escapeHtml(due)}</span></div>
    </div>
    <div class="task-card-footer">
      <span class="task-status-chip status-todo">⚪ Chưa bắt đầu</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="showTaskDetail('${escapeHtml(title)}', '${escapeHtml(desc)}', '${escapeHtml(group)}', '${escapeHtml(assignee)}', '${priLabel}', '${escapeHtml(due)}', 'Chưa bắt đầu')">Chi tiết</button>
        <button class="btn btn-sm btn-primary" onclick="quickUpdateTaskStatus(this, 'doing')">▶ Bắt đầu</button>
      </div>
    </div>
  `;

  document.getElementById('tasksListGrid')?.prepend(newCard);
  closeTaskCreateModal();
  toast('ok', 'Đã giao nhiệm vụ', 'Nhiệm vụ mới đã được thêm vào danh sách.');
}

function showTaskDetail(title, desc, group, assignee, pri, due, status) {
  document.getElementById('taskDetailTitle').textContent = title;
  document.getElementById('taskDetailDesc').textContent = desc;
  document.getElementById('taskDetailGroup').textContent = group;
  document.getElementById('taskDetailAssignee').textContent = assignee;
  document.getElementById('taskDetailDue').textContent = due;
  document.getElementById('taskDetailStatus').textContent = status;
  document.getElementById('taskDetailModal')?.classList.add('show');
}
function closeTaskDetailModal() {
  document.getElementById('taskDetailModal')?.classList.remove('show');
}

function quickUpdateTaskStatus(btn, newStatus) {
  const card = btn.closest('.task-card');
  if (!card) return;
  card.dataset.status = newStatus;
  const chip = card.querySelector('.task-status-chip');
  if (newStatus === 'done') {
    if (chip) { chip.className = 'task-status-chip status-done'; chip.innerHTML = '✓ Đã hoàn thành'; }
    btn.remove();
    toast('ok', 'Cập nhật tiến độ', 'Đã đánh dấu hoàn thành nhiệm vụ.');
  } else if (newStatus === 'doing') {
    if (chip) { chip.className = 'task-status-chip status-doing'; chip.innerHTML = '⏳ Đang làm'; }
    btn.className = 'btn btn-sm btn-success';
    btn.textContent = '✓ Hoàn tất';
    btn.onclick = () => quickUpdateTaskStatus(btn, 'done');
    toast('info', 'Bắt đầu làm', 'Nhiệm vụ đã chuyển sang trạng thái đang thực hiện.');
  }
}

/* ==========================================================
   FEEDBACK & ZALO CONTROLLERS
   ========================================================== */
function openStudentFeedbackModal() {
  document.getElementById('studentFeedbackModal')?.classList.add('show');
}
function closeStudentFeedbackModal() {
  document.getElementById('studentFeedbackModal')?.classList.remove('show');
}
function submitStudentFeedback() {
  const text = document.getElementById('fbSendContent')?.value?.trim();
  if (!text) { toast('warn', 'Thiếu nội dung', 'Vui lòng nhập nội dung góp ý.'); return; }
  const type = document.getElementById('fbSendType')?.value || 'gopy';
  
  const typeLabels = { gopy: '💡 Góp ý', suco: '⚠️ Sự cố', muasam: '🛠 Mua sắm', khac: '💬 Khác' };
  const typeClass = { gopy: 'type-gopy', suco: 'type-suco', muasam: 'type-muasam', khac: 'type-khac' };
  const randId = Math.floor(1000 + Math.random() * 9000);

  const newFb = document.createElement('div');
  newFb.className = 'fb-item';
  newFb.dataset.type = type;
  newFb.dataset.status = 'new';
  newFb.innerHTML = `
    <div class="fb-item-top">
      <span class="fb-anon-tag">🔒 Người gửi ẩn danh #FB-${randId}</span>
      <span class="fb-type-badge ${typeClass[type] || 'type-gopy'}">${typeLabels[type]}</span>
    </div>
    <div class="fb-text">${escapeHtml(text)}</div>
    <div class="fb-item-bottom">
      <span>📅 Vừa gửi (Ẩn danh)</span>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="task-status-chip status-doing">🔵 Mới nhận</span>
        <button class="btn btn-sm btn-success" onclick="markFeedbackResolved(this)">✓ Đánh dấu đã xử lý</button>
      </div>
    </div>
  `;

  document.getElementById('feedbackList')?.prepend(newFb);
  closeStudentFeedbackModal();
  document.getElementById('fbSendContent').value = '';
  toast('ok', 'Đã gửi ẩn danh', 'Ý kiến của bạn đã được chuyển đến ban quản lý mà không lưu danh tính.');
}

function markFeedbackResolved(btn) {
  const item = btn.closest('.fb-item');
  if (!item) return;
  item.dataset.status = 'resolved';
  const bottom = item.querySelector('.fb-item-bottom div');
  if (bottom) {
    bottom.innerHTML = '<span class="task-status-chip status-done">🟢 Đã xử lý</span>';
  }
  toast('ok', 'Đã xử lý', 'Đã lưu trạng thái xử lý phản hồi.');
}

function applyFeedbackFilters() {
  const type = document.getElementById('fbFilterType')?.value || 'all';
  const st = document.getElementById('fbFilterStatus')?.value || 'all';
  const items = document.querySelectorAll('#feedbackList .fb-item');
  items.forEach(it => {
    const matchType = (type === 'all' || it.dataset.type === type);
    const matchSt = (st === 'all' || it.dataset.status === st);
    it.style.display = (matchType && matchSt) ? 'flex' : 'none';
  });
}

function toggleZaloAuto(isOn) {
  const lbl = document.getElementById('zaloSwitchLabel');
  if (lbl) lbl.textContent = isOn ? 'Tự động gửi lịch hàng ngày: ĐANG BẬT' : 'Tự động gửi lịch hàng ngày: ĐÃ TẮT';
  toast(isOn ? 'ok' : 'warn', isOn ? 'Đã bật tự động gửi Zalo' : 'Đã tắt gửi Zalo', 'Thời gian gửi: ' + (document.getElementById('zaloSendHour')?.value || '20:00'));
}

function simulateZaloSend() {
  toast('info', 'Đang tạo tin nhắn...', 'Đang tổng hợp danh sách lịch rảnh ngày mai...');
  setTimeout(() => {
    toast('ok', 'Gửi Zalo thành công!', 'Đã gửi mẫu lịch rảnh lên nhóm Robocon 2026.');
    const tbody = document.getElementById('zaloHistoryTbody');
    if (tbody) {
      const row = document.createElement('tr');
      row.innerHTML = `<td>Vừa xong</td><td>Robocon 2026 - C503</td><td><span class="team-availability free">✓ Thành công (Gửi thử)</span></td>`;
      tbody.prepend(row);
    }
  }, 900);
}

function generateZaloPreviewText() {
  const tm = new Date();
  tm.setDate(tm.getDate() + 1);
  const dStr = tm.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const preview = `[THÔNG BÁO LỊCH RẢNH NGÀY MAI - ${dStr.toUpperCase()}]
🤖 Xưởng Robocon LH-NaviX (Phòng C503)

✅ THÀNH VIÊN RẢNH CẢ NGÀY:
 • Võ Duy Khang (123001058)
 • Dương Công Mạnh (125001343)
 • Nguyễn Văn Trung (123000651)
 • ... và các thành viên khác

⚠️ THÀNH VIÊN CÓ LỊCH HỌC TRƯỜNG:
 • Huỳnh Tuấn Tú (123000078): Bận Tiết 1-4 (G306)

📌 Đề nghị các bạn có mặt đúng 07:30 tại xưởng!`;
  const el = document.getElementById('zaloMessagePreview');
  if (el) el.textContent = preview;
  toast('ok', 'Đã cập nhật', 'Khung xem trước tin nhắn Zalo đã được làm mới.');
}
"""

# Insert js_additions into script section before </script>
content = content.replace('</script>', js_additions + '\n</script>')

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: Added Tasks, Feedback, and Zalo feature views, modals and controllers to admin.html!")
