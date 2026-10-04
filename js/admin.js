// Chức năng trang quản lý (admin.html)
let classStudents = [];
let recentCheckins = [];
let progressInterval = null, sessionTimer = null;
let secondsRemaining = 20, currentSessionId = null, isOpen = false, lastToken = null;
let serverOffset = 0; // chênh lệch giờ server - giờ máy admin (ms)

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
    classStudents = validStudents.map(s => ({ mssv: s.mssv, name: s.name, status: 'Chưa điểm danh', time: '-' }));
    renderStudents(); updateStats();

    refreshSessionStatus();

    // REALTIME: Tự cập nhật khi có bản ghi mới vào bảng attendance
    supabase.channel('changes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, () => {
        if (isOpen && currentSessionId) pollAttendance();
    }).subscribe();
}

async function refreshSessionStatus(){
    // Khi vừa mở trang admin: nếu phiên cũ còn MỞ trong DB (vd lần trước tắt trình duyệt
    // mà quên bấm "Đóng phiên") thì tự đóng lại. Mỗi lần mở trang admin đều bắt đầu
    // phiên MỚI, không bao giờ hiện lại phiên cũ.
    const { data: openSession } = await supabase.from('sessions')
        .select('id').eq('is_open', true).limit(1).maybeSingle();
    if (openSession) {
        await supabase.from('sessions').update({ is_open: false }).eq('id', openSession.id);
    }
    stopSessionUI();
}

async function turnOn(){
    await syncServerTime();
    const name = document.getElementById('sessionName').value.trim();
    const refresh = Math.max(5, Number(document.getElementById('qrRefreshTime').value) || 20);
    const duration = Math.max(1, Number(document.getElementById('sessionDuration').value) || 5);
    if (!name) return alert('Nhập tên phiên!');
    if (isOpen) return alert('Đã có phiên đang mở. Bấm "Đóng phiên" trước khi mở phiên mới.');

    // Đóng mọi phiên cũ còn mở để tránh xung đột
    await supabase.from('sessions').update({ is_open: false }).eq('is_open', true);

    // Luôn TẠO MỚI một dòng session: mỗi phiên có id riêng,
    // danh sách điểm danh của phiên cũ sẽ không lẫn sang phiên mới
    const { data, error } = await supabase.from('sessions').insert({
        session_name: name, is_open: true, refresh_time: refresh, duration_min: duration, started_at: new Date(nowMs()).toISOString()
    }).select().single();

    if (error) {
        alert('Lỗi: ' + error.message + '\n\nKiểm tra bảng "sessions" trong Supabase: cột id phải tự sinh (uuid mặc định hoặc bigint identity).');
        return;
    }
    currentSessionId = data.id;
    startSessionUI(data);
}

async function turnOff(auto){
    if (!isOpen) return; // tránh gọi lặp khi hết giờ
    if (!auto && !confirm('Đóng phiên?')) return;
    if (auto) { isOpen = false; clearInterval(sessionTimer); clearInterval(progressInterval); }
    if (currentSessionId) await supabase.from('sessions').update({ is_open: false }).eq('id', currentSessionId);
    stopSessionUI();
}

function startSessionUI(st){
    isOpen = true;
    lastToken = null;
    document.getElementById('dashboardArea').classList.add('show');
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('statusIndicator').className = 'status-badge status-on';
    document.getElementById('statusIndicator').innerHTML = '<span class="pulse"></span><span>MỞ — ' + escapeHtml(st.session_name) + '</span>';

    const refresh = st.refresh_time || 20;
    const startedMs = new Date(st.started_at).getTime();
    const endsAt = startedMs + (st.duration_min * 60 * 1000);

    renderQR();
    lastToken = Math.floor(nowMs() / (refresh * 1000));
    pollAttendance();

    progressInterval = setInterval(() => {
        const now = nowMs();
        const cycleMs = refresh * 1000;
        const cycleEnd = (Math.floor(now / cycleMs) + 1) * cycleMs;
        secondsRemaining = Math.max(1, Math.ceil((cycleEnd - now) / 1000));
        if (Math.floor(now/cycleMs) !== lastToken) { lastToken = Math.floor(now/cycleMs); renderQR(refresh); }
        document.getElementById('secondsLeft').innerText = secondsRemaining + 's';
        document.getElementById('progressFill').style.width = (((cycleEnd - now)/cycleMs)*100) + '%';
    }, 250);

    sessionTimer = setInterval(() => {
        const left = Math.max(0, Math.floor((endsAt - nowMs())/1000));
        document.getElementById('sessionCountdown').innerText = fmtTime(left);
        if (left <= 0) turnOff(true);
    }, 1000);
}

function stopSessionUI(){
    isOpen = false;
    document.getElementById('dashboardArea').classList.remove('show');
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('statusIndicator').className = 'status-badge status-off';
    document.getElementById('statusIndicator').innerHTML = '<span class="dot"></span><span>ĐÓNG</span>';
    clearInterval(progressInterval); clearInterval(sessionTimer);
    if (document.fullscreenElement) document.exitFullscreen();
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
    const { data: records } = await supabase.from('attendance').select('*').eq('session_id', currentSessionId).order('created_at', { ascending: false });
    if (!records) return;
    classStudents.forEach(s => { s.status = 'Chưa điểm danh'; s.time = '-'; });
    recentCheckins = [];
    records.forEach(r => {
        const st = classStudents.find(s => s.mssv === r.mssv);
        if (st) { st.status = r.status || 'có mặt'; st.time = new Date(r.created_at).toLocaleTimeString('vi-VN'); }
        recentCheckins.push({ name: r.full_name, time: new Date(r.created_at).toLocaleTimeString('vi-VN') });
    });
    renderStudents(); renderRecent(); updateStats();
}

function renderStudents(){
    document.getElementById('studentList').innerHTML = classStudents.map(s => `
        <tr>
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

function filterTable(){
    const q = document.getElementById('searchStudent').value.toLowerCase();
    document.querySelectorAll('#studentList tr').forEach(tr => tr.style.display = tr.innerText.toLowerCase().includes(q) ? '' : 'none');
}

function fmtTime(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
async function logout(){ await supabase.auth.signOut(); location.href = 'index.html'; }

async function createAccount() {
    const btn = document.getElementById('btnCreateAcc');
    const msg = document.getElementById('createAccMsg');
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    const fullName = document.getElementById('newFullName').value.trim();
    const mssv = document.getElementById('newMssv').value.trim() || null;

    if (!username || !password || !fullName) {
        msg.style.color = 'var(--err)';
        msg.innerText = 'Vui lòng nhập đủ thông tin (Tên đăng nhập, Mật khẩu, Họ tên).';
        return;
    }

    btn.disabled = true;
    msg.style.color = 'var(--text)';
    msg.innerText = 'Đang tạo...';

    const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
            username: username,
            password: password,
            role: role,
            name: fullName,
            mssv: mssv
        }
    });

    btn.disabled = false;
    
    if (error) {
        msg.style.color = 'var(--err)';
        msg.innerText = 'Lỗi hệ thống: ' + error.message;
    } else if (data && !data.ok) {
        msg.style.color = 'var(--err)';
        msg.innerText = data.message;
    } else {
        msg.style.color = 'var(--ok)';
        msg.innerText = 'Tạo tài khoản thành công!';
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newFullName').value = '';
        document.getElementById('newMssv').value = '';
    }
}

initAdmin();
