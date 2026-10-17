/* =====================================================================
   LH-NaviX Admin — admin.attendance.js
   Thành viên nhóm cho điểm danh & xuất Excel theo nhóm
   (Tách từ admin.html; các file nạp theo thứ tự, không đổi thứ tự.)
   ===================================================================== */
// ==========================================================
// TẢI THÀNH VIÊN NHÓM CHO ĐIỂM DANH
// ==========================================================
let teamMembersCache = new Map(); // team_id -> [mssv]

async function loadTeamMembersForAttendance(){
  if (!currentSession) return;
  const teamIds = teamGroups.map(t => t.id);
  if (!teamIds.length) return;

  const { data, error } = await supabase.from('team_group_members')
    .select('team_id, mssv')
    .in('team_id', teamIds);
  
  if (error) {
    console.error('loadTeamMembersForAttendance error:', error);
    return;
  }

  teamMembersCache.clear();
  (data || []).forEach(m => {
    if (!teamMembersCache.has(m.team_id)) teamMembersCache.set(m.team_id, []);
    teamMembersCache.get(m.team_id).push(m.mssv);
  });

  // Now render the groups table if visible
  renderGroupsTableIfVisible();
}

// ==========================================================
// XUẤT EXCEL THEO NHÓM
// ==========================================================
async function exportAttendanceByGroups(){
  if (!currentSession) return toast('warn', 'Chưa có phiên', 'Không có phiên điểm danh nào đang mở.');
  if (!teamGroups.length) return toast('warn', 'Chưa có nhóm', 'Vào mục Quản lý nhóm để tạo nhóm trước.');

  // Load members if not cached
  await loadTeamMembersForAttendance();

  // Check if SheetJS is available
  if (typeof XLSX === 'undefined') {
    // Load SheetJS dynamically
    await loadSheetJS();
  }

  try {
    const names = Object.fromEntries(students.map(s => [s.mssv, s.name]));
    const sessionName = currentSession.session_name || 'Phiên điểm danh';
    const safeName = sessionName.replace(/[<>:\"/\\|?*]/g, '_');
    
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Tổng hợp tất cả nhóm
    const summaryData = [
      ['BÁO CÁO ĐIỂM DANH THEO NHÓM'],
      ['Phiên: ' + sessionName],
      ['Ngày: ' + new Date(currentSession.started_at).toLocaleDateString('vi-VN')],
      [''],
      ['Nhóm', 'Lĩnh vực', 'Đội trưởng', 'Tổng', 'Có mặt', 'Đi muộn', 'Vắng K.phép', 'Có phép', 'Chưa quét', 'Tỷ lệ (%)']
    ];
    
    teamGroups.forEach(team => {
      const memberMssvs = teamMembersCache.get(team.id) || [];
      const leaderName = names[team.leader_mssv] || 'Chưa chọn';
      
      let present = 0, late = 0, absent = 0, excused = 0, unmarked = 0;
      memberMssvs.forEach(mssv => {
        const a = attendanceMap[mssv];
        if (!a) unmarked++;
        else if (a.status === 'có mặt') present++;
        else if (a.status === 'đi muộn') late++;
        else if (a.status === 'vắng có phép') excused++;
        else absent++;
      });
      
      const total = memberMssvs.length;
      const rate = total ? Math.round(((present + late) / total) * 100) : 0;
      
      summaryData.push([team.name, team.field, leaderName, total, present, late, absent, excused, unmarked, rate + '%']);
    });
    
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{wch:25}, {wch:18}, {wch:20}, {wch:8}, {wch:10}, {wch:10}, {wch:12}, {wch:10}, {wch:10}, {wch:10}];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng hợp');
    
    // Sheet cho từng nhóm
    teamGroups.forEach(team => {
      const memberMssvs = teamMembersCache.get(team.id) || [];
      if (!memberMssvs.length) return;
      
      const teamData = [
        ['DANH SÁCH CHI TIẾT: ' + team.name],
        ['Lĩnh vực: ' + team.field],
        ['Đội trưởng: ' + (names[team.leader_mssv] || 'Chưa chọn')],
        [''],
        ['STT', 'MSSV', 'Họ tên', 'Trạng thái', 'Lĩnh vực', 'Ghi chú', 'Thời gian']
      ];
      
      memberMssvs.forEach((mssv, idx) => {
        const a = attendanceMap[mssv];
        const status = a?.status || 'Chưa điểm danh';
        const category = a?.category || '';
        const note = a?.note || '';
        const time = a?.time || '—';
        
        teamData.push([idx + 1, mssv, names[mssv] || mssv, status, category, note, time]);
      });
      
      const ws = XLSX.utils.aoa_to_sheet(teamData);
      ws['!cols'] = [{wch:6}, {wch:12}, {wch:25}, {wch:18}, {wch:15}, {wch:30}, {wch:10}];
      XLSX.utils.book_append_sheet(wb, ws, team.name.substring(0, 31));
    });
    
    // Sheet chi tiết tất cả sinh viên (flat)
    const allData = [
      ['DANH SÁCH ĐẦY ĐỦ TẤT CẢ SINH VIÊN'],
      ['Phiên: ' + sessionName],
      ['Ngày: ' + new Date(currentSession.started_at).toLocaleDateString('vi-VN')],
      [''],
      ['STT', 'Nhóm', 'MSSV', 'Họ tên', 'Trạng thái', 'Lĩnh vực', 'Ghi chú', 'Thời gian']
    ];
    
    let stt = 1;
    teamGroups.forEach(team => {
      const memberMssvs = teamMembersCache.get(team.id) || [];
      memberMssvs.forEach(mssv => {
        const a = attendanceMap[mssv];
        const status = a?.status || 'Chưa điểm danh';
        const category = a?.category || '';
        const note = a?.note || '';
        const time = a?.time || '—';
        
        allData.push([stt++, team.name, mssv, names[mssv] || mssv, status, category, note, time]);
      });
    });
    
    const wsAll = XLSX.utils.aoa_to_sheet(allData);
    wsAll['!cols'] = [{wch:6}, {wch:20}, {wch:12}, {wch:25}, {wch:18}, {wch:15}, {wch:30}, {wch:10}];
    XLSX.utils.book_append_sheet(wb, wsAll, 'Tất cả SV');
    
    XLSX.writeFile(wb, 'DiemDanh_' + safeName + '_' + new Date().toISOString().slice(0,10) + '.xlsx');
    toast('ok', 'Đã xuất Excel', 'File bao gồm: Tổng hợp, Chi tiết từng nhóm, Danh sách đầy đủ');
  } catch (e) {
    console.error('Export error:', e);
    toast('err', 'Xuất Excel thất bại', e.message);
  }
}

function loadSheetJS(){
  return new Promise((resolve, reject) => {
    if (typeof XLSX !== 'undefined') return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Không tải được SheetJS'));
    document.head.appendChild(script);
  });
}

