/* =====================================================================
   LH-NaviX Admin — admin.performance.js
   Module điều khiển giao diện Đánh giá hiệu suất thành viên (Milestone 3)
   Tích hợp PerformanceEngine (M2) và Supabase RPC save_captain_adjustment (M1)
   ===================================================================== */

(function (window) {
  'use strict';

  // State quản lý của Performance View
  let perfMembersData = [];
  let perfFilteredData = [];
  let perfFromDate = '';
  let perfToDate = '';
  let perfCurrentPeriodKey = 'default';
  let perfSelectedMssv = null;
  let perfTeamsMap = new Map();         // teamId -> team object
  let perfStudentTeamMap = new Map();  // mssv -> team object
  let perfAdjustmentsMap = new Map();  // mssv -> evaluation record

  /**
   * Khởi tạo ngày mặc định cho bộ lọc đánh giá hiệu suất (Tháng hiện tại).
   */
  function initDefaultDates() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');

    // Mặc định từ ngày đầu tháng đến hôm nay
    perfFromDate = `${y}-${m}-01`;
    perfToDate = `${y}-${m}-${d}`;
    perfCurrentPeriodKey = `perf_${perfFromDate}_${perfToDate}`;

    const fromEl = document.getElementById('perfFromDate');
    const toEl = document.getElementById('perfToDate');
    if (fromEl) fromEl.value = perfFromDate;
    if (toEl) toEl.value = perfToDate;

    updatePeriodLabel();
  }

  /**
   * Cập nhật nhãn hiển thị kỳ đánh giá trên thanh công cụ.
   */
  function updatePeriodLabel() {
    const labelEl = document.getElementById('perfPeriodLabel');
    if (!labelEl) return;
    if (perfFromDate && perfToDate) {
      const fromParts = perfFromDate.split('-');
      const toParts = perfToDate.split('-');
      const fromFmt = `${fromParts[2]}/${fromParts[1]}/${fromParts[0]}`;
      const toFmt = `${toParts[2]}/${toParts[1]}/${toParts[0]}`;
      labelEl.textContent = `${fromFmt} → ${toFmt}`;
    } else {
      labelEl.textContent = 'Toàn bộ thời gian';
    }
  }

  /**
   * Đặt nhanh khoảng ngày lọc (Tháng này, Học kỳ, Tất cả).
   * @param {'month'|'semester'|'all'} type
   */
  function setPerfQuickFilter(type) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');

    // Cập nhật trạng thái active của các nút lọc nhanh
    ['Month', 'Semester', 'All'].forEach(name => {
      const btn = document.getElementById('btnPerfQuick' + name);
      if (btn) btn.classList.remove('active');
    });

    if (type === 'month') {
      const btnMonth = document.getElementById('btnPerfQuickMonth');
      if (btnMonth) btnMonth.classList.add('active');
      perfFromDate = `${y}-${m}-01`;
      perfToDate = `${y}-${m}-${d}`;
    } else if (type === 'semester') {
      const btnSem = document.getElementById('btnPerfQuickSemester');
      if (btnSem) btnSem.classList.add('active');
      let semStart = `${y}-01-01`;
      let semEnd = `${y}-06-30`;
      try {
        if (typeof getStoredSemesterDateRange === 'function') {
          const sem = getStoredSemesterDateRange();
          if (sem && sem.start && sem.end) {
            semStart = sem.start;
            semEnd = sem.end;
          }
        } else {
          const savedRange = localStorage.getItem('me_sync_date_range');
          if (savedRange) {
            const parsed = JSON.parse(savedRange);
            if (parsed.start && parsed.end) {
              semStart = parsed.start;
              semEnd = parsed.end;
            }
          }
        }
      } catch (_) {}
      perfFromDate = semStart;
      perfToDate = semEnd;
    } else if (type === 'all') {
      const btnAll = document.getElementById('btnPerfQuickAll');
      if (btnAll) btnAll.classList.add('active');
      perfFromDate = `${y - 1}-09-01`;
      perfToDate = `${y}-${m}-${d}`;
    }

    const fromEl = document.getElementById('perfFromDate');
    const toEl = document.getElementById('perfToDate');
    if (fromEl) fromEl.value = perfFromDate;
    if (toEl) toEl.value = perfToDate;

    perfCurrentPeriodKey = `perf_${perfFromDate}_${perfToDate}`;
    updatePeriodLabel();
    loadPerformanceData();
  }

  /**
   * Áp dụng khoảng ngày lọc khi người dùng bấm nút "Lọc đánh giá".
   */
  function applyPerformanceFilter() {
    const fromEl = document.getElementById('perfFromDate');
    const toEl = document.getElementById('perfToDate');
    if (fromEl) perfFromDate = fromEl.value;
    if (toEl) perfToDate = toEl.value;

    if (perfFromDate && perfToDate && perfFromDate > perfToDate) {
      if (typeof toast === 'function') {
        toast('warn', 'Khoảng ngày không hợp lệ', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      }
      return;
    }

    perfCurrentPeriodKey = (perfFromDate && perfToDate)
      ? `perf_${perfFromDate}_${perfToDate}`
      : 'default';

    updatePeriodLabel();
    loadPerformanceData();
  }

  /**
   * Làm mới dữ liệu đánh giá hiệu suất.
   */
  function refreshPerformanceView() {
    loadPerformanceData();
  }

  /**
   * Nạp toàn bộ dữ liệu (sinh viên, nhóm, phiên điểm danh, kết quả điểm danh, điểm điều chỉnh)
   * và tính toán điểm hiệu suất qua PerformanceEngine.
   */
  async function loadPerformanceData() {
    const tbody = document.getElementById('perfTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center;padding:36px;color:var(--muted);">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
              <span class="spin" style="width:24px;height:24px;"></span>
              <span>Đang tính toán điểm hiệu suất chuyên cần...</span>
            </div>
          </td>
        </tr>
      `;
    }

    try {
      // 1. Nạp danh sách sinh viên
      let studentList = [];
      if (typeof students !== 'undefined' && Array.isArray(students) && students.length > 0) {
        studentList = students.slice();
      } else if (typeof supabase !== 'undefined') {
        const { data: stData, error: stErr } = await supabase
          .from('students')
          .select('*')
          .order('name');
        if (!stErr && Array.isArray(stData)) {
          studentList = stData;
        }
      }

      // 2. Nạp nhóm chuyên môn và thành viên nhóm
      perfTeamsMap.clear();
      perfStudentTeamMap.clear();

      if (typeof supabase !== 'undefined') {
        try {
          const [{ data: groupsData }, { data: membersData }] = await Promise.all([
            supabase.from('team_groups').select('id, name, field, leader_mssv'),
            supabase.from('team_group_members').select('team_id, mssv')
          ]);

          if (Array.isArray(groupsData)) {
            groupsData.forEach(g => perfTeamsMap.set(g.id, g));
          }
          if (Array.isArray(membersData)) {
            membersData.forEach(m => {
              const team = perfTeamsMap.get(m.team_id);
              if (team) {
                perfStudentTeamMap.set(m.mssv, team);
              }
            });
          }
        } catch (teamErr) {
          console.warn('[Performance] Không nạp được nhóm từ Supabase:', teamErr);
        }
      }

      // Cập nhật bộ lọc Nhóm trong giao diện
      populateTeamFilterSelect();

      // 3. Nạp danh sách các phiên điểm danh trong khoảng ngày
      let sessionIds = [];
      let sessionsMap = new Map();

      if (typeof supabase !== 'undefined' && perfFromDate && perfToDate) {
        try {
          const fromIso = `${perfFromDate}T00:00:00+07:00`;
          const toIso = `${perfToDate}T23:59:59+07:00`;

          const { data: sessData, error: sessErr } = await supabase
            .from('sessions')
            .select('id, session_name, started_at, is_open, warn_before_min')
            .gte('started_at', fromIso)
            .lte('started_at', toIso);

          if (!sessErr && Array.isArray(sessData)) {
            sessData.forEach(s => {
              sessionIds.push(s.id);
              sessionsMap.set(s.id, s);
            });
          }
        } catch (sErr) {
          console.warn('[Performance] Lỗi nạp phiên điểm danh:', sErr);
        }
      }

      // 4. Nạp bản ghi điểm danh thuộc các phiên đó
      let attendanceRecordsByMssv = new Map();

      if (typeof supabase !== 'undefined' && sessionIds.length > 0) {
        try {
          // Chia nhỏ theo chunk 50 phiên để tránh lỗi URL quá dài
          const chunkSize = 50;
          for (let i = 0; i < sessionIds.length; i += chunkSize) {
            const chunk = sessionIds.slice(i, i + chunkSize);
            const { data: attData, error: attErr } = await supabase
              .from('attendance')
              .select('id, session_id, mssv, full_name, status, category, note, created_at')
              .in('session_id', chunk);

            if (attErr) {
              console.error('[Performance] Lỗi nạp bảng attendance:', attErr);
            } else if (Array.isArray(attData)) {
              attData.forEach(rec => {
                const sId = rec.session_id;
                const sess = sessionsMap.get(sId);
                const enriched = {
                  ...rec,
                  session_started_at: sess ? sess.started_at : null,
                  session_warn_min: sess ? (sess.warn_before_min || 30) : 30
                };
                const mssvKey = String(rec.mssv).trim();
                if (!attendanceRecordsByMssv.has(mssvKey)) {
                  attendanceRecordsByMssv.set(mssvKey, []);
                }
                attendanceRecordsByMssv.get(mssvKey).push(enriched);
              });
            }
          }
        } catch (attErr) {
          console.warn('[Performance] Lỗi nạp bảng attendance:', attErr);
        }
      }

      // 5. Nạp điểm điều chỉnh của đội trưởng (từ Supabase và localStorage fallback)
      perfAdjustmentsMap.clear();

      // 5.1. Nạp từ localStorage trước (đảm bảo hiển thị tức thì kể cả offline)
      try {
        const localCacheKey = 'member_perf_eval_' + perfCurrentPeriodKey;
        const localStored = localStorage.getItem(localCacheKey);
        if (localStored) {
          const parsed = JSON.parse(localStored);
          Object.keys(parsed).forEach(k => {
            perfAdjustmentsMap.set(String(k).trim(), parsed[k]);
          });
        }
      } catch (locErr) {
        console.warn('[Performance] Lỗi đọc local evaluation cache:', locErr);
      }

      // 5.2. Nạp từ bảng member_performance_evaluations trên Supabase
      if (typeof supabase !== 'undefined') {
        try {
          const { data: evalData, error: evalErr } = await supabase
            .from('member_performance_evaluations')
            .select('*')
            .eq('period_key', perfCurrentPeriodKey);

          if (!evalErr && Array.isArray(evalData)) {
            evalData.forEach(row => {
              perfAdjustmentsMap.set(String(row.mssv).trim(), row);
            });
          }
        } catch (evalErr) {
          console.warn('[Performance] Lỗi nạp member_performance_evaluations:', evalErr);
        }
      }

      // 6. Tính toán điểm cho từng thành viên qua PerformanceEngine
      const engine = (typeof window !== 'undefined' && window.PerformanceEngine)
        ? window.PerformanceEngine
        : (typeof PerformanceEngine !== 'undefined' ? PerformanceEngine : null);

      if (!engine) {
        throw new Error('Không tìm thấy PerformanceEngine (admin.performance.calc.js). Vui lòng kiểm tra script tags.');
      }

      const calculatedList = [];

      studentList.forEach(student => {
        const mssv = String(student.mssv).trim();
        const records = attendanceRecordsByMssv.get(mssv) || [];
        const team = perfStudentTeamMap.get(mssv) || null;

        // Tính điểm chuyên cần
        const calcResult = engine.calculateAttendanceScore(records);

        // Lấy điểm điều chỉnh đội trưởng
        const adjRecord = perfAdjustmentsMap.get(mssv) || null;
        const captainAdjustment = adjRecord ? (Number(adjRecord.captain_adjustment) || 0) : 0;
        const captainNotes = adjRecord ? (adjRecord.notes || '') : '';
        const adjustedBy = adjRecord ? (adjRecord.adjusted_by || 'Đội trưởng') : 'Đội trưởng';

        // Tổng điểm cuối cùng kẹp [0, 100]
        const finalScore = engine.calculateFinalScore(calcResult.attendanceScore, captainAdjustment);

        // Xếp loại 5 bậc
        const tierInfo = engine.getPerformanceTier(finalScore);

        // Trạng thái dữ liệu: nếu không có buổi điểm danh nào trong kỳ thì giữ 100 điểm kèm nhãn "Chưa có dữ liệu"
        const hasAttendanceData = calcResult.hasData && records.length > 0;

        calculatedList.push({
          student: student,
          mssv: mssv,
          name: student.name || mssv,
          team: team,
          teamName: team ? team.name : (student.class_name || 'Chưa vào nhóm'),
          calcResult: calcResult,
          captainAdjustment: captainAdjustment,
          captainNotes: captainNotes,
          adjustedBy: adjustedBy,
          finalScore: finalScore,
          tierInfo: tierInfo,
          hasAttendanceData: hasAttendanceData,
          totalSessionsInRange: sessionIds.length
        });
      });

      // Sắp xếp: điểm cao xuống thấp, sau đó theo tên A-Z
      calculatedList.sort((a, b) => {
        if (b.finalScore !== a.finalScore) {
          return b.finalScore - a.finalScore;
        }
        return a.name.localeCompare(b.name, 'vi');
      });

      perfMembersData = calculatedList;

      // Cập nhật thẻ KPI Cards
      updatePerformanceKpiCards(perfMembersData);

      // Render bảng thành viên
      filterPerformanceTable();

    } catch (err) {
      console.error('[Performance] Lỗi tính toán hiệu suất:', err);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="12" style="text-align:center;padding:32px;color:var(--err);">
              ⚠️ Lỗi khi tải dữ liệu đánh giá: ${err.message || 'Không xác định'}. Vui lòng bấm "Làm mới" để thử lại.
            </td>
          </tr>
        `;
      }
    }
  }

  /**
   * Cập nhật các thẻ KPI Cards trên Dashboard.
   * @param {Array<Object>} list
   */
  function updatePerformanceKpiCards(list) {
    const total = list.length;
    let excellentCount = 0;
    let goodCount = 0;
    let fairCount = 0;
    let needsImprovementCount = 0;
    let highRiskCount = 0;
    let totalScoreSum = 0;

    list.forEach(item => {
      totalScoreSum += item.finalScore;
      const t = item.tierInfo.tier;
      if (t === 'EXCELLENT') excellentCount++;
      else if (t === 'GOOD') goodCount++;
      else if (t === 'FAIR') fairCount++;
      else if (t === 'NEEDS_IMPROVEMENT') needsImprovementCount++;
      else if (t === 'HIGH_RISK') highRiskCount++;
    });

    const avgScore = total > 0 ? (Math.round((totalScoreSum / total) * 10) / 10) : 100;

    const elTotal = document.getElementById('perfKpiTotalMembers');
    const elExc = document.getElementById('perfKpiExcellent');
    const elGood = document.getElementById('perfKpiGood');
    const elFair = document.getElementById('perfKpiFair');
    const elWarn = document.getElementById('perfKpiNeedsImprovement');
    const elRisk = document.getElementById('perfKpiHighRisk');
    const elAvg = document.getElementById('perfKpiAverageScore');

    if (elTotal) elTotal.textContent = total;
    if (elExc) elExc.textContent = excellentCount;
    if (elGood) elGood.textContent = goodCount;
    if (elFair) elFair.textContent = fairCount;
    if (elWarn) elWarn.textContent = needsImprovementCount;
    if (elRisk) elRisk.textContent = highRiskCount;
    if (elAvg) elAvg.textContent = avgScore.toFixed(1);
  }

  /**
   * Đổ dữ liệu vào select chọn Nhóm chuyên môn.
   */
  function populateTeamFilterSelect() {
    const select = document.getElementById('perfTeamFilter');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="all">👥 Tất cả nhóm</option>';

    const teams = Array.from(perfTeamsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    teams.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.name} (${t.field || 'Chuyên môn'})`;
      select.appendChild(opt);
    });

    if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
      select.value = currentVal;
    }
  }

  /**
   * Lọc và vẽ bảng thành viên theo nhóm, xếp loại và từ khóa tìm kiếm.
   */
  function filterPerformanceTable() {
    const tbody = document.getElementById('perfTableBody');
    if (!tbody) return;

    const teamFilter = document.getElementById('perfTeamFilter')?.value || 'all';
    const tierFilter = document.getElementById('perfTierFilter')?.value || 'all';
    const searchText = (document.getElementById('perfSearchInput')?.value || '').trim().toLowerCase();

    const filtered = perfMembersData.filter(item => {
      // 1. Lọc nhóm
      if (teamFilter !== 'all') {
        const itemTeamId = item.team ? item.team.id : '';
        if (itemTeamId !== teamFilter) return false;
      }

      // 2. Lọc xếp loại
      if (tierFilter !== 'all') {
        if (tierFilter === 'NODATA') {
          if (item.hasAttendanceData) return false;
        } else if (item.tierInfo.tier !== tierFilter) {
          return false;
        }
      }

      // 3. Lọc từ khóa tìm kiếm (MSSV hoặc Họ tên)
      if (searchText) {
        const mssvMatch = item.mssv.toLowerCase().includes(searchText);
        const nameMatch = item.name.toLowerCase().includes(searchText);
        if (!mssvMatch && !nameMatch) return false;
      }

      return true;
    });

    perfFilteredData = filtered;

    const summaryText = document.getElementById('perfTableSummaryText');
    if (summaryText) {
      summaryText.textContent = `Hiển thị ${filtered.length} / ${perfMembersData.length} thành viên trong kỳ đánh giá.`;
    }

    const rowCountInfo = document.getElementById('perfRowCountInfo');
    if (rowCountInfo) {
      rowCountInfo.textContent = `${filtered.length} thành viên`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center;padding:36px;color:var(--muted);">
            Không tìm thấy thành viên nào phù hợp với bộ lọc hiện tại.
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = filtered.map((item, idx) => {
      const cr = item.calcResult;
      const initial = (item.name || '?').trim().slice(-1).toUpperCase();

      // Có mặt
      const presentHtml = cr.presentCount > 0
        ? `<b style="color:var(--ok);font-size:13.5px;">${cr.presentCount}</b>`
        : `<span style="color:var(--muted);font-weight:600;">0</span>`;

      // Chi tiết vắng có phép: phân tách rành mạch Lịch học (0đ) vs Việc riêng (-2đ)
      let excusedDetailHtml = '<span style="color:var(--muted);font-weight:600;">0</span>';
      if (cr.excusedCount > 0) {
        const parts = [];
        if (cr.excusedSchoolCount > 0) {
          parts.push(`<span class="perf-tag school" title="${cr.excusedSchoolCount} buổi trùng lịch học ME (Miễn trừ: không trừ điểm)">📚 ${cr.excusedSchoolCount} Lịch học</span>`);
        }
        if (cr.excusedOtherCount > 0) {
          parts.push(`<span class="perf-tag other" title="${cr.excusedOtherCount} buổi có phép việc riêng (Trừ -${cr.excusedOtherCount * 2}đ)">⚠️ ${cr.excusedOtherCount} Phép (-${cr.excusedOtherCount * 2}đ)</span>`);
        }
        excusedDetailHtml = `<div style="display:inline-flex;flex-direction:column;gap:3px;align-items:center;">${parts.join('')}</div>`;
      }

      // Vắng không phép: đỏ nổi bật
      let unexcusedHtml = '<span style="color:var(--muted);font-weight:600;">0</span>';
      if (cr.unexcusedCount > 0) {
        unexcusedHtml = `<span class="perf-tag unexcused" title="${cr.unexcusedCount} buổi vắng không phép (Trừ -${cr.unexcusedCount * 10}đ)">⛔ ${cr.unexcusedCount} (-${cr.unexcusedCount * 10}đ)</span>`;
      }

      // Đi muộn: số phút & điểm trừ rõ ràng (thay vì viết tắt 1L)
      let lateHtml = '<span style="color:var(--muted);font-weight:600;">0</span>';
      if (cr.lateCount > 0 || cr.totalLateMinutes > 0) {
        if (cr.totalLateDeduction > 0) {
          lateHtml = `<span class="perf-tag late-deduct" title="${cr.lateCount} lần đi muộn, tổng ${cr.totalLateMinutes} phút (Trừ -${cr.totalLateDeduction}đ)">⏰ ${cr.totalLateMinutes}p <small style="opacity:0.9;">(-${cr.totalLateDeduction}đ)</small></span>`;
        } else {
          lateHtml = `<span class="perf-tag late-grace" title="${cr.lateCount} lần đi muộn dưới 10 phút (Ân hạn: 0đ trừ)">⏰ ${cr.totalLateMinutes}p <small style="color:var(--muted);">(0đ)</small></span>`;
        }
      }

      // Điểm chuyên cần tự động
      const attScoreColor = cr.attendanceScore >= 80 ? 'var(--ok)' : (cr.attendanceScore >= 60 ? 'var(--warn)' : 'var(--err)');
      const attScoreHtml = `<span class="perf-score-pill" style="color:${attScoreColor}">${cr.attendanceScore}</span>`;

      // Điểm điều chỉnh của đội trưởng (+/-)
      const adjVal = item.captainAdjustment;
      let adjDisplay = '+0đ';
      let adjBtnClass = 'perf-adjust-btn';
      if (adjVal > 0) {
        adjDisplay = `+${adjVal}đ`;
        adjBtnClass += ' has-adj';
      } else if (adjVal < 0) {
        adjDisplay = `${adjVal}đ`;
        adjBtnClass += ' neg';
      }

      const noteTooltip = item.captainNotes ? ` title="${escapeHtml(item.captainNotes)}"` : ' title="Bấm để chấm / điều chỉnh điểm"';
      const adjButtonHtml = `
        <button type="button" class="${adjBtnClass}" onclick="openCaptainAdjustModal('${escapeJsAttr(item.mssv)}')"${noteTooltip}>
          <span>${adjDisplay}</span>
          <span style="font-size:10px;margin-left:2px;">✏️</span>
        </button>
      `;

      // Tổng điểm cuối cùng sau điều chỉnh
      const finalColor = item.finalScore >= 80 ? 'var(--ok)' : (item.finalScore >= 70 ? '#0891b2' : (item.finalScore >= 50 ? '#d97706' : '#dc2626'));
      const finalScoreHtml = `<b style="font-size:15px;font-weight:800;color:${finalColor}">${item.finalScore}</b>`;

      // Xếp loại 5 bậc trực quan
      const tierBadge = `<span class="perf-tier-badge ${item.tierInfo.badgeClass}">${item.tierInfo.label}</span>`;

      return `
        <tr>
          <td style="text-align:center;font-weight:700;color:var(--muted);">${idx + 1}</td>
          <td class="td-mono" style="font-weight:700;">${escapeHtml(item.mssv)}</td>
          <td>
            <div class="student-cell">
              <div class="avt" style="background:#2563eb;color:#fff;">${initial}</div>
              <div>
                <div class="td-name" style="font-weight:700;">${escapeHtml(item.name)}</div>
                ${!item.hasAttendanceData ? '<div style="font-size:10px;color:var(--muted);font-weight:600;">(Chưa có dữ liệu)</div>' : ''}
              </div>
            </div>
          </td>
          <td>
            <span class="stu-team-badge" style="font-size:11px;" title="${escapeHtml(item.teamName)}">
              ${escapeHtml(item.teamName)}
            </span>
          </td>
          <td style="text-align:center;">${presentHtml}</td>
          <td style="text-align:center;">${excusedDetailHtml}</td>
          <td style="text-align:center;">${unexcusedHtml}</td>
          <td style="text-align:center;">${lateHtml}</td>
          <td style="text-align:center;">${attScoreHtml}</td>
          <td style="text-align:center;">${adjButtonHtml}</td>
          <td style="text-align:center;">${finalScoreHtml}</td>
          <td style="text-align:center;">${tierBadge}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml;
  }

  /**
   * Mở modal điều chỉnh điểm đội trưởng cho sinh viên cụ thể.
   * @param {string} mssv
   */
  function openCaptainAdjustModal(mssv) {
    const item = perfMembersData.find(m => m.mssv === mssv);
    if (!item) return;

    perfSelectedMssv = mssv;

    const modal = document.getElementById('perfAdjustModal');
    if (!modal) return;

    document.getElementById('perfAdjustTargetMssv').value = mssv;
    document.getElementById('perfAdjustStudentName').textContent = item.name;
    document.getElementById('perfAdjustStudentMssv').textContent = item.mssv;
    document.getElementById('perfAdjustStudentTeam').textContent = item.teamName;
    document.getElementById('perfAdjustBaseScore').textContent = item.calcResult.attendanceScore;

    const scoreInput = document.getElementById('perfAdjustScoreInput');
    const notesInput = document.getElementById('perfAdjustNotesInput');

    if (scoreInput) scoreInput.value = item.captainAdjustment || 0;
    if (notesInput) notesInput.value = item.captainNotes || '';

    updatePerfPreviewScore();
    modal.classList.add('show');
  }

  /**
   * Đóng modal điều chỉnh điểm.
   */
  function closePerfAdjustModal() {
    const modal = document.getElementById('perfAdjustModal');
    if (modal) modal.classList.remove('show');
    perfSelectedMssv = null;
  }

  /**
   * Cập nhật tức thời bản xem trước (Live Preview) điểm tổng kết và xếp loại trong modal.
   */
  function updatePerfPreviewScore() {
    const baseScoreEl = document.getElementById('perfAdjustBaseScore');
    const scoreInput = document.getElementById('perfAdjustScoreInput');
    const previewScoreEl = document.getElementById('perfAdjustPreviewFinalScore');
    const previewBadgeEl = document.getElementById('perfAdjustPreviewTierBadge');

    const baseScore = baseScoreEl ? (Number(baseScoreEl.textContent) || 0) : 100;
    const adjustment = scoreInput ? (parseFloat(scoreInput.value) || 0) : 0;

    const engine = (typeof window !== 'undefined' && window.PerformanceEngine) ? window.PerformanceEngine : null;
    let finalScore = baseScore + adjustment;
    let tier = { label: 'Xuất sắc', badgeClass: 'st-excellent' };

    if (engine) {
      finalScore = engine.calculateFinalScore(baseScore, adjustment);
      tier = engine.getPerformanceTier(finalScore);
    } else {
      finalScore = Math.max(0, Math.min(100, Math.round(finalScore * 10) / 10));
    }

    if (previewScoreEl) {
      previewScoreEl.textContent = finalScore;
      previewScoreEl.style.color = finalScore >= 80 ? 'var(--ok)' : (finalScore >= 70 ? '#0891b2' : (finalScore >= 50 ? '#d97706' : '#dc2626'));
    }

    if (previewBadgeEl) {
      previewBadgeEl.textContent = tier.label;
      previewBadgeEl.className = `perf-tier-badge ${tier.badgeClass}`;
    }
  }

  /**
   * Gửi điểm điều chỉnh của đội trưởng lên hệ thống và lưu trữ vào Supabase.
   */
  async function submitCaptainAdjustment() {
    const mssv = document.getElementById('perfAdjustTargetMssv')?.value || perfSelectedMssv;
    if (!mssv) return;

    const scoreInput = document.getElementById('perfAdjustScoreInput');
    const notesInput = document.getElementById('perfAdjustNotesInput');
    const btn = document.getElementById('btnSavePerfAdjustment');

    const adjustment = scoreInput ? (parseFloat(scoreInput.value) || 0) : 0;
    const notes = notesInput ? notesInput.value.trim() : '';

    if (isNaN(adjustment)) {
      if (typeof toast === 'function') {
        toast('warn', 'Giá trị không hợp lệ', 'Vui lòng nhập số điểm điều chỉnh hợp lệ.');
      }
      return;
    }

    const oldText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Đang lưu...';
    }

    try {
      await saveCaptainAdjustment(mssv, perfCurrentPeriodKey, adjustment, notes);
      closePerfAdjustModal();
    } catch (err) {
      console.error('[Performance] submitCaptainAdjustment error:', err);
      if (typeof toast === 'function') {
        toast('err', 'Lưu điểm thất bại', err.message || 'Không thể lưu điểm điều chỉnh.');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldText;
      }
    }
  }

  /**
   * Lưu điểm điều chỉnh của đội trưởng qua Supabase RPC save_captain_adjustment
   * (Kèm cơ chế fallback lưu localStorage nếu offline/mất kết nối).
   *
   * @param {string} mssv
   * @param {string} periodKey
   * @param {number} adjustment
   * @param {string} notes
   */
  async function saveCaptainAdjustment(mssv, periodKey, adjustment, notes) {
    const cleanMssv = String(mssv).trim();
    const cleanPeriodKey = String(periodKey || 'default').trim();
    const numAdjustment = Number(adjustment) || 0;
    const cleanNotes = String(notes || '').trim();

    let savedRemote = false;

    // 1. Thử gọi RPC Supabase save_captain_adjustment
    if (typeof supabase !== 'undefined') {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('save_captain_adjustment', {
          p_mssv: cleanMssv,
          p_period_key: cleanPeriodKey,
          p_adjustment: numAdjustment,
          p_notes: cleanNotes,
          p_period_from: perfFromDate || null,
          p_period_to: perfToDate || null
        });

        if (!rpcErr && rpcRes && rpcRes.ok !== false) {
          savedRemote = true;
          perfAdjustmentsMap.set(cleanMssv, rpcRes.data || {
            mssv: cleanMssv,
            period_key: cleanPeriodKey,
            captain_adjustment: numAdjustment,
            notes: cleanNotes,
            adjusted_by: 'Đội trưởng'
          });
        } else {
          console.warn('[Performance] RPC save_captain_adjustment báo lỗi:', rpcErr || rpcRes);
        }
      } catch (cloudErr) {
        console.warn('[Performance] Ngoại lệ khi gọi Supabase RPC:', cloudErr);
      }
    }

    // 2. Fallback: Lưu vào LocalStorage để đảm bảo bền vững dữ liệu ngay cả khi demo/offline
    try {
      const localCacheKey = 'member_perf_eval_' + cleanPeriodKey;
      const stored = JSON.parse(localStorage.getItem(localCacheKey) || '{}');
      stored[cleanMssv] = {
        mssv: cleanMssv,
        period_key: cleanPeriodKey,
        period_from: perfFromDate || null,
        period_to: perfToDate || null,
        captain_adjustment: numAdjustment,
        notes: cleanNotes,
        adjusted_by: 'Đội trưởng',
        updated_at: new Date().toISOString()
      };
      localStorage.setItem(localCacheKey, JSON.stringify(stored));
      perfAdjustmentsMap.set(cleanMssv, stored[cleanMssv]);
    } catch (locErr) {
      console.warn('[Performance] Lỗi ghi local cache:', locErr);
    }

    // 3. Cập nhật ngay lập tức bộ nhớ in-memory và giao diện người dùng (Realtime)
    const engine = (typeof window !== 'undefined' && window.PerformanceEngine) ? window.PerformanceEngine : null;
    const targetItem = perfMembersData.find(m => m.mssv === cleanMssv);
    if (targetItem) {
      targetItem.captainAdjustment = numAdjustment;
      targetItem.captainNotes = cleanNotes;
      targetItem.adjustedBy = 'Đội trưởng';

      if (engine) {
        targetItem.finalScore = engine.calculateFinalScore(targetItem.calcResult.attendanceScore, numAdjustment);
        targetItem.tierInfo = engine.getPerformanceTier(targetItem.finalScore);
      } else {
        targetItem.finalScore = Math.max(0, Math.min(100, Math.round((targetItem.calcResult.attendanceScore + numAdjustment) * 10) / 10));
      }
    }

    // Sắp xếp lại và vẽ lại bảng & KPI cards
    perfMembersData.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return a.name.localeCompare(b.name, 'vi');
    });

    updatePerformanceKpiCards(perfMembersData);
    filterPerformanceTable();

    if (typeof toast === 'function') {
      const sign = numAdjustment > 0 ? `+${numAdjustment}` : `${numAdjustment}`;
      const msg = savedRemote
        ? `Đã lưu điểm điều chỉnh ${sign} cho ${targetItem ? targetItem.name : cleanMssv} vào Supabase.`
        : `Đã lưu cục bộ điểm điều chỉnh ${sign} cho ${targetItem ? targetItem.name : cleanMssv}.`;
      toast('ok', 'Đã lưu điểm hiệu suất', msg);
    }

    return true;
  }

  /**
   * Xuất báo cáo Đánh giá hiệu suất thành viên ra file Excel (.xlsx).
   */
  async function exportPerformanceExcel() {
    if (!perfMembersData || perfMembersData.length === 0) {
      if (typeof toast === 'function') {
        toast('warn', 'Chưa có dữ liệu', 'Không có dữ liệu đánh giá để xuất Excel.');
      }
      return;
    }

    try {
      // 1. Kiểm tra thư viện XLSX (SheetJS)
      if (typeof XLSX === 'undefined') {
        if (typeof loadSheetJS === 'function') {
          await loadSheetJS();
        } else {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Không thể tải thư viện SheetJS.'));
            document.head.appendChild(script);
          });
        }
      }

      const listToExport = (perfFilteredData && perfFilteredData.length > 0)
        ? perfFilteredData
        : perfMembersData;

      const dateStr = new Date().toISOString().slice(0, 10);
      const periodLabel = (perfFromDate && perfToDate)
        ? `Từ ${perfFromDate} đến ${perfToDate}`
        : 'Toàn bộ thời gian';

      // 2. Xây dựng dữ liệu bảng
      const sheetData = [
        ['BÁO CÁO ĐÁNH GIÁ HIỆU SUẤT THÀNH VIÊN — ĐỘI ROBOCON & XƯỞNG'],
        ['Kỳ đánh giá:', periodLabel, 'Ngày xuất báo cáo:', new Date().toLocaleString('vi-VN')],
        ['Tổng quân số:', listToExport.length, 'Tiêu chuẩn xếp loại:', '5 bậc (Xuất sắc 100đ, Giỏi 80-99đ, Khá 70-79đ, Cần xem lại 50-69đ, Nguy cơ cao <50đ)'],
        [],
        [
          'STT',
          'MSSV',
          'Họ và tên',
          'Nhóm chuyên môn',
          'Số buổi có mặt',
          'Vắng phép (Trùng lịch)',
          'Vắng phép (Khác)',
          'Vắng không phép',
          'Phút đi muộn',
          'Điểm chuyên cần',
          'Điểm điều chỉnh ĐT',
          'Điểm tổng kết',
          'Xếp loại',
          'Ghi chú điều chỉnh',
          'Trạng thái dữ liệu'
        ]
      ];

      listToExport.forEach((item, idx) => {
        const cr = item.calcResult;
        sheetData.push([
          idx + 1,
          String(item.mssv),
          String(item.name),
          String(item.teamName || '—'),
          cr.presentCount,
          cr.excusedSchoolCount,
          cr.excusedOtherCount,
          cr.unexcusedCount,
          cr.totalLateMinutes,
          cr.attendanceScore,
          item.captainAdjustment,
          item.finalScore,
          item.tierInfo.label,
          item.captainNotes || '',
          item.hasAttendanceData ? 'Đang hoạt động' : 'Chưa có dữ liệu'
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Độ rộng cột
      ws['!cols'] = [
        { wch: 6 },   // STT
        { wch: 14 },  // MSSV
        { wch: 26 },  // Họ tên
        { wch: 20 },  // Nhóm
        { wch: 15 },  // Có mặt
        { wch: 22 },  // Vắng phép trùng lịch
        { wch: 18 },  // Vắng phép khác
        { wch: 16 },  // Vắng KP
        { wch: 14 },  // Phút muộn
        { wch: 16 },  // Điểm CC
        { wch: 18 },  // ĐT điều chỉnh
        { wch: 14 },  // Điểm tổng kết
        { wch: 16 },  // Xếp loại
        { wch: 30 },  // Ghi chú
        { wch: 18 }   // Trạng thái
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'DanhGiaHieuSuat');

      const fileName = `DanhGiaHieuSuat_${perfFromDate}_${perfToDate}_${dateStr}.xlsx`;
      XLSX.writeFile(wb, fileName);

      if (typeof toast === 'function') {
        toast('ok', 'Đã xuất file Excel', `Đã tải về thành công file: "${fileName}".`);
      }
    } catch (err) {
      console.error('[Performance] Lỗi xuất Excel:', err);
      // Fallback CSV nếu SheetJS lỗi
      exportPerformanceCsv();
    }
  }

  /**
   * Fallback xuất CSV khi không dùng được XLSX.
   */
  function exportPerformanceCsv() {
    try {
      const list = perfFilteredData.length > 0 ? perfFilteredData : perfMembersData;
      let csv = '\uFEFFSTT,MSSV,Họ và tên,Nhóm,Có mặt,Vắng phép (Học),Vắng phép (Khác),Vắng KP,Phút muộn,Điểm CC,Điểm ĐT,Điểm tổng kết,Xếp loại,Ghi chú\n';

      list.forEach((item, idx) => {
        const cr = item.calcResult;
        const row = [
          idx + 1,
          `"${item.mssv}"`,
          `"${item.name}"`,
          `"${item.teamName || ''}"`,
          cr.presentCount,
          cr.excusedSchoolCount,
          cr.excusedOtherCount,
          cr.unexcusedCount,
          cr.totalLateMinutes,
          cr.attendanceScore,
          item.captainAdjustment,
          item.finalScore,
          `"${item.tierInfo.label}"`,
          `"${(item.captainNotes || '').replace(/"/g, '""')}"`
        ];
        csv += row.join(',') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DanhGiaHieuSuat_${perfFromDate}_${perfToDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (typeof toast === 'function') {
        toast('ok', 'Đã tải file CSV', 'Đã xuất dữ liệu hiệu suất thành công dưới dạng CSV.');
      }
    } catch (csvErr) {
      console.error('[Performance] Lỗi xuất CSV:', csvErr);
      if (typeof toast === 'function') {
        toast('err', 'Xuất file thất bại', csvErr.message);
      }
    }
  }

  /**
   * Hàm khởi động chính khi chuyển đến màn hình "Đánh giá hiệu suất".
   * Gọi từ navTo('performance') trong admin.core.js.
   */
  function initPerformanceView() {
    if (!perfFromDate || !perfToDate) {
      initDefaultDates();
    }
    loadPerformanceData();
  }

  /**
   * Helper an toàn chống XSS.
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeJsAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  // Xuất các hàm ra phạm vi toàn cục để gắn với HTML event handlers
  window.initPerformanceView = initPerformanceView;
  window.setPerfQuickFilter = setPerfQuickFilter;
  window.applyPerformanceFilter = applyPerformanceFilter;
  window.refreshPerformanceView = refreshPerformanceView;
  window.filterPerformanceTable = filterPerformanceTable;
  window.openCaptainAdjustModal = openCaptainAdjustModal;
  window.closePerfAdjustModal = closePerfAdjustModal;
  window.updatePerfPreviewScore = updatePerfPreviewScore;
  window.submitCaptainAdjustment = submitCaptainAdjustment;
  window.saveCaptainAdjustment = saveCaptainAdjustment;
  window.exportPerformanceExcel = exportPerformanceExcel;

})(typeof window !== 'undefined' ? window : globalThis);
