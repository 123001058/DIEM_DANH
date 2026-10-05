// Chức năng trang quản lý (admin.html)
let classStudents = [];
let recentCheckins = [];
let progressInterval = null, sessionTimer = null;
let secondsRemaining = 20, currentSessionId = null, isOpen = false, lastToken = null;
let serverOffset = 0; // chênh lệch giờ server - giờ máy admin (ms)
let currentFilter = 'all';

// Giờ chuẩn theo server: token QR sinh ra khớp với phép kiểm tra ở submit_attendance()
function nowMs(){ return Date.now() + serverOffset; }

async function syncServerTime(){
    try {
        const t0 = Date.now();
        const { data, error } = await supabase.rpc('server_now_ms');
        const t1 = Date.now();
        if (!error && data != null) serverOffset = Number(data) - Math.round((t0 + t1) / 2);
    } catch (e) { console.warn('[syncServerTime]', e); }
}

async function initAdmin(){
    // Ràng buộc bằng phiên Supabase Auth thật (không còn cờ sessionStorage giả)
    const { data } = await supabase.auth.getSession();
    if (!data.session) return location.replace('index.html');
    // Chỉ user nằm trong allowlist public.admins mới được dùng trang này
    const { data: ok } = await supabase.rpc('is_admin');
    if (!ok) {
        alert('Tài khoản này không có quyền quản lý.');
        await supabase.auth.signOut();
        return location.replace('index.html');
    }
    // Tự thoát về trang chủ nếu phiên bị đăng xuất/hết hạn ở nơi khác
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') location.replace('index.html');
    });
    await syncServerTime();
    await loadStudents();
    classStudents = validStudents.map(s => ({ mssv: s.mssv, name: s.name, status: 'Chưa điểm danh', time: '-', category: '', note: '' }));
    renderStudents(); updateStats();

    // Luôn bắt đầu 100% ở trạng thái ban đầu sạch sẽ (theo yêu cầu của user)
    // Không tự động khôi phục dữ liệu phiên cũ, không tự nhảy mã QR khi mới vào trang
    stopSessionUI();

    // REALTIME: Tự cập nhật khi có bản ghi mới hoặc thay đổi trạng thái trong bảng attendance
    supabase.channel('changes').on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        if (isOpen && currentSessionId) pollAttendance();
    }).subscribe();
}

async function turnOn(){
    await syncServerTime();
    const name = document.getElementById('sessionName').value.trim();
    const refresh = Math.max(5, Number(document.getElementById('qrRefreshTime').value) || 20);
    const duration = Math.max(1, Number(document.getElementById('sessionDuration').value) || 5);
    if (!name) return alert('Nhập tên phiên!');
    if (isOpen) return alert('Đã có phiên đang mở. Bấm "Đóng phiên" trước khi mở phiên mới.');

    // Đóng mọi phiên cũ còn mở trong Database để tránh xung đột
    await supabase.from('sessions').update({ is_open: false }).eq('is_open', true);

    // Luôn TẠO MỚI một dòng session: mỗi phiên có id riêng
    const { data, error } = await supabase.from('sessions').insert({
        session_name: name, is_open: true, refresh_time: refresh, duration_min: duration, started_at: new Date(nowMs()).toISOString()
    }).select().single();

    if (error) {
        alert('Lỗi mở phiên: ' + error.message);
        return;
    }
    currentSessionId = data.id;
    startSessionUI(data);
}

async function turnOff(auto){
    try {
        isOpen = false;
        clearInterval(sessionTimer);
        clearInterval(progressInterval);
        if (document.fullscreenElement) document.exitFullscreen();

        // Đóng phiên trong Database: cập nhật is_open = false cho phiên hiện tại và tất cả phiên mở
        if (currentSessionId) {
            await supabase.from('sessions').update({ is_open: false }).eq('id', currentSessionId);
        }
        await supabase.from('sessions').update({ is_open: false }).eq('is_open', true);
        
        try {
            await supabase.rpc('admin_close_session', { p_session_id: currentSessionId ? String(currentSessionId) : null });
        } catch (e) {
            // bỏ qua nếu RPC chưa add
        }
    } catch (e) {
        console.warn('[turnOff]', e);
    } finally {
        currentSessionId = null;
        lastToken = null;
        stopSessionUI();
    }
}

function startSessionUI(st){
    isOpen = true;
    lastToken = null;
    document.getElementById('dashboardArea').classList.add('show');
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('statusIndicator').className = 'status-badge status-on';
    document.getElementById('statusIndicator').innerHTML = '<span class="pulse"></span><span>MỞ — ' + escapeHtml(st.session_name) + '</span>';

    // Cập nhật lại form nếu là khôi phục phiên
    if (st.session_name) document.getElementById('sessionName').value = st.session_name;
    if (st.refresh_time) document.getElementById('qrRefreshTime').value = st.refresh_time;
    if (st.duration_min) document.getElementById('sessionDuration').value = st.duration_min;

    const refresh = Math.max(5, Number(st.refresh_time) || 20);
    const startedMs = new Date(st.started_at).getTime();
    const cycleMs = refresh * 1000;
    const endsAt = startedMs + (st.duration_min * 60 * 1000);

    const calcCycle = () => {
        const now = nowMs();
        const elapsed = Math.max(0, now - startedMs);
        const win = Math.floor(elapsed / cycleMs);
        const cycleEnd = startedMs + (win + 1) * cycleMs;
        const remaining = Math.max(1, Math.ceil((cycleEnd - now) / 1000));
        const pct = Math.max(0, Math.min(100, ((cycleEnd - now) / cycleMs) * 100));
        return { win, remaining, pct };
    };

    const { win: initialWin, remaining: initialRemaining, pct: initialPct } = calcCycle();
    lastToken = initialWin;
    renderQR();
    pollAttendance();

    document.getElementById('secondsLeft').innerText = initialRemaining + 's';
    document.getElementById('progressFill').style.width = initialPct + '%';

    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        const { win, remaining, pct } = calcCycle();
        if (win !== lastToken) {
            lastToken = win;
            renderQR();
        }
        document.getElementById('secondsLeft').innerText = remaining + 's';
        document.getElementById('progressFill').style.width = pct + '%';
    }, 250);

    clearInterval(sessionTimer);
    sessionTimer = setInterval(() => {
        const left = Math.max(0, Math.floor((endsAt - nowMs())/1000));
        document.getElementById('sessionCountdown').innerText = fmtTime(left);
        if (left <= 0) turnOff(true);
    }, 1000);
}

function stopSessionUI(){
    isOpen = false;
    currentSessionId = null;
    lastToken = null;
    clearInterval(progressInterval);
    clearInterval(sessionTimer);
    if (document.fullscreenElement) document.exitFullscreen();

    // Reset 100% giao diện về ban đầu: hiện emptyState, ẩn dashboardArea
    document.getElementById('dashboardArea').classList.remove('show');
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('statusIndicator').className = 'status-badge status-off';
    document.getElementById('statusIndicator').innerHTML = '<span class="dot"></span><span>ĐÓNG</span>';

    const canvas = document.getElementById('qrCanvas');
    if (canvas) canvas.innerHTML = '';
    const progressFill = document.getElementById('progressFill');
    if (progressFill) progressFill.style.width = '100%';
    const defaultRefresh = Math.max(5, Number(document.getElementById('qrRefreshTime')?.value) || 20);
    const secondsLeft = document.getElementById('secondsLeft');
    if (secondsLeft) secondsLeft.innerText = defaultRefresh + 's';
    const countdown = document.getElementById('sessionCountdown');
    if (countdown) countdown.innerText = '--:--';
}

let qrBusy = false;
async function renderQR(){
    if (!currentSessionId) return;
    if (qrBusy) { lastToken = null; return; } // đang lấy token => nhịp sau thử lại, không bỏ lỡ
    qrBusy = true;
    try {
        // Token do SERVER ký (HMAC + secret của phiên) — không thể tự tính ở client
        const { data, error } = await supabase.rpc('issue_qr_token', { p_session_id: String(currentSessionId) });
        if (error || !data) throw error || new Error('no token');
        // QR phải chứa URL tuyệt đối vì camera điện thoại không mở được đường dẫn tương đối
        const base = window.__DETECTED_BASE_URL__ || window.location.origin;
        const url = `${base}/checkin.html?s=${encodeURIComponent(currentSessionId)}&t=${encodeURIComponent(data.token)}`;
        document.getElementById('qrCanvas').innerHTML = '';
        // Render 360px rồi CSS co lại → nét khi phóng to toàn màn hình
        new QRCode(document.getElementById('qrCanvas'), { text: url, width: 360, height: 360, correctLevel: QRCode.CorrectLevel.M });
    } catch (e) {
        console.error('[renderQR]', e);
        // thử lại ở nhịp kế tiếp
        setTimeout(() => { lastToken = null; }, 2000);
    } finally {
        qrBusy = false;
    }
}

function toggleFullscreen(){
    const el = document.getElementById('qrSection');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
    else alert('Trình duyệt không hỗ trợ toàn màn hình, hãy dùng F11.');
}

async function pollAttendance(){
    if (!currentSessionId) return;
    const { data: records } = await supabase.from('attendance')
        .select('*')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: false });
    if (!records) return;

    classStudents.forEach(s => { s.status = 'Chưa điểm danh'; s.time = '-'; s.category = ''; s.note = ''; });
    recentCheckins = [];
    records.forEach(r => {
        let st = classStudents.find(s => s.mssv === r.mssv);
        if (!st) {
            st = { mssv: r.mssv, name: r.full_name || r.mssv, status: 'Chưa điểm danh', time: '-', category: '', note: '' };
            classStudents.push(st);
        }
        st.status = r.status || 'có mặt';
        st.time = new Date(r.created_at).toLocaleTimeString('vi-VN');
        st.category = r.category || '';
        st.note = r.note || '';

        recentCheckins.push({
            name: r.full_name || r.mssv,
            mssv: r.mssv,
            status: r.status || 'có mặt',
            time: new Date(r.created_at).toLocaleTimeString('vi-VN')
        });
    });
    renderStudents(); renderRecent(); updateStats();
}

function renderStudents(){
    document.getElementById('studentList').innerHTML = classStudents.map(s => `
        <tr data-status="${escapeHtml(s.status)}">
            <td><div class="student-cell"><div class="avatar">${escapeHtml((s.name || '?')[0])}</div><div>${escapeHtml(s.name)}</div></div></td>
            <td class="mono">${escapeHtml(s.mssv)}</td>
            <td>
                <select onchange="changeStatus('${s.mssv}', this.value)" class="status-select ${s.status==='Chưa điểm danh'?'st-none': s.status==='có mặt'?'st-ok':'st-no'}" ${!currentSessionId ? 'disabled' : ''}>
                    <option value="Chưa điểm danh" ${s.status === 'Chưa điểm danh' ? 'selected' : ''}>Chưa điểm danh</option>
                    <option value="có mặt" ${s.status === 'có mặt' ? 'selected' : ''}>Có mặt</option>
                    <option value="vắng có phép" ${s.status === 'vắng có phép' ? 'selected' : ''}>Vắng có phép</option>
                    <option value="vắng không phép" ${s.status === 'vắng không phép' ? 'selected' : ''}>Vắng không phép</option>
                </select>
            </td>
            <td class="mono">${escapeHtml(s.time)}</td>
        </tr>`).join('');
    filterTable();
}

function renderRecent(){
    document.getElementById('recentList').innerHTML = recentCheckins.slice(0,10).map(r => `
        <div class="recent-item"><div class="avatar">${escapeHtml((r.name || '?')[0])}</div><div class="info"><div class="name">${escapeHtml(r.name)}</div><div class="time">${escapeHtml(r.time)}</div></div></div>
    `).join('') || '<div class="recent-empty">Chưa có ai điểm danh</div>';
}

function updateStats(){
    const total = classStudents.length;
    const present = classStudents.filter(s => s.status === 'có mặt').length;
    const absent = classStudents.filter(s => s.status === 'vắng có phép' || s.status === 'vắng không phép').length;
    document.getElementById('totalCount').innerText = total;
    document.getElementById('presentCount').innerText = present;
    document.getElementById('absentCount').innerText = absent;
    const pct = total ? Math.round((present/total)*100) : 0;
    document.getElementById('ratePercent').innerText = pct + '%';
    document.getElementById('rateBar').style.width = pct + '%';
}

async function changeStatus(mssv, newStatus) {
    if (!currentSessionId) return;
    if (newStatus === 'Chưa điểm danh') {
        alert('Vui lòng chọn trạng thái khác.');
        pollAttendance(); // reset UI
        return; 
    }
    const res = await supabase.rpc('admin_set_status', { p_session_id: currentSessionId, p_mssv: mssv, p_status: newStatus });
    if (res.error || (res.data && !res.data.ok)) {
        alert('Lỗi: ' + (res.error?.message || res.data?.message));
        pollAttendance();
    } else {
        pollAttendance();
    }
}

// BỘ LỌC TRẠNG THÁI
function setFilter(status){
    currentFilter = status;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-status') === status);
    });
    filterTable();
}

function filterTable(){
    const q = (document.getElementById('searchStudent')?.value || '').toLowerCase().trim();
    document.querySelectorAll('#studentList tr').forEach(tr => {
        const text = tr.innerText.toLowerCase();
        const st = tr.getAttribute('data-status') || '';
        const matchQuery = !q || text.includes(q);
        let matchFilter = true;
        if (currentFilter === 'present') matchFilter = (st === 'có mặt');
        else if (currentFilter === 'absent') matchFilter = (st === 'vắng có phép' || st === 'vắng không phép');
        else if (currentFilter === 'unmarked') matchFilter = (st === 'Chưa điểm danh');
        tr.style.display = (matchQuery && matchFilter) ? '' : 'none';
    });
}

// THAO TÁC HÀNG LOẠT (BATCH ACTIONS - TỐC ĐỘ CAO SONG SONG)
async function markAllAbsent(){
    if (!currentSessionId) return alert('Chưa có phiên nào được chọn!');
    const unmarked = classStudents.filter(s => s.status === 'Chưa điểm danh');
    if (!unmarked.length) return alert('Tất cả sinh viên đã có trạng thái điểm danh.');
    if (!confirm(`Xác nhận đánh dấu ${unmarked.length} sinh viên chưa quét thành "Vắng không phép"?`)) return;

    // Chạy song song (Promise.allSettled) nhanh gấp 20 lần tuần tự
    const results = await Promise.allSettled(
        unmarked.map(s => supabase.rpc('admin_set_status', {
            p_session_id: currentSessionId,
            p_mssv: s.mssv,
            p_status: 'vắng không phép'
        }))
    );
    const successCount = results.filter(r => r.status === 'fulfilled' && !r.value.error && r.value.data?.ok !== false).length;
    await pollAttendance();
    alert(`Đã cập nhật trạng thái vắng cho ${successCount}/${unmarked.length} sinh viên!`);
}

async function markAllPresent(){
    if (!currentSessionId) return alert('Chưa có phiên nào được chọn!');
    if (!confirm(`Xác nhận đánh dấu TẤT CẢ ${classStudents.length} sinh viên là "Có mặt"?`)) return;

    const results = await Promise.allSettled(
        classStudents.map(s => supabase.rpc('admin_set_status', {
            p_session_id: currentSessionId,
            p_mssv: s.mssv,
            p_status: 'có mặt'
        }))
    );
    const successCount = results.filter(r => r.status === 'fulfilled' && !r.value.error && r.value.data?.ok !== false).length;
    await pollAttendance();
    alert(`Đã cập nhật "Có mặt" cho ${successCount}/${classStudents.length} sinh viên!`);
}

// XUẤT FILE BÁO CÁO CSV (EXCEL) CHO GIẢNG VIÊN (TÍNH NĂNG TỪ GITHUB)
function fmtTime(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
async function logout(){ await supabase.auth.signOut(); location.href = 'index.html'; }

initAdmin();
