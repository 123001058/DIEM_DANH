import re

with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the sidebar menu items to EXACTLY 8 items in exact order:
# Tổng quan, Điểm danh, Quản lý nhóm, Nhiệm vụ, Lịch học & rảnh/bận, Phản hồi ẩn danh, Lịch gửi Zalo, Lịch sử.
menu_search = re.search(r'<nav class="sidebar-nav">.*?</nav>', content, re.DOTALL)
if menu_search:
    new_sidebar_nav = """<nav class="sidebar-nav">
    <button class="sidebar-nav-item active" id="nav-overview" onclick="navTo('overview')">
      <span class="nav-icon">📊</span>
      <span class="nav-label">Tổng quan</span>
    </button>
    <button class="sidebar-nav-item" id="nav-attendance" onclick="navTo('attendance')">
      <span class="nav-icon">📋</span>
      <span class="nav-label">Điểm danh</span>
      <span class="nav-badge" id="navAttendanceBadge">Phiên</span>
    </button>
    <button class="sidebar-nav-item" id="nav-teams" onclick="navTo('teams')">
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
      <span class="nav-label">Lịch học & rảnh/bận</span>
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
      <span class="nav-label">Lịch sử</span>
    </button>
  </nav>"""
    content = content[:menu_search.start()] + new_sidebar_nav + content[menu_search.end():]

# 2. Update KPI cards CSS to match the exact visual style in the image
kpi_css_update = """
/* Exact image matching KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
@media (max-width: 1024px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .kpi-grid { grid-template-columns: 1fr; } }

.kpi-card {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #e7e9ee;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.08);
}
.kpi-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.kpi-label {
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.kpi-icon-badge {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 15px;
  flex: none;
}
.kpi-icon-badge.purple-box { background: #ede9fe; color: #5b21b6; }
.kpi-icon-badge.green-box { background: #dcfce7; color: #15803d; }
.kpi-icon-badge.pink-box { background: #fee2e2; color: #b91c1c; }
.kpi-icon-badge.blue-box { background: #e0f2fe; color: #0369a1; }

.kpi-val {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  margin: 10px 0 4px;
}
.kpi-val.text-dark { color: #0f172a; }
.kpi-val.text-green { color: #16a34a; }
.kpi-val.text-red { color: #dc2626; }
.kpi-val.text-blue { color: #2563eb; }

.kpi-sub {
  font-size: 12.5px;
  color: #64748b;
  font-weight: 500;
  line-height: 1.4;
}

/* Robocon Rules & Notes Widget Styles */
.rules-widget-card {
  padding: 22px 24px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.rules-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}
.rules-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rules-icon {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: #fef3c7;
  color: #b45309;
  display: grid;
  place-items: center;
  font-size: 17px;
  flex: none;
}
.rules-title { font-size: 15.5px; font-weight: 800; color: var(--text); }
.rules-sub { font-size: 12px; color: var(--muted); margin-top: 1px; }

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rule-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: all 0.15s ease;
}
.rule-item:hover {
  background: #ffffff;
  border-color: var(--border-strong);
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.rule-item-content {
  flex: 1;
  min-width: 0;
}
.rule-item-title {
  font-size: 13.5px;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.rule-item-desc {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.5;
}
.rule-item-actions {
  display: flex;
  gap: 6px;
  flex: none;
}
"""

content = content.replace('</style>', kpi_css_update + '\n</style>')

# 3. Update the KPI Grid HTML markup in Overview & Add Robocon Rules Card
new_kpi_html = """        <!-- Dải KPI Cards (Khớp chính xác giao diện ảnh mẫu) -->
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

        <!-- ==========================================================
             LUẬT ĐIỂM DANH ROBOCON & GHI CHÚ QUY ĐỊNH (TẠO, SỬA, XÓA)
             ========================================================== -->
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

          <div class="rules-list" id="roboconRulesList">
            <!-- Dynamically populated from localStorage/default -->
          </div>
        </section>"""

# Replace old KPI Grid in view-overview
kpi_search = re.search(r'<!-- Dải KPI Cards -->.*?</div>\s*</div>', content, re.DOTALL)
if kpi_search:
    content = content[:kpi_search.start()] + new_kpi_html + content[kpi_search.end():]

# 4. Add Modal for Adding / Editing Robocon Rules
rule_modal_html = """
<!-- Modal Thêm / Chỉnh Sửa Luật Điểm Danh & Ghi Chú -->
<div class="modal-bg" id="ruleEditModal" onclick="if(event.target===this)closeRuleEditModal()">
  <div class="modal" style="max-width:480px;text-align:left">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="width:38px;height:38px;border-radius:10px;background:#fef3c7;color:#b45309;display:grid;place-items:center;font-size:18px">📜</div>
      <div>
        <h3 style="margin:0;font-size:16px" id="ruleModalHeading">Thêm luật / ghi chú điểm danh</h3>
        <p style="margin:2px 0 0;font-size:12px;color:var(--muted)">Quy định áp dụng cho tất cả thành viên xưởng Robocon</p>
      </div>
    </div>

    <input type="hidden" id="editRuleId" value="">

    <div class="form-field" style="margin-bottom:12px">
      <label for="ruleTitleInput">Tiêu đề quy định / Ghi chú *</label>
      <input type="text" id="ruleTitleInput" placeholder="VD: ⏰ Giờ điểm danh ca sáng" required>
    </div>

    <div class="form-field" style="margin-bottom:16px">
      <label for="ruleContentInput">Nội dung chi tiết & Mức phạt / Chế tài *</label>
      <textarea id="ruleContentInput" rows="3" style="width:100%;padding:10px 12px;border:1px solid var(--border-strong);border-radius:8px;font-family:inherit;font-size:13px;resize:vertical;box-sizing:border-box" placeholder="Chi tiết quy định và hình thức xử lý khi vi phạm..."></textarea>
    </div>

    <div class="modal-actions">
      <button onclick="closeRuleEditModal()">Huỷ</button>
      <button class="btn btn-primary" onclick="saveRoboconRule()">💾 Lưu quy định</button>
    </div>
  </div>
</div>
"""

content = content.replace('</body>', rule_modal_html + '\n</body>')

# 5. Add JavaScript Handlers for Robocon Rules (CRUD + localStorage) & Navigation
rules_js = """
/* ==========================================================
   ROBOCON RULES & NOTES CONTROLLER (TẠO, ĐIỀN, SỬA, XÓA)
   ========================================================== */
const DEFAULT_ROBOCON_RULES = [
  {
    id: 'r_1',
    title: '⏰ Giờ giấc điểm danh chuẩn',
    desc: 'Có mặt tại xưởng C503 đúng 07:30 (ca sáng) và 13:00 (ca chiều). Mở máy chiếu quét QR điểm danh trong 45 phút đầu ca.'
  },
  {
    id: 'r_2',
    title: '⏱ Quy định Đi muộn & Vắng không phép',
    desc: 'Quét QR trễ từ 15 đến 45 phút tính "Đi muộn". Sau 45 phút nếu không có lý do chính đáng sẽ chuyển thành "Vắng không phép".'
  },
  {
    id: 'r_3',
    title: '📝 Quy trình Xin phép nghỉ & Bù ca',
    desc: 'Thành viên bận học trường hoặc việc đột xuất phải báo đội trưởng/admin trước ít nhất 2 giờ và chủ động đăng ký bù ca vào buổi rảnh.'
  },
  {
    id: 'r_4',
    title: '🛡️ An toàn lao động & Thiết bị xưởng',
    desc: 'Bắt buộc mang giày bít mũi và đeo kính bảo hộ khi thao tác máy cắt, máy hàn, máy phay CNC. Không bật nguồn robot khi chưa kiểm tra dây dẫn.'
  },
  {
    id: 'r_5',
    title: '🧹 Vệ sinh xưởng cuối buổi',
    desc: '15 phút trước khi kết thúc ca: Thu dọn phoi nhôm, cuộn gọn dây cắm, cất dụng cụ về đúng kệ và tắt toàn bộ máy tính, điều hòa.'
  }
];

function getRoboconRules() {
  try {
    const saved = localStorage.getItem('robocon_rules_notes');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn('Cannot parse robocon rules', e);
  }
  return DEFAULT_ROBOCON_RULES;
}

function saveRoboconRulesArray(arr) {
  localStorage.setItem('robocon_rules_notes', JSON.stringify(arr));
  renderRoboconRules();
}

function renderRoboconRules() {
  const container = document.getElementById('roboconRulesList');
  if (!container) return;
  const rules = getRoboconRules();

  if (!rules || rules.length === 0) {
    container.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">
        <div style="font-size:24px;margin-bottom:6px">📝</div>
        <b>Chưa có quy định nào được ghi lại.</b>
        <p style="font-size:12px;margin-top:2px;color:var(--faint)">Bấm "+ Thêm quy định / Ghi chú" để tạo mới.</p>
      </div>`;
    return;
  }

  container.innerHTML = rules.map((r, idx) => `
    <div class="rule-item" id="rule_item_${r.id}">
      <div class="rule-item-content">
        <div class="rule-item-title">${escapeHtml(r.title)}</div>
        <div class="rule-item-desc">${escapeHtml(r.desc)}</div>
      </div>
      <div class="rule-item-actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditRuleModal('${r.id}')" title="Chỉnh sửa">✏️ Sửa</button>
        <button class="btn btn-sm btn-danger" onclick="deleteRoboconRule('${r.id}')" title="Xóa">🗑 Xóa</button>
      </div>
    </div>
  `).join('');
}

function openAddRuleModal() {
  document.getElementById('editRuleId').value = '';
  document.getElementById('ruleModalHeading').textContent = 'Thêm quy định / ghi chú mới';
  document.getElementById('ruleTitleInput').value = '';
  document.getElementById('ruleContentInput').value = '';
  document.getElementById('ruleEditModal')?.classList.add('show');
}

function openEditRuleModal(ruleId) {
  const rules = getRoboconRules();
  const rule = rules.find(x => x.id === ruleId);
  if (!rule) return;
  document.getElementById('editRuleId').value = rule.id;
  document.getElementById('ruleModalHeading').textContent = 'Chỉnh sửa quy định / ghi chú';
  document.getElementById('ruleTitleInput').value = rule.title;
  document.getElementById('ruleContentInput').value = rule.desc;
  document.getElementById('ruleEditModal')?.classList.add('show');
}

function closeRuleEditModal() {
  document.getElementById('ruleEditModal')?.classList.remove('show');
}

function saveRoboconRule() {
  const id = document.getElementById('editRuleId').value.trim();
  const title = document.getElementById('ruleTitleInput').value.trim();
  const desc = document.getElementById('ruleContentInput').value.trim();

  if (!title || !desc) {
    toast('warn', 'Thiếu thông tin', 'Vui lòng điền đầy đủ tiêu đề và nội dung quy định.');
    return;
  }

  let rules = getRoboconRules();
  if (id) {
    // Edit existing
    const idx = rules.findIndex(x => x.id === id);
    if (idx !== -1) {
      rules[idx].title = title;
      rules[idx].desc = desc;
    }
    toast('ok', 'Đã lưu', 'Cập nhật quy định điểm danh thành công.');
  } else {
    // Create new
    const newId = 'r_' + Date.now().toString(36);
    rules.unshift({ id: newId, title, desc });
    toast('ok', 'Đã thêm mới', 'Quy định / Ghi chú mới đã được thêm vào bảng.');
  }

  saveRoboconRulesArray(rules);
  closeRuleEditModal();
}

function deleteRoboconRule(ruleId) {
  if (!confirm('Bạn có chắc muốn xóa quy định / ghi chú này?')) return;
  let rules = getRoboconRules();
  rules = rules.filter(x => x.id !== ruleId);
  saveRoboconRulesArray(rules);
  toast('ok', 'Đã xóa', 'Đã xóa quy định khỏi bảng.');
}

function resetDefaultRoboconRules() {
  if (!confirm('Khôi phục lại 5 quy định điểm danh mẫu của xưởng Robocon?')) return;
  saveRoboconRulesArray(DEFAULT_ROBOCON_RULES);
  toast('ok', 'Đã khôi phục', 'Đã nạp lại nội quy điểm danh Robocon mặc định.');
}

// Ensure rules are rendered upon initialization
document.addEventListener('DOMContentLoaded', () => {
  renderRoboconRules();
});
setTimeout(() => { renderRoboconRules(); }, 300);
"""

content = content.replace('</script>', rules_js + '\n</script>')

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: Updated 3-gạch menu to exact 8 items, upgraded KPI cards, and added Robocon Rules CRUD widget!")
