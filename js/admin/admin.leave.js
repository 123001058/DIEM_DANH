/* =====================================================================
   LH-NaviX Admin — admin.leave.js
   Đơn xin nghỉ (duyệt/từ chối, lịch sử, bằng chứng)
   (Tách từ admin.html; các file nạp theo thứ tự, không đổi thứ tự.)
   ===================================================================== */
/* ==========================================================
   LEAVE REQUESTS
   ========================================================== */
const leaveTypeNames={full_session:'Nghỉ theo ngày/buổi',late:'Đi muộn',early:'Về sớm',partial:'Vắng một phần'};
const leaveStatusNames={pending:'Chờ duyệt',approved:'Đã duyệt',rejected:'Từ chối',cancelled:'Đã hủy'};
const adminLeavePeriodNames={full_day:'Cả ngày',morning:'Buổi sáng',afternoon:'Buổi chiều',evening:'Buổi tối'};
let adminLeaveCache=[], adminLeaveUser=null, adminLeaveProfile=null, adminLeaveSchedules=[], expandedLeaveDays=null, leaveDayPeriods={};
let leaveTrackerMode = 'week'; // 'week' | 'top'
let leaveTrackerSelectedWeek = '';
let leaveFilterByTrackerWeek = false;
let leaveFilterStudentMssv = '';

function getLeaveWeekMonday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d)) return '';
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatLeaveWeekShort(mondayKey) {
  if (!mondayKey) return '';
  const start = new Date(`${mondayKey}T00:00:00`);
  if (isNaN(start)) return mondayKey;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = dt => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(start)}–${fmt(end)}`;
}

function formatLeaveWeekLabel(mondayKey) {
  if (!mondayKey) return '';
  const start = new Date(`${mondayKey}T00:00:00`);
  if (isNaN(start)) return mondayKey;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const todayMonday = getLeaveWeekMonday(new Date().toLocaleDateString('sv-SE'));
  const tag = (mondayKey === todayMonday) ? ' (Tuần này)' : '';
  return `Tuần ${formatLeaveWeekShort(mondayKey)}/${end.getFullYear()}${tag}`;
}

function shortDayDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d)) return dateStr;
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `${names[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function setLeaveTrackerMode(mode) {
  leaveTrackerMode = (mode === 'top') ? 'top' : 'week';
  const btnW = document.getElementById('btnTrackerModeWeek');
  const btnT = document.getElementById('btnTrackerModeTop');
  const navGrp = document.getElementById('leaveWeekNavGroup');
  const btnFilterW = document.getElementById('btnFilterListByWeek');
  if (btnW) {
    btnW.style.background = leaveTrackerMode === 'week' ? 'var(--primary)' : 'transparent';
    btnW.style.color = leaveTrackerMode === 'week' ? '#fff' : 'var(--muted)';
  }
  if (btnT) {
    btnT.style.background = leaveTrackerMode === 'top' ? '#dc2626' : 'transparent';
    btnT.style.color = leaveTrackerMode === 'top' ? '#fff' : 'var(--muted)';
  }
  if (navGrp) navGrp.style.display = leaveTrackerMode === 'week' ? 'inline-flex' : 'none';
  if (btnFilterW) btnFilterW.style.display = leaveTrackerMode === 'week' ? 'inline-flex' : 'none';
  renderLeaveWeeklyTracker();
}

function onLeaveTrackerWeekChange(weekKey) {
  leaveTrackerSelectedWeek = weekKey;
  renderLeaveWeeklyTracker();
  if (leaveFilterByTrackerWeek) {
    expandedLeaveDays = null;
    renderLeaveRequests();
  }
}

function stepLeaveTrackerWeek(dir) {
  const sel = document.getElementById('leaveTrackerWeekSelect');
  if (!sel || !sel.options.length) return;
  const nextIdx = sel.selectedIndex + dir;
  if (nextIdx >= 0 && nextIdx < sel.options.length) {
    sel.selectedIndex = nextIdx;
    onLeaveTrackerWeekChange(sel.value);
  }
}

function toggleFilterListByTrackerWeek() {
  leaveFilterByTrackerWeek = !leaveFilterByTrackerWeek;
  expandedLeaveDays = null;
  renderLeaveWeeklyTracker();
  renderLeaveRequests();
}

function toggleFilterLeaveByStudent(mssv) {
  if (leaveFilterStudentMssv === mssv) {
    leaveFilterStudentMssv = '';
  } else {
    leaveFilterStudentMssv = mssv || '';
    const days = [...new Set((adminLeaveCache || []).filter(r => r.mssv === leaveFilterStudentMssv).map(leaveRowDate))];
    expandedLeaveDays = new Set(days);
  }
  renderLeaveWeeklyTracker();
  renderLeaveRequests();
}

function clearAllLeaveCustomFilters() {
  leaveFilterStudentMssv = '';
  leaveFilterByTrackerWeek = false;
  expandedLeaveDays = null;
  renderLeaveWeeklyTracker();
  renderLeaveRequests();
}

function renderLeaveWeeklyTracker() {
  const body = document.getElementById('leaveWeeklyTrackerBody');
  const summaryEl = document.getElementById('leaveWeeklyTrackerSummary');
  const sel = document.getElementById('leaveTrackerWeekSelect');
  const btnFilterW = document.getElementById('btnFilterListByWeek');
  if (!body) return;

  const todayMonday = getLeaveWeekMonday(new Date().toLocaleDateString('sv-SE'));
  const weekSet = new Set([todayMonday]);
  (adminLeaveCache || []).forEach(r => {
    const wk = getLeaveWeekMonday(leaveRowDate(r));
    if (wk) weekSet.add(wk);
  });
  const sortedWeeks = [...weekSet].filter(Boolean).sort().reverse();

  if (!leaveTrackerSelectedWeek || !weekSet.has(leaveTrackerSelectedWeek)) {
    const pendingRow = (adminLeaveCache || []).find(r => r.status === 'pending');
    const pendingWeek = pendingRow ? getLeaveWeekMonday(leaveRowDate(pendingRow)) : '';
    const hasTodayRows = (adminLeaveCache || []).some(r => getLeaveWeekMonday(leaveRowDate(r)) === todayMonday);
    const firstWithData = sortedWeeks.find(w => (adminLeaveCache || []).some(r => getLeaveWeekMonday(leaveRowDate(r)) === w));
    leaveTrackerSelectedWeek = pendingWeek || (hasTodayRows ? todayMonday : (firstWithData || todayMonday));
  }

  if (sel) {
    sel.innerHTML = sortedWeeks.map(wk => {
      const cnt = (adminLeaveCache || []).filter(r => getLeaveWeekMonday(leaveRowDate(r)) === wk && (r.status === 'approved' || r.status === 'pending')).length;
      return `<option value="${wk}" ${wk === leaveTrackerSelectedWeek ? 'selected' : ''}>${formatLeaveWeekLabel(wk)} (${cnt} phép)</option>`;
    }).join('');
  }

  if (btnFilterW) {
    btnFilterW.className = leaveFilterByTrackerWeek ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    btnFilterW.textContent = leaveFilterByTrackerWeek ? '✓ Đang lọc đơn theo tuần này' : '🔍 Lọc đơn theo tuần này';
  }

  // Tính tổng toàn kỳ cho từng sinh viên
  const allTimeByStu = new Map();
  (adminLeaveCache || []).forEach(r => {
    if (r.status !== 'approved' && r.status !== 'pending') return;
    if (!allTimeByStu.has(r.mssv)) {
      allTimeByStu.set(r.mssv, { mssv: r.mssv, name: r.students?.name || r.mssv, approved: 0, pending: 0, total: 0, rows: [] });
    }
    const st = allTimeByStu.get(r.mssv);
    if (r.status === 'approved') st.approved++;
    else if (r.status === 'pending') st.pending++;
    st.total++;
    st.rows.push(r);
  });

  if (leaveTrackerMode === 'week') {
    const weekRows = (adminLeaveCache || []).filter(r =>
      getLeaveWeekMonday(leaveRowDate(r)) === leaveTrackerSelectedWeek &&
      (r.status === 'approved' || r.status === 'pending')
    );
    const stuMap = new Map();
    weekRows.forEach(r => {
      if (!stuMap.has(r.mssv)) {
        stuMap.set(r.mssv, { mssv: r.mssv, name: r.students?.name || r.mssv, weekApproved: 0, weekPending: 0, weekTotal: 0, rows: [] });
      }
      const st = stuMap.get(r.mssv);
      if (r.status === 'approved') st.weekApproved++;
      else if (r.status === 'pending') st.weekPending++;
      st.weekTotal++;
      st.rows.push(r);
    });

    const list = [...stuMap.values()].sort((a, b) => {
      if (b.weekTotal !== a.weekTotal) return b.weekTotal - a.weekTotal;
      if (b.weekPending !== a.weekPending) return b.weekPending - a.weekPending;
      return (allTimeByStu.get(b.mssv)?.total || 0) - (allTimeByStu.get(a.mssv)?.total || 0);
    });

    const totalApprovedW = weekRows.filter(r => r.status === 'approved').length;
    const totalPendingW = weekRows.filter(r => r.status === 'pending').length;
    if (summaryEl) {
      summaryEl.innerHTML = `${formatLeaveWeekShort(leaveTrackerSelectedWeek)}: <b>${weekRows.length} phép</b> (<span style="color:#15803d">${totalApprovedW} đã duyệt</span>, <span style="color:#b45309">${totalPendingW} chờ duyệt</span>) · <b>${list.length} SV</b>`;
    }

    if (!list.length) {
      body.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--muted);font-size:12.5px">Không có sinh viên nào xin nghỉ (đã duyệt / chờ duyệt) trong ${formatLeaveWeekLabel(leaveTrackerSelectedWeek)}.</div>`;
      return;
    }

    body.innerHTML = list.map(st => {
      const allSt = allTimeByStu.get(st.mssv) || { approved: 0, pending: 0, total: 0 };
      const isFrequent = st.weekTotal >= 2 || allSt.total >= 3;
      const isSelected = (leaveFilterStudentMssv === st.mssv);
      const sortedItems = [...st.rows].sort((a, b) => leaveRowDate(a).localeCompare(leaveRowDate(b)));
      const chipsHtml = sortedItems.map(r => {
        const isAp = r.status === 'approved';
        const cBg = isAp ? '#dcfce7' : '#fef3c7';
        const cTxt = isAp ? '#15803d' : '#b45309';
        const pName = adminLeavePeriodNames[leaveRowPeriod(r)] || 'Cả ngày';
        return `<span style="font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:5px;background:${cBg};color:${cTxt};display:inline-flex;align-items:center;gap:3px">${isAp ? '🟢' : '⏳'} ${shortDayDateLabel(leaveRowDate(r))} (${pName})</span>`;
      }).join('');

      return `
        <div onclick="toggleFilterLeaveByStudent('${escapeJsAttr(st.mssv)}')" title="Bấm để lọc riêng các đơn của ${escapeHtml(st.name)}" style="cursor:pointer;padding:10px 12px;border-radius:9px;background:var(--surface);border:${isSelected ? '2px solid var(--primary)' : (isFrequent ? '1.5px solid #fdba74' : '1px solid var(--border)')};box-shadow:${isSelected ? '0 0 0 2px rgba(37,99,235,0.15)' : '0 1px 2px rgba(0,0,0,0.03)'};transition:all .15s">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
            <div style="min-width:0">
              <div style="font-size:13px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                <span>${escapeHtml(st.name)}</span>
                ${isFrequent ? `<span style="font-size:10px;padding:1px 6px;border-radius:99px;background:#ffedd5;color:#c2410c;font-weight:800">🔥 Hay nghỉ</span>` : ''}
              </div>
              <div style="font-size:11px;color:var(--muted);font-family:monospace">${escapeHtml(st.mssv)} · Tổng kỳ: <b>${allSt.approved}</b> duyệt${allSt.pending ? ` + <b>${allSt.pending}</b> chờ` : ''}</div>
            </div>
            <div style="text-align:right;flex:none">
              <span style="font-size:12px;font-weight:800;padding:2px 8px;border-radius:99px;background:${st.weekTotal >= 2 ? '#fee2e2' : '#eff6ff'};color:${st.weekTotal >= 2 ? '#dc2626' : '#1d4ed8'}">
                ${st.weekTotal} phép tuần này
              </span>
              <div style="font-size:10.5px;margin-top:3px;font-weight:700">
                <span style="color:#15803d">${st.weekApproved} duyệt</span> · <span style="color:#d97706">${st.weekPending} chờ</span>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:7px;padding-top:6px;border-top:1px dashed var(--border)">
            ${chipsHtml}
          </div>
        </div>
      `;
    }).join('');
  } else {
    // Chế độ Top hay xin nghỉ toàn kỳ
    const topList = [...allTimeByStu.values()].sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return b.approved - a.approved;
    });

    if (summaryEl) {
      summaryEl.innerHTML = `Toàn kỳ: <b>${topList.reduce((s, x) => s + x.total, 0)} phép</b> (đã duyệt & chờ duyệt) · <b>${topList.length} SV</b> từng xin nghỉ`;
    }

    if (!topList.length) {
      body.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--muted);font-size:12.5px">Chưa có dữ liệu sinh viên xin nghỉ.</div>`;
      return;
    }

    body.innerHTML = topList.map((st, idx) => {
      const weekRows = st.rows.filter(r => getLeaveWeekMonday(leaveRowDate(r)) === leaveTrackerSelectedWeek);
      const isSelected = (leaveFilterStudentMssv === st.mssv);
      const isFrequent = st.total >= 2;
      const recentItems = [...st.rows].sort((a, b) => leaveRowDate(b).localeCompare(leaveRowDate(a))).slice(0, 4);
      const chipsHtml = recentItems.map(r => {
        const isAp = r.status === 'approved';
        const cBg = isAp ? '#dcfce7' : '#fef3c7';
        const cTxt = isAp ? '#15803d' : '#b45309';
        return `<span style="font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:5px;background:${cBg};color:${cTxt}">${isAp ? '🟢' : '⏳'} ${shortDayDateLabel(leaveRowDate(r))}</span>`;
      }).join('');

      return `
        <div onclick="toggleFilterLeaveByStudent('${escapeJsAttr(st.mssv)}')" title="Bấm để lọc riêng các đơn của ${escapeHtml(st.name)}" style="cursor:pointer;padding:10px 12px;border-radius:9px;background:var(--surface);border:${isSelected ? '2px solid var(--primary)' : (isFrequent ? '1.5px solid #fca5a5' : '1px solid var(--border)')};transition:all .15s">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
            <div style="min-width:0">
              <div style="font-size:13px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:800;color:${idx < 3 ? '#dc2626' : 'var(--muted)'}">#${idx + 1}</span>
                <span>${escapeHtml(st.name)}</span>
              </div>
              <div style="font-size:11px;color:var(--muted);font-family:monospace">${escapeHtml(st.mssv)} · Tuần đang chọn: <b>${weekRows.length} phép</b></div>
            </div>
            <div style="text-align:right;flex:none">
              <span style="font-size:12px;font-weight:800;padding:2px 8px;border-radius:99px;background:${st.total >= 3 ? '#fee2e2' : '#ffedd5'};color:${st.total >= 3 ? '#dc2626' : '#c2410c'}">
                Tổng: ${st.total} phép
              </span>
              <div style="font-size:10.5px;margin-top:3px;font-weight:700">
                <span style="color:#15803d">${st.approved} duyệt</span> · <span style="color:#d97706">${st.pending} chờ</span>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:7px;padding-top:6px;border-top:1px dashed var(--border)">
            ${chipsHtml}${st.rows.length > 4 ? `<span style="font-size:10.5px;color:var(--muted);align-self:center">+${st.rows.length - 4} đơn khác</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }
}

function toggleAdminSelfLeaveForm(forceState) {
  const card = document.getElementById('adminSelfLeaveCard');
  const btn = document.getElementById('btnToggleSelfLeave');
  if (!card) return;
  const isCurrentlyOpen = (card.style.display !== 'none');
  const shouldOpen = (forceState !== undefined) ? forceState : !isCurrentlyOpen;
  card.style.display = shouldOpen ? 'block' : 'none';
  if (btn) btn.textContent = shouldOpen ? '✕ Đóng form' : '＋ Tạo đơn';
  if (shouldOpen) fillAdminLeaveStudents();
}

function fillAdminLeaveStudents() {
  const dl = document.getElementById('adminLeaveStudentList');
  const input = document.getElementById('adminLeaveStudent');
  if (dl) dl.innerHTML = (students || []).map(s => `<option value="${escapeHtml(s.mssv)} - ${escapeHtml(s.name)}"></option>`).join('');
  if (input && !input.value && adminLeaveProfile?.mssv) input.value = adminLeaveProfile.mssv;
}

// Lấy MSSV hợp lệ từ ô chọn sinh viên (chấp nhận "mssv - tên" hoặc gõ thẳng mssv/tên)
function getAdminLeaveMssv() {
  const v = (document.getElementById('adminLeaveStudent')?.value || '').trim();
  if (!v) return null;
  const key = v.split(' - ')[0].trim();
  const hit = (students || []).find(s => s.mssv === key) || (students || []).find(s => s.name.toLowerCase() === v.toLowerCase());
  return hit ? hit.mssv : null;
}

function setLeaveStatusFilter(status) {
  const sel = document.getElementById('leaveFilterStatus');
  if (sel) sel.value = status;
  ['leaveKpiPending', 'leaveKpiApproved', 'leaveKpiRejected', 'leaveKpiAll'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  const map = { pending: 'leaveKpiPending', approved: 'leaveKpiApproved', rejected: 'leaveKpiRejected', all: 'leaveKpiAll' };
  if (map[status]) document.getElementById(map[status])?.classList.add('active');
  renderLeaveRequests();
}

function toggleLeaveCardEdit(id) {
  const box = document.getElementById(`leaveEditBox_${id}`);
  if (box) {
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
  }
}

function toggleLeaveCardChat(id) {
  const wrap = document.getElementById(`leaveChatWrap_${id}`);
  if (!wrap) return;
  const willShow = (wrap.style.display === 'none' || !wrap.style.display);
  wrap.style.display = willShow ? 'block' : 'none';
  if (willShow) {
    setTimeout(() => document.getElementById(`leaveChatInput_${id}`)?.focus(), 50);
  }
}

async function approveAllPendingOnDay(day, event) {
  if (event) event.stopPropagation();
  const pendingRows = (adminLeaveCache || []).filter(r => leaveRowDate(r) === day && r.status === 'pending');
  if (!pendingRows.length) return;
  if (!confirm(`Duyệt tất cả ${pendingRows.length} đơn đang chờ trong ngày ${day}?`)) return;
  try {
    const ids = pendingRows.map(r => r.id);
    const { error } = await supabase.from('leave_requests').update({
      status: 'approved',
      updated_at: new Date().toISOString()
    }).in('id', ids);
    if (error) throw error;
    toast('ok', 'Đã duyệt hàng loạt', `Đã duyệt ${ids.length} đơn xin nghỉ trong ngày ${day}.`);
    await syncApprovedLeavesToSession(false);
    await loadLeaveManagement();
  } catch (err) {
    toast('err', 'Lỗi duyệt hàng loạt', err.message || 'Không thể duyệt các đơn này.');
  }
}

async function quickUpdateLeaveStatus(id, newStatus) {
  const row = adminLeaveCache.find(r => r.id === id);
  if (!row) return;
  const statusLabel = leaveStatusNames[newStatus] || newStatus;
  try {
    const { error } = await supabase.from('leave_requests').update({
      status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
    toast('ok', 'Cập nhật thành công', `Đơn của ${row.students?.name || row.mssv} đã chuyển sang "${statusLabel}".`);
    if (newStatus === 'approved') {
      await syncApprovedLeavesToSession(false);
    }
    await loadLeaveManagement();
  } catch (err) {
    toast('err', 'Lỗi cập nhật', err.message || 'Không thể cập nhật trạng thái đơn.');
  }
}

function adminLeaveBounds(date,period){if(!date)return null;const hours={full_day:[0,24],morning:[0,12],afternoon:[12,17],evening:[17,24]}[period];if(!hours)return null;const start=new Date(`${date}T00:00:00`);start.setHours(hours[0],0,0,0);const end=new Date(`${date}T00:00:00`);end.setHours(hours[1],0,0,0);return {start,end};}
function leaveRowDate(r){return r.leave_date||r.sessions?.started_at?.slice(0,10)||new Date(r.created_at).toLocaleDateString('sv-SE');}
function leaveRowPeriod(r){if(r.leave_period)return r.leave_period;const hour=new Date(r.starts_at||r.sessions?.started_at||r.created_at).getHours();return hour<12?'morning':hour<17?'afternoon':'evening';}

async function checkAdminLeaveConflict(){
  const out=document.getElementById('adminLeaveConflict');if(!out)return;
  const bounds=adminLeaveBounds(document.getElementById('adminLeaveDate')?.value,document.getElementById('adminLeavePeriod')?.value);const targetMssv=getAdminLeaveMssv();if(!bounds||!targetMssv){out.textContent='';return;}const {start,end}=bounds;
  const {data,error}=await supabase.from('student_schedules').select('subject_name,start_time,end_time,tinh_trang').eq('mssv',targetMssv).limit(300);
  if(error){out.textContent='Chưa kiểm tra được lịch học.';return;}if(!data?.length){out.textContent='⚪ Chưa có dữ liệu lịch học; vẫn có thể gửi đơn.';return;}
  const inWindow=data.filter(s=>new Date(s.start_time)<end&&new Date(s.end_time)>start);
  const conflicts=inWindow.filter(s=>Number(s.tinh_trang)!==1);
  const cancelled=inWindow.filter(s=>Number(s.tinh_trang)===1);
  out.textContent=conflicts.length?`⚠️ Trùng lịch học: ${conflicts.map(s=>(Number(s.tinh_trang)===6?'[Lịch thi] ':'')+s.subject_name).join(', ')}. Vẫn có thể gửi đơn.`:(cancelled.length?`🟢 Không trùng lịch học (🚫 Báo nghỉ trên ME: ${cancelled.map(s=>s.subject_name).join(', ')}).`:'Không thấy lịch học trùng thời gian.');
}

async function submitAdminLeaveRequest(){
  const leaveDate=document.getElementById('adminLeaveDate').value,leavePeriod=document.getElementById('adminLeavePeriod').value,reason=document.getElementById('adminLeaveReason').value.trim(),file=document.getElementById('adminLeaveEvidence').files?.[0];
  const targetMssv=getAdminLeaveMssv();if(!targetMssv)return toast('err','Thiếu sinh viên','Chọn sinh viên có trong danh sách (gõ tên hoặc MSSV).');if(!leaveDate||!reason)return toast('warn','Thiếu thông tin','Chọn ngày nghỉ và nhập lý do.');
  const approveNow=document.getElementById('adminLeaveApproveNow')?.checked;
  try{
    let evidence_path=null;if(file){if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Ảnh phải là JPG, PNG hoặc WebP và nhỏ hơn 5 MB.');const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];evidence_path=`${adminLeaveUser.id}/${crypto.randomUUID()}.${ext}`;const {error}=await supabase.storage.from('leave-evidence').upload(evidence_path,file,{contentType:file.type});if(error)throw error;}
    const {data:created,error}=await supabase.from('leave_requests').insert({session_id:null,leave_date:leaveDate,leave_period:leavePeriod,mssv:targetMssv,leave_type:'full_session',starts_at:null,ends_at:null,reason,evidence_path}).select('id').single();if(error)throw error;
    // Insert xong mới đổi sang approved để trigger áp đơn vào điểm danh chạy (trigger chỉ bắt UPDATE)
    if(approveNow){const {error:apErr}=await supabase.from('leave_requests').update({status:'approved',updated_at:new Date().toISOString()}).eq('id',created.id);if(apErr)throw apErr;await syncApprovedLeavesToSession(false);}
    document.getElementById('adminLeaveDate').value='';document.getElementById('adminLeaveReason').value='';document.getElementById('adminLeaveEvidence').value='';document.getElementById('adminLeaveStudent').value='';
    toggleAdminSelfLeaveForm(false);
    const stName=(students||[]).find(s=>s.mssv===targetMssv)?.name||targetMssv;
    await loadLeaveManagement();toast('ok',approveNow?'Đã tạo & duyệt đơn':'Đã tạo đơn',`Đơn xin nghỉ của ${stName} (${targetMssv}) ${approveNow?'đã được duyệt':'đang chờ duyệt'}.`);
  }catch(e){toast('err','Không gửi được đơn',e.message||'Lỗi không xác định.');}
}

async function loadLeaveManagement(){
  const list=document.getElementById('leaveRequestDays');if(!list)return;list.innerHTML='<div class="schedule-loading">Đang tải đơn xin nghỉ...</div>';
  const {data:authData}=await supabase.auth.getSession();adminLeaveUser=authData?.session?.user||null;
  if(!adminLeaveUser){list.innerHTML='<div class="empty-state">Vui lòng đăng nhập lại.</div>';return;}
  const [{data:profileData},{data,error}]=await Promise.all([
    supabase.from('profiles').select('mssv,full_name').eq('user_id',adminLeaveUser.id).maybeSingle(),
    supabase.from('leave_requests').select('*,sessions(session_name,started_at,duration_min),students(name),leave_request_history(id,changed_at,new_record)').order('created_at',{ascending:false})
  ]);
  adminLeaveProfile=profileData||{};
  if(error){list.innerHTML='<div class="empty-state">Không tải được đơn: '+escapeHtml(error.message)+'</div>';return;}
  adminLeaveCache=data||[];await loadAdminLeaveNotifications();
  const memberIds=[...new Set(adminLeaveCache.map(r=>r.mssv))];let schedules=[];
  if(memberIds.length){const result=await supabase.from('student_schedules').select('mssv,subject_name,start_time,end_time,tinh_trang').in('mssv',memberIds);schedules=result.data||[];}
  adminLeaveSchedules=schedules;
  renderLeaveWeeklyTracker();
  renderLeaveRequests();
}

/* ==========================================================
   HỆ THỐNG TRAO ĐỔI & PHẢN HỒI (LEAVE CHAT) TRÊN ĐƠN NGHỈ
   ========================================================== */
function parseLeaveChatNotes(raw) {
  if (!raw) return [];
  if (typeof raw === 'object' && Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
    if (parsed == null) return [];
    return [{ id: 'legacy', sender: 'admin', name: 'Quản lý', text: String(raw), time: '' }];
  } catch (_) {
    return [{ id: 'legacy', sender: 'admin', name: 'Quản lý', text: String(raw), time: '' }];
  }
}

function renderLeaveChatHtml(messages, leaveId, isAdmin) {
  const msgs = Array.isArray(messages) ? messages : [];
  const hasMsgs = msgs.length > 0;
  let msgsHtml = '';
  if (hasMsgs) {
    msgsHtml = msgs.map(m => {
      const isFromAdmin = (m.sender === 'admin');
      const bubbleBg = isFromAdmin ? 'var(--surface, #fff)' : 'var(--surface-2, #f1f5f9)';
      const bubbleColor = isFromAdmin ? 'var(--primary)' : 'var(--text)';
      const align = isFromAdmin ? 'flex-end' : 'flex-start';
      const border = isFromAdmin ? '1px solid var(--primary)' : '1px solid var(--border)';
      return `
        <div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:6px;">
          <div style="font-size:10.5px;color:var(--muted);margin-bottom:2px;">
            <b>${escapeHtml(m.name || (isFromAdmin ? 'Quản lý' : 'Sinh viên'))}</b> · <span>${escapeHtml(m.time || '')}</span>
          </div>
          <div style="max-width:85%;padding:6px 10px;border-radius:10px;background:${bubbleBg};color:${bubbleColor};border:${border};font-size:12px;word-break:break-word;line-height:1.4;">
            ${escapeHtml(m.text || '')}
          </div>
        </div>
      `;
    }).join('');
  }

  return `
    <div id="leaveChatWrap_${leaveId}" class="leave-chat-box" style="display:${hasMsgs ? 'block' : 'none'};margin:8px 0;padding:8px 10px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:11.5px;font-weight:700;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:5px">
        <span>💬</span> Trao đổi &amp; Ghi chú phản hồi ${hasMsgs ? `(${msgs.length})` : ''}
      </div>
      <div id="leaveChatMsgs_${leaveId}" style="max-height:160px;overflow-y:auto;margin-bottom:6px;">
        ${msgsHtml || '<div style="font-size:11px;color:var(--muted);font-style:italic">Chưa có phản hồi hay trao đổi nào.</div>'}
      </div>
      <div style="display:flex;gap:6px;">
        <input type="text" id="leaveChatInput_${leaveId}" placeholder="Nhập tin nhắn phản hồi cho sinh viên..." style="flex:1;padding:5px 8px;font-size:11.5px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)" onkeydown="if(event.key==='Enter'){event.preventDefault();sendLeaveComment('${leaveId}');}">
        <button type="button" class="btn btn-primary btn-sm" style="padding:4px 10px;font-size:11.5px;font-weight:700" onclick="sendLeaveComment('${leaveId}')">Gửi</button>
      </div>
    </div>
  `;
}

async function sendLeaveComment(leaveId) {
  const inp = document.getElementById(`leaveChatInput_${leaveId}`);
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.disabled = true;

  try {
    const { data, error } = await supabase.rpc('submit_leave_comment', {
      p_leave_id: leaveId,
      p_message: text
    });

    if (error) throw error;
    if (!data?.ok || !Array.isArray(data.notes)) {
      throw new Error(data?.message || 'Không lưu được phản hồi.');
    }

    const row = adminLeaveCache.find(r => r.id === leaveId);
    if (row) row.reviewer_note = JSON.stringify(data.notes);
    inp.value = '';
    if (typeof toast === 'function') toast('ok', 'Đã gửi phản hồi', 'Tin nhắn đã được gửi tới sinh viên.');
    renderLeaveRequests();
    await loadAdminLeaveNotifications();
  } catch (err) {
    console.error('Lỗi gửi phản hồi đơn:', err);
    if (typeof toast === 'function') toast('err', 'Không gửi được', err.message || 'Lỗi gửi tin nhắn');
    inp.disabled = false;
  }
}


function renderLeaveRequests(){
  const list=document.getElementById('leaveRequestDays');if(!list)return;
  const filterStatus=document.getElementById('leaveFilterStatus')?.value||'all';
  const search=(document.getElementById('leaveSearchInput')?.value||'').trim().toLowerCase();

  // 1. Cập nhật số liệu KPI
  const countPending = adminLeaveCache.filter(r=>r.status==='pending').length;
  const countApproved = adminLeaveCache.filter(r=>r.status==='approved').length;
  const countRejected = adminLeaveCache.filter(r=>r.status==='rejected').length;
  const countAll = adminLeaveCache.length;

  const elP=document.getElementById('leaveStatPending');
  const elA=document.getElementById('leaveStatApproved');
  const elR=document.getElementById('leaveStatRejected');
  const elAll=document.getElementById('leaveStatAll');
  if(elP) elP.textContent=countPending;
  if(elA) elA.textContent=countApproved;
  if(elR) elR.textContent=countRejected;
  if(elAll) elAll.textContent=countAll;

  // Highlight KPI card tương ứng
  ['leaveKpiPending', 'leaveKpiApproved', 'leaveKpiRejected', 'leaveKpiAll'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  const mapKpi = { pending: 'leaveKpiPending', approved: 'leaveKpiApproved', rejected: 'leaveKpiRejected', all: 'leaveKpiAll' };
  if (mapKpi[filterStatus]) document.getElementById(mapKpi[filterStatus])?.classList.add('active');

  // Render banner báo đang lọc theo tuần hoặc theo sinh viên
  const bannerEl = document.getElementById('leaveActiveFilterBanner');
  if (bannerEl) {
    const activeParts = [];
    if (leaveFilterStudentMssv) {
      const stName = (adminLeaveCache.find(r => r.mssv === leaveFilterStudentMssv)?.students?.name) || leaveFilterStudentMssv;
      activeParts.push(`👤 Sinh viên: <b>${escapeHtml(stName)} (${escapeHtml(leaveFilterStudentMssv)})</b>`);
    }
    if (leaveFilterByTrackerWeek && leaveTrackerSelectedWeek) {
      activeParts.push(`📅 ${escapeHtml(formatLeaveWeekLabel(leaveTrackerSelectedWeek))}`);
    }
    if (activeParts.length) {
      bannerEl.style.display = 'flex';
      bannerEl.innerHTML = `
        <div>🔍 Đang lọc danh sách đơn theo: ${activeParts.join(' · ')}</div>
        <button type="button" class="btn btn-secondary btn-sm" style="padding:3px 9px;font-size:11.5px;font-weight:700" onclick="clearAllLeaveCustomFilters()">✕ Bỏ lọc (Xem tất cả)</button>
      `;
    } else {
      bannerEl.style.display = 'none';
    }
  }

  // Tiền tính toán thống kê phép theo tuần & toàn kỳ cho mỗi sinh viên để gắn lên từng thẻ đơn
  const studentWeekMap = new Map(); // key: `${mssv}_${weekKey}` -> array of active rows (approved/pending)
  const studentTotalMap = new Map(); // key: mssv -> { approved, pending, total }
  adminLeaveCache.forEach(r => {
    if (r.status !== 'approved' && r.status !== 'pending') return;
    const wk = getLeaveWeekMonday(leaveRowDate(r));
    const wkKey = `${r.mssv}_${wk}`;
    if (!studentWeekMap.has(wkKey)) studentWeekMap.set(wkKey, []);
    studentWeekMap.get(wkKey).push(r);

    if (!studentTotalMap.has(r.mssv)) studentTotalMap.set(r.mssv, { approved: 0, pending: 0, total: 0 });
    const stTot = studentTotalMap.get(r.mssv);
    if (r.status === 'approved') stTot.approved++;
    else if (r.status === 'pending') stTot.pending++;
    stTot.total++;
  });

  const rows=adminLeaveCache.filter(r=>{
    const matchStatus=(filterStatus==='all'||r.status===filterStatus);
    const matchStu=!leaveFilterStudentMssv || r.mssv===leaveFilterStudentMssv;
    const matchWeek=!leaveFilterByTrackerWeek || !leaveTrackerSelectedWeek || getLeaveWeekMonday(leaveRowDate(r))===leaveTrackerSelectedWeek;
    const name=(r.students?.name||'').toLowerCase();
    const mssv=(r.mssv||'').toLowerCase();
    const reason=(r.reason||'').toLowerCase();
    const matchSearch=!search || name.includes(search) || mssv.includes(search) || reason.includes(search);
    return matchStatus && matchStu && matchWeek && matchSearch;
  });

  const count=document.getElementById('leaveRequestCount');if(count)count.textContent=`${rows.length} đơn`;
  const badge=document.getElementById('navLeaveBadge');if(badge)badge.textContent=countPending;
  const mobileBadge=document.getElementById('mobileNavLeaveBadge');
  if(mobileBadge){
    mobileBadge.textContent=countPending;
    mobileBadge.style.display=countPending>0?'inline-flex':'none';
  }

  if(!rows.length){
    list.innerHTML='<div class="empty-state">Chưa có đơn xin nghỉ nào phù hợp bộ lọc.</div>';
    return;
  }

  const days=[...new Set(rows.map(leaveRowDate))].sort().reverse();
  if(expandedLeaveDays === null && days.length){
    expandedLeaveDays = new Set();
    const pendingDay = days.find(day => rows.some(r => leaveRowDate(r) === day && r.status === 'pending'));
    expandedLeaveDays.add(pendingDay || days[0]);
  } else if(!expandedLeaveDays){
    expandedLeaveDays = new Set();
  }

  list.innerHTML=days.map(day=>{
    const dayRows=rows.filter(r=>leaveRowDate(r)===day);
    const dayPending=dayRows.filter(r=>r.status==='pending').length;
    const dayApproved=dayRows.filter(r=>r.status==='approved').length;
    const isExpanded=expandedLeaveDays.has(day);
    const dayWeekKey=getLeaveWeekMonday(day);

    const dayDateObj=new Date(`${day}T00:00:00`);
    const dayFormatted=isNaN(dayDateObj)?day:dayDateObj.toLocaleDateString('vi-VN',{
      weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'
    });

    let bodyHtml='';
    if(isExpanded){
      const periodFilter=leaveDayPeriods[day]||'all';
      const periods=[
        {id:'all',label:'Tất cả các buổi'},
        {id:'morning',label:'Buổi sáng'},
        {id:'afternoon',label:'Buổi chiều'},
        {id:'evening',label:'Buổi tối'}
      ];

      const periodPills=periods.map(p=>{
        const countP=(p.id==='all')
          ?dayRows.length
          :dayRows.filter(r=>leaveRowPeriod(r)===p.id||leaveRowPeriod(r)==='full_day').length;
        const activeClass=(periodFilter===p.id)?'btn-primary':'btn-secondary';
        return `<button type="button" class="btn btn-sm ${activeClass}" style="padding:4px 9px;font-size:11.5px" onclick="selectLeavePeriod('${day}','${p.id}',event)">${p.label} · ${countP}</button>`;
      }).join('');

      const filteredDayRows=(periodFilter==='all')
        ?dayRows
        :dayRows.filter(r=>leaveRowPeriod(r)===periodFilter||leaveRowPeriod(r)==='full_day');

      const cardsHtml=filteredDayRows.length?filteredDayRows.map(r=>{
        const currentPeriod=leaveRowPeriod(r);
        const bounds=adminLeaveBounds(day,currentPeriod==='full_day'?'full_day':currentPeriod);
        const allMatches=adminLeaveSchedules.filter(s=>s.mssv===r.mssv&&bounds&&new Date(s.start_time)<bounds.end&&new Date(s.end_time)>bounds.start);
        const matches=allMatches.filter(s=>Number(s.tinh_trang)!==1);
        const cancelledMatches=allMatches.filter(s=>Number(s.tinh_trang)===1);
        const hasCalendar=adminLeaveSchedules.some(s=>s.mssv===r.mssv);
        const availability=!hasCalendar
          ?'⚪ Chưa có dữ liệu lịch; vẫn có thể xem xét đơn.'
          :matches.length
            ?`⚠️ Bận học: ${matches.map(s=>(Number(s.tinh_trang)===6?'[Lịch thi] ':'')+escapeHtml(s.subject_name)).join(', ')}`
            :cancelledMatches.length
              ?`🟢 Không trùng lịch học (🚫 Báo nghỉ trên ME: ${cancelledMatches.map(s=>escapeHtml(s.subject_name)).join(', ')})`
              : '🟢 Không thấy lịch học trùng';

        // Thống kê số phép trong tuần của đơn này cho sinh viên r.mssv
        const wkRows = studentWeekMap.get(`${r.mssv}_${dayWeekKey}`) || [];
        const wkApproved = wkRows.filter(x => x.status === 'approved').length;
        const wkPending = wkRows.filter(x => x.status === 'pending').length;
        const wkTotal = wkRows.length;
        const otherWkRows = wkRows.filter(x => x.id !== r.id).sort((a, b) => leaveRowDate(a).localeCompare(leaveRowDate(b)));
        const stTot = studentTotalMap.get(r.mssv) || { approved: 0, pending: 0, total: 0 };

        const isHeavyWeek = wkTotal >= 2;
        const weekBadgeBg = isHeavyWeek ? '#fff7ed' : '#eff6ff';
        const weekBadgeColor = isHeavyWeek ? '#c2410c' : '#1d4ed8';
        const weekBadgeBorder = isHeavyWeek ? '#fed7aa' : '#bfdbfe';
        const weekBadgeText = isHeavyWeek
          ? `🔥 Tuần này: ${wkTotal} phép (${wkApproved} duyệt, ${wkPending} chờ)`
          : `📅 Tuần này: ${wkTotal} phép (${wkApproved ? wkApproved + ' duyệt' : wkPending + ' chờ'})`;

        const otherWeekHtml = otherWkRows.length ? `
          <div style="margin:5px 0 6px;padding:5px 9px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:11.5px;color:#92400e;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <b>📌 Cùng tuần (${formatLeaveWeekShort(dayWeekKey)}) còn xin nghỉ:</b>
            ${otherWkRows.map(ox => {
              const isAp = ox.status === 'approved';
              return `<span style="padding:1px 6px;border-radius:4px;background:${isAp ? '#dcfce7' : '#fef3c7'};color:${isAp ? '#15803d' : '#b45309'};font-weight:700">${isAp ? '🟢' : '⏳'} ${shortDayDateLabel(leaveRowDate(ox))} (${adminLeavePeriodNames[leaveRowPeriod(ox)] || 'Cả ngày'} · ${leaveStatusNames[ox.status]})</span>`;
            }).join('')}
          </div>
        ` : '';

        const statusOptions=Object.entries(leaveStatusNames)
          .map(([v,n])=>`<option value="${v}" ${r.status===v?'selected':''}>${n}</option>`)
          .join('');

        const historyHtml=(r.leave_request_history||[]).map(h=>{
          const v=h.new_record||{};
          return `<div style="font-size:10.5px;color:var(--muted)">${new Date(h.changed_at).toLocaleString('vi-VN')} · ${leaveStatusNames[v.status]||'Đã cập nhật'} · ${leaveTypeNames[v.leave_type]||''}</div>`;
        }).join('');

        const statusBadgeBg=r.status==='approved'?'var(--ok-bg)':r.status==='rejected'?'var(--err-bg)':r.status==='pending'?'#fef3c7':'#f1f5f9';
        const statusBadgeColor=r.status==='approved'?'var(--ok)':r.status==='rejected'?'var(--err)':r.status==='pending'?'#b45309':'var(--muted)';

        const chatNotes = parseLeaveChatNotes(r.reviewer_note);

        const quickActionButtons = r.status === 'pending'
          ? `<div class="leave-quick-actions" style="display:flex;gap:6px">
               <button type="button" class="btn btn-sm" style="background:#15803d;color:#fff;border:none;font-weight:700;padding:5px 12px;font-size:12px" onclick="quickUpdateLeaveStatus('${r.id}','approved')">✓ Duyệt phép</button>
               <button type="button" class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;font-weight:700;padding:5px 12px;font-size:12px" onclick="quickUpdateLeaveStatus('${r.id}','rejected')">✕ Từ chối</button>
             </div>`
          : r.status === 'approved'
          ? `<div class="leave-quick-actions" style="display:flex;gap:6px">
               <button type="button" class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;font-weight:700;padding:4px 10px;font-size:11.5px" onclick="quickUpdateLeaveStatus('${r.id}','rejected')">Chuyển Từ chối</button>
               <button type="button" class="btn btn-sm" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-weight:700;padding:4px 10px;font-size:11.5px" onclick="quickUpdateLeaveStatus('${r.id}','pending')">Để Chờ duyệt</button>
             </div>`
          : `<div class="leave-quick-actions" style="display:flex;gap:6px">
               <button type="button" class="btn btn-sm" style="background:#15803d;color:#fff;border:none;font-weight:700;padding:4px 10px;font-size:11.5px" onclick="quickUpdateLeaveStatus('${r.id}','approved')">✓ Duyệt lại</button>
               <button type="button" class="btn btn-sm" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-weight:700;padding:4px 10px;font-size:11.5px" onclick="quickUpdateLeaveStatus('${r.id}','pending')">Để Chờ duyệt</button>
             </div>`;

        return `
          <article class="leave-card-compact" style="border-left: 4px solid ${r.status==='approved'?'#10b981':r.status==='rejected'?'#ef4444':r.status==='pending'?'#f59e0b':'#94a3b8'}">
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <strong style="font-size:13.5px;color:var(--text);cursor:pointer" onclick="toggleFilterLeaveByStudent('${escapeJsAttr(r.mssv)}')" title="Bấm để lọc xem tất cả đơn của sinh viên này">${escapeHtml(r.students?.name||r.mssv)}</strong>
                <span style="font-size:11.5px;color:var(--muted);font-family:monospace">${escapeHtml(r.mssv)}</span>
                <span style="font-size:11px;padding:2px 8px;border-radius:6px;background:var(--surface-2);font-weight:600;color:var(--text)">
                  ${adminLeavePeriodNames[leaveRowPeriod(r)]||'Cả ngày'}
                </span>
                <span onclick="toggleFilterLeaveByStudent('${escapeJsAttr(r.mssv)}')" title="Số phép của sinh viên này trong tuần ${formatLeaveWeekShort(dayWeekKey)} (Bấm để xem tất cả đơn của SV này)" style="cursor:pointer;font-size:11px;font-weight:800;padding:2px 8px;border-radius:99px;background:${weekBadgeBg};color:${weekBadgeColor};border:1px solid ${weekBadgeBorder}">
                  ${weekBadgeText}
                </span>
                <span onclick="toggleFilterLeaveByStudent('${escapeJsAttr(r.mssv)}')" title="Tổng số phép lũy kế toàn kỳ của sinh viên này" style="cursor:pointer;font-size:11px;font-weight:700;padding:2px 7px;border-radius:99px;background:var(--surface-2);color:var(--muted);border:1px solid var(--border)">
                  Σ Kỳ: ${stTot.approved} duyệt${stTot.pending ? ` + ${stTot.pending} chờ` : ''}
                </span>
                <span style="font-size:11px;color:var(--muted)">🕒 ${new Date(r.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</span>
              </div>
              <span style="font-size:11px;font-weight:700;padding:2px 9px;background:${statusBadgeBg};color:${statusBadgeColor};border-radius:99px">
                ${leaveStatusNames[r.status]||r.status}
              </span>
            </div>

            ${otherWeekHtml}

            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin:6px 0 4px">
              <div style="font-size:12px;line-height:1.45;color:var(--text);flex:1;min-width:200px">
                <b style="color:var(--muted)">Lý do:</b> ${escapeHtml(r.reason)}
              </div>
              <div style="font-size:11.5px;color:${matches.length?'var(--warn)':'var(--ok)'}">
                ${availability}
              </div>
            </div>

            ${r.evidence_path?`<div style="margin-bottom:6px"><button type="button" class="btn btn-secondary btn-sm" style="font-size:11px;padding:3px 8px" onclick="openLeaveEvidence('${r.id}')">📎 Xem ảnh minh chứng</button></div>`:''}
            ${renderLeaveChatHtml(chatNotes, r.id, true)}
            ${historyHtml?`<details style="margin:4px 0 6px;font-size:11px"><summary style="cursor:pointer;color:var(--muted)">Lịch sử sửa (${(r.leave_request_history||[]).length})</summary><div style="margin-top:3px;padding:5px;background:var(--surface-2);border-radius:5px">${historyHtml}</div></details>`:''}

            <!-- Hàng hành động 1-chạm -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);flex-wrap:wrap;gap:6px">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                ${quickActionButtons}
                <button type="button" class="btn btn-secondary btn-sm" style="padding:4px 8px;font-size:11.5px" onclick="toggleLeaveCardChat('${r.id}')" title="Mở/đóng khung nhắn phản hồi cho sinh viên">💬 Phản hồi${chatNotes.length ? ` (${chatNotes.length})` : ''}</button>
                <button type="button" class="btn btn-secondary btn-sm" style="padding:4px 8px;font-size:11.5px" onclick="toggleLeaveCardEdit('${r.id}')" title="Chỉnh sửa ngày/buổi/ghi chú">✏️ Sửa chi tiết</button>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <button type="button" class="btn btn-sm" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:3px 8px;font-size:11px" onclick="deleteLeaveRequest('${r.id}','${escapeJsAttr(r.students?.name||r.mssv)}')">🗑️ Xóa</button>
              </div>
            </div>

            <!-- Khung chỉnh sửa chi tiết (Mặc định ẩn) -->
            <div id="leaveEditBox_${r.id}" style="display:none;margin-top:8px;padding:10px;background:var(--surface-2);border-radius:8px;border:1px dashed var(--border)">
              <div style="font-size:11.5px;font-weight:700;margin-bottom:6px;color:var(--text)">✏️ Chỉnh sửa thông tin đơn:</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px">
                <label style="font-size:11px">Ngày nghỉ
                  <input id="leaveDate_${r.id}" type="date" value="${leaveRowDate(r)}" style="display:block;width:100%;padding:6px;margin-top:3px;border:1px solid var(--border);border-radius:6px;font-family:inherit">
                </label>
                <label style="font-size:11px">Buổi nghỉ
                  <select id="leavePeriod_${r.id}" style="display:block;width:100%;padding:6px;margin-top:3px;border:1px solid var(--border);border-radius:6px;font-family:inherit">
                    ${Object.entries(adminLeavePeriodNames).map(([v,n])=>`<option value="${v}" ${(r.leave_period||'full_day')===v?'selected':''}>${n}</option>`).join('')}
                  </select>
                </label>
                <label style="font-size:11px">Trạng thái
                  <select id="leaveStatus_${r.id}" style="display:block;width:100%;padding:6px;margin-top:3px;border:1px solid var(--border);border-radius:6px;font-family:inherit">
                    ${statusOptions}
                  </select>
                </label>
              </div>

              <label style="display:block;font-size:11px;margin-top:6px">Lý do
                <textarea id="leaveReason_${r.id}" rows="2" style="display:block;width:100%;padding:6px;margin-top:3px;border:1px solid var(--border);border-radius:6px;font-family:inherit">${escapeHtml(r.reason)}</textarea>
              </label>

              <label style="display:block;font-size:11px;margin-top:6px">Gửi phản hồi thêm cho sinh viên
                <textarea id="leaveNote_${r.id}" rows="1" style="display:block;width:100%;padding:6px;margin-top:3px;border:1px solid var(--border);border-radius:6px;font-family:inherit" placeholder="Nội dung sẽ được thêm vào phần trao đổi với sinh viên..."></textarea>
              </label>

              <div style="display:flex;justify-content:flex-end;margin-top:6px">
                <button type="button" class="btn btn-primary btn-sm" onclick="saveLeaveReview('${r.id}')">💾 Lưu cập nhật</button>
              </div>
            </div>
          </article>
        `;
      }).join(''):'<div class="empty-state" style="padding:12px">Không có đơn xin nghỉ trong buổi này.</div>';

      bodyHtml=`
        <div style="padding:12px;border-top:1px solid var(--border);background:var(--surface-2, #fafafa)">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
            <span style="font-size:11.5px;color:var(--muted);margin-right:4px">Lọc buổi:</span>
            ${periodPills}
          </div>
          <div>${cardsHtml}</div>
        </div>
      `;
    }

    return `
      <div class="leave-day-accordion ${isExpanded?'open':''}">
        <div class="leave-day-head" onclick="toggleLeaveDay('${day}')">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:15px">${isExpanded?'📂':'📁'}</span>
            <strong style="font-size:13.5px">${dayFormatted}</strong>
            <span style="font-size:11px;padding:2px 7px;border-radius:6px;background:var(--surface-2);color:var(--muted);font-weight:600">Tuần ${formatLeaveWeekShort(dayWeekKey)}</span>
            <span style="font-size:11.5px;padding:2px 8px;border-radius:99px;background:#f1f5f9;color:var(--text)">${dayRows.length} đơn</span>
            ${dayApproved?`<span style="font-size:11.5px;padding:2px 8px;border-radius:99px;background:#dcfce7;color:#15803d;font-weight:700">🟢 ${dayApproved} đã duyệt</span>`:''}
            ${dayPending?`<span style="font-size:11.5px;padding:2px 8px;border-radius:99px;background:#fef3c7;color:#b45309;font-weight:700">⏳ ${dayPending} chờ duyệt</span>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${dayPending > 1 ? `<button type="button" class="btn btn-sm" style="background:#15803d;color:#fff;border:none;padding:3px 9px;font-size:11px;font-weight:700" onclick="approveAllPendingOnDay('${day}',event)">✓ Duyệt hết (${dayPending})</button>` : ''}
            <span style="font-size:12px;color:var(--muted);font-weight:600">${isExpanded?'Thu gọn ▲':'Bấm xem đơn ▼'}</span>
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;
  }).join('');
}

function toggleLeaveDay(day){
  if(!expandedLeaveDays) expandedLeaveDays = new Set();
  if(expandedLeaveDays.has(day)){
    expandedLeaveDays.delete(day);
  } else {
    expandedLeaveDays.add(day);
  }
  renderLeaveRequests();
}

function toggleAllLeaveDays(expand){
  const days = [...new Set((adminLeaveCache||[]).map(leaveRowDate))];
  if(!expandedLeaveDays) expandedLeaveDays = new Set();
  if(expand){
    days.forEach(d => expandedLeaveDays.add(d));
  } else {
    expandedLeaveDays.clear();
  }
  renderLeaveRequests();
}

function selectLeavePeriod(day,period,event){
  if(event)event.stopPropagation();
  leaveDayPeriods[day]=period;
  if(!expandedLeaveDays) expandedLeaveDays = new Set();
  expandedLeaveDays.add(day);
  renderLeaveRequests();
}

async function deleteLeaveRequest(id,studentName){
  const row=adminLeaveCache.find(r=>r.id===id);
  const name=studentName||row?.students?.name||row?.mssv||'sinh viên này';
  if(!confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn đơn xin nghỉ của ${name}?\n\nThao tác này sẽ xóa đơn và ảnh minh chứng khỏi hệ thống, không thể hoàn tác.`)){
    return;
  }
  try{
    if(row?.evidence_path){
      try{
        await supabase.storage.from('leave-evidence').remove([row.evidence_path]);
      }catch(storageErr){
        console.warn('Lỗi khi xóa ảnh storage:',storageErr);
      }
    }
    const {data,error}=await supabase.rpc('admin_delete_leave_request',{p_request_id:id});
    if(error){
      const {error:delErr}=await supabase.from('leave_requests').delete().eq('id',id);
      if(delErr)throw delErr;
    } else if(data&&!data.ok){
      throw new Error(data.message||'Không thể xóa đơn.');
    }
    toast('ok','Đã xóa đơn','Đã xóa vĩnh viễn đơn xin nghỉ thành công.');
    await loadLeaveManagement();
  }catch(e){
    toast('err','Không xóa được đơn',e.message||'Lỗi không xác định.');
  }
}

async function saveLeaveReview(id){
  const row=adminLeaveCache.find(r=>r.id===id);if(!row)return;
  const leave_date=document.getElementById(`leaveDate_${id}`).value,leave_period=document.getElementById(`leavePeriod_${id}`).value,status=document.getElementById(`leaveStatus_${id}`).value,reason=document.getElementById(`leaveReason_${id}`).value.trim();
  const noteText=(document.getElementById(`leaveNote_${id}`)?.value||'').trim();
  if(!leave_date)return toast('warn','Thiếu ngày','Chọn ngày nghỉ.');if(!reason)return toast('warn','Thiếu lý do','Lý do xin nghỉ là bắt buộc.');
  // Không ghi đè reviewer_note trực tiếp nữa: cột này đang chứa toàn bộ lịch sử chat.
  const {error}=await supabase.from('leave_requests').update({session_id:null,leave_date,leave_period,leave_type:'full_session',status,reason,starts_at:null,ends_at:null}).eq('id',id);
  if(error){toast('err','Chưa lưu được đơn',error.message);return;}
  let noteWarning='';
  if(noteText){
    const {data:chat,error:chatError}=await supabase.rpc('submit_leave_comment',{p_leave_id:id,p_message:noteText});
    if(chatError||!chat?.ok)noteWarning=chatError?.message||chat?.message||'Không gửi được phản hồi thêm.';
  }
  if(status === 'approved') {
    await syncApprovedLeavesToSession(false);
  }
  await loadLeaveManagement();
  if(noteWarning){toast('warn','Đã lưu đơn nhưng chưa gửi phản hồi',noteWarning);return;}
  toast('ok','Đã cập nhật',noteText?'Trạng thái, lịch và phản hồi đã được lưu.':'Trạng thái và lịch đã được lưu.');
}
async function openLeaveEvidence(id){const row=adminLeaveCache.find(r=>r.id===id);if(!row?.evidence_path)return;const {data,error}=await supabase.storage.from('leave-evidence').createSignedUrl(row.evidence_path,300);if(error||!data?.signedUrl){toast('err','Không mở được ảnh',error?.message||'');return;}window.open(data.signedUrl,'_blank','noopener');}

async function loadAdminLeaveNotifications(){
  const wrap=document.getElementById('adminLeaveNotificationsWrap');
  const box=document.getElementById('adminLeaveNotifications');
  const countEl=document.getElementById('leaveNotifyCount');
  if(!box||!adminLeaveUser)return;
  const {data,error}=await supabase.from('in_app_notifications').select('*').eq('user_id',adminLeaveUser.id).order('created_at',{ascending:false}).limit(8);
  if(error){if(wrap)wrap.style.display='none';return;}
  const notifications=data||[];
  const unread=notifications.filter(n=>!n.is_read).length;
  if(!notifications.length){
    if(wrap)wrap.style.display='none';
    return;
  }
  if(wrap)wrap.style.display='block';
  if(countEl)countEl.textContent=unread?`(${unread} chưa đọc)`:`(${notifications.length} thông báo)`;
  box.innerHTML=notifications.map(n=>`
    <div style="padding:6px 0;border-top:1px solid var(--border);font-size:12px;opacity:${n.is_read?'.65':'1'};display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div>
        <b>${escapeHtml(n.title)}</b> · ${escapeHtml(n.message)} 
        <small style="color:var(--muted)">${new Date(n.created_at).toLocaleString('vi-VN')}</small>
      </div>
      ${n.is_read?'':`<button class="btn btn-sm" style="padding:2px 7px;font-size:11px" onclick="markAdminLeaveNotificationRead('${n.id}')">Đã đọc</button>`}
    </div>
  `).join('');
}
async function markAdminLeaveNotificationRead(id){await supabase.from('in_app_notifications').update({is_read:true}).eq('id',id);await loadAdminLeaveNotifications();}
function renderSessionHistoryCard(s) {
  const tStart = new Date(s.started_at).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
  const d = new Date(s.started_at).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
  const badge = s.is_open
    ? '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:#dcfce7;color:#15803d">🟢 Đang mở</span>'
    : '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:#f1f5f9;color:#64748b">🔴 Đã đóng</span>';
  const lateText = s.late ? ' · <span style="color:#d97706;font-weight:700">' + s.late + ' muộn</span>' : '';
  const excusedText = s.excused ? ' · <span style="color:#7c3aed;font-weight:700">' + s.excused + ' phép</span>' : '';
  const totalSv = s.total || students?.length || 0;
  const attended = (s.present || 0) + (s.late || 0);
  const pRate = totalSv ? Math.round(attended * 100 / totalSv) : 0;

  return '<div class="today-history-item" style="cursor:pointer;padding:12px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--surface);transition:all .15s" onclick="viewPastSession(\'' + s.id + '\')">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<div style="display:flex;align-items:center;gap:8px;min-width:0">' +
        '<strong style="font-size:13.5px;color:var(--text)">' + escapeHtml(s.session_name) + '</strong>' +
        badge +
      '</div>' +
      '<div class="th-actions" style="margin:0;display:flex;gap:6px;align-items:center" onclick="event.stopPropagation()">' +
        '<button class="btn btn-secondary btn-sm" style="padding:4px 9px;font-size:11.5px" onclick="viewPastSession(\'' + s.id + '\')">👁 Xem</button>' +
        '<button class="btn btn-sm" style="padding:4px 9px;font-size:11.5px;background:#059669;color:#fff;border:none;font-weight:600;display:inline-flex;align-items:center;gap:3px" onclick="exportPastSessionExcel(\'' + s.id + '\', this)" title="Xuất file Excel cho riêng phiên này">📥 Xuất Excel</button>' +
        (s.is_open
          ? '<button class="btn btn-sm" style="padding:4px 9px;font-size:11.5px;background:#dc2626;color:#fff;border:none" onclick="quickCloseSession(\'' + s.id + '\')">■ Đóng</button>'
          : '<button class="btn btn-sm" style="padding:4px 9px;font-size:11.5px;background:#334155;color:#fff;border:none" onclick="quickReopenSession(\'' + s.id + '\')">🔄 Mở lại</button>') +
        '<button class="btn btn-sm" style="padding:4px 9px;font-size:11.5px;background:#fee2e2;color:#dc2626;border:1px solid #fecaca" onclick="deleteSpecificSession(\'' + s.id + '\')">🗑 Xóa</button>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
      '<span>🕒 ' + d + ' ' + tStart + '</span> · ' +
      '<span>' + totalSv + ' SV</span> · ' +
      '<span style="color:var(--ok);font-weight:700">' + (s.present || 0) + ' có mặt</span>' +
      lateText +
      ' · <span style="color:var(--err);font-weight:700">' + (s.unexcused || 0) + ' không phép</span>' +
      excusedText +
    '</div>' +
    '<div class="past-session-detail" data-session-detail="' + escapeHtml(String(s.id)) + '" onclick="event.stopPropagation()"></div>' +
  '</div>';
}

async function loadAttendanceReport(){
  const summary = document.getElementById('attendanceReportSummary');
  const listEl = document.getElementById('historyFullList');
  const countEl = document.getElementById('attendanceReportCount');
  if (!summary || !listEl) return;

  const from = document.getElementById('reportFromDate')?.value;
  const to = document.getElementById('reportToDate')?.value;
  if (!from || !to || to < from) {
    toast('warn', 'Chọn khoảng ngày', 'Chọn ngày bắt đầu và kết thúc hợp lệ.');
    return;
  }

  listEl.innerHTML = '<div class="schedule-loading">Đang tải báo cáo và các phiên...</div>';
  if (countEl) countEl.textContent = '';

  const start = new Date(`${from}T00:00:00+07:00`).toISOString();
  const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000).toISOString();

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, session_name, started_at, is_open')
    .gte('started_at', start)
    .lt('started_at', end)
    .order('started_at', { ascending: false });

  if (error) {
    listEl.innerHTML = '<div class="empty-state">Không tải được phiên điểm danh: ' + escapeHtml(error.message) + '</div>';
    return;
  }

  if (!sessions?.length) {
    summary.innerHTML = '';
    listEl.innerHTML = '<div class="empty-state">Không có phiên điểm danh nào từ ngày ' + from + ' đến ' + to + '.</div>';
    if (countEl) countEl.textContent = '0 phiên';
    window._currentReportData = null;
    return;
  }

  const { data: attendance, error: attError } = await supabase
    .from('attendance')
    .select('session_id, mssv, status')
    .in('session_id', sessions.map(s => s.id));

  if (attError) {
    listEl.innerHTML = '<div class="empty-state">Không tải được dữ liệu điểm danh.</div>';
    return;
  }

  // Gom nhóm theo từng session
  const bySession = new Map(sessions.map(s => [s.id, []]));
  (attendance || []).forEach(a => bySession.get(a.session_id)?.push(a));

  const totalStudentsCount = students?.length || 0;
  window._todaySessionsMap = {};

  const decoratedSessions = sessions.map(s => {
    const list = bySession.get(s.id) || [];
    const p = list.filter(a => a.status === 'có mặt').length;
    const l = list.filter(a => a.status === 'đi muộn').length;
    const ex = list.filter(a => a.status === 'vắng có phép').length;
    const totalSv = totalStudentsCount || 30;
    const un = Math.max(0, totalSv - p - l - ex);
    const absent = un + ex;
    const sessionObj = {
      ...s,
      present: p,
      late: l,
      excused: ex,
      unexcused: un,
      absent: absent,
      total: totalSv
    };
    window._todaySessionsMap[s.id] = sessionObj;
    return sessionObj;
  });

  window._currentReportData = { from, to, sessions: decoratedSessions, attendance: attendance || [], bySession };

  // Tính KPI tổng
  const totalSessions = decoratedSessions.length;
  const totalPresent = decoratedSessions.reduce((acc, s) => acc + (s.present || 0), 0);
  const totalLate = decoratedSessions.reduce((acc, s) => acc + (s.late || 0), 0);
  const totalExcused = decoratedSessions.reduce((acc, s) => acc + (s.excused || 0), 0);
  const totalUnexcused = decoratedSessions.reduce((acc, s) => acc + (s.unexcused || 0), 0);
  const totalExpected = totalSessions * (totalStudentsCount || 30);
  const tile = (label, value, color) => `
    <div style="padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px">
      <small style="color:var(--muted);font-size:11px">${label}</small>
      <div style="font-size:18px;font-weight:800;color:${color};margin-top:2px">${value}</div>
    </div>`;

  summary.innerHTML =
    tile('Tổng phiên', totalSessions, 'var(--text)') +
    tile('Có mặt', totalPresent, '#15803d') +
    tile('Đi muộn', totalLate, '#b45309') +
    tile('Có phép', totalExcused, '#7c3aed') +
    tile('Không phép', totalUnexcused, '#dc2626');

  if (countEl) countEl.textContent = `Tổng cộng: ${totalSessions} phiên`;

  listEl.innerHTML = decoratedSessions.map(renderSessionHistoryCard).join('');
}

async function exportAttendanceReportExcel() {
  const rep = window._currentReportData;
  if (!rep || !rep.sessions?.length) {
    toast('warn', 'Chưa có dữ liệu', 'Vui lòng lọc khoảng ngày có phiên điểm danh trước khi xuất Excel.');
    return;
  }
  await loadSheetJS();
  try {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Danh sách phiên
    const rowsSummary = [
      ['BÁO CÁO ĐIỂM DANH ROBOCON THEO KHOẢNG NGÀY'],
      ['Từ ngày: ' + rep.from + '  Đến ngày: ' + rep.to],
      ['Thời gian xuất: ' + new Date().toLocaleString('vi-VN')],
      [''],
      ['STT', 'Tên phiên', 'Thời gian bắt đầu', 'Trạng thái', 'Tổng SV', 'Có mặt', 'Đi muộn', 'Vắng có phép', 'Vắng K.phép', 'Tỉ lệ']
    ];
    rep.sessions.forEach((s, idx) => {
      const attended = (s.present || 0) + (s.late || 0);
      const r = s.total ? Math.round(attended * 100 / s.total) + '%' : '0%';
      rowsSummary.push([
        idx + 1,
        s.session_name,
        new Date(s.started_at).toLocaleString('vi-VN'),
        s.is_open ? 'Đang mở' : 'Đã đóng',
        s.total,
        s.present || 0,
        s.late || 0,
        s.excused || 0,
        s.unexcused || 0,
        r
      ]);
    });
    const wsSummary = XLSX.utils.aoa_to_sheet(rowsSummary);
    wsSummary['!cols'] = [{wch:6}, {wch:25}, {wch:22}, {wch:12}, {wch:10}, {wch:10}, {wch:10}, {wch:12}, {wch:12}, {wch:10}];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Danh sách phiên');

    // Sheet 2: Bảng chuyên cần từng sinh viên
    const stuMap = new Map();
    (students || []).forEach(s => {
      stuMap.set(s.mssv, { mssv: s.mssv, name: s.name, present: 0, late: 0, excused: 0, unexcused: 0 });
    });
    (rep.attendance || []).forEach(a => {
      const rec = stuMap.get(a.mssv);
      if (rec) {
        if (a.status === 'có mặt') rec.present++;
        else if (a.status === 'đi muộn') rec.late++;
        else if (a.status === 'vắng có phép') rec.excused++;
        else if (a.status === 'vắng không phép') rec.unexcused++;
      }
    });

    const rowsStudents = [
      ['BẢNG TỔNG KẾT CHUYÊN CẦN TỪNG SINH VIÊN'],
      ['Từ ngày: ' + rep.from + '  Đến ngày: ' + rep.to],
      [''],
      ['STT', 'MSSV', 'Họ và tên', 'Có mặt', 'Đi muộn', 'Vắng có phép', 'Vắng K.phép', 'Tổng vắng', 'Tỉ lệ chuyên cần']
    ];
    let sIdx = 1;
    stuMap.forEach(rec => {
      const totalSessions = rep.sessions.length;
      const attended = rec.present + rec.late;
      const rate = totalSessions ? Math.round(attended * 100 / totalSessions) + '%' : '0%';
      rowsStudents.push([
        sIdx++,
        rec.mssv,
        rec.name,
        rec.present,
        rec.late,
        rec.excused,
        rec.unexcused,
        rec.excused + rec.unexcused,
        rate
      ]);
    });
    const wsStudents = XLSX.utils.aoa_to_sheet(rowsStudents);
    wsStudents['!cols'] = [{wch:6}, {wch:14}, {wch:25}, {wch:10}, {wch:10}, {wch:12}, {wch:12}, {wch:12}, {wch:15}];
    XLSX.utils.book_append_sheet(wb, wsStudents, 'Chuyên cần sinh viên');

    XLSX.writeFile(wb, `BaoCao_DiemDanh_${rep.from}_${rep.to}.xlsx`);
    toast('ok', 'Đã xuất Excel', 'File gồm 2 sheet: Danh sách phiên và Chuyên cần từng sinh viên.');
  } catch (err) {
    console.error('Lỗi xuất Excel:', err);
    toast('err', 'Lỗi xuất Excel', err.message);
  }
}

function initializeAttendanceReportDates(){
  const from=document.getElementById('reportFromDate'),to=document.getElementById('reportToDate');if(!from||!to||from.value)return;
  const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),toLocal=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  from.value=toLocal(first);to.value=toLocal(now);
}

function toggleSidebar() {
  const drawer = document.getElementById('sidebarDrawer');
  const overlay = document.getElementById('sidebarOverlay');
  if (!drawer) return;
  const open = drawer.classList.toggle('open');
  overlay?.classList.toggle('show', open);
  drawer.setAttribute('aria-hidden', String(!open));
  document.getElementById('btnHamburger')?.setAttribute('aria-expanded', String(open));
  if (open) document.querySelector('.sidebar-close-btn')?.focus();
}

function closeSidebar() {
  const drawer = document.getElementById('sidebarDrawer');
  const overlay = document.getElementById('sidebarOverlay');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  if (overlay) overlay.classList.remove('show');
  document.getElementById('btnHamburger')?.setAttribute('aria-expanded', 'false');
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('sidebarDrawer')?.classList.contains('open')) closeSidebar();
});

