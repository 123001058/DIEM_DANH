// DIEM_DANH — js/auth.js
// Xác thực người dùng (Đăng nhập / Đăng ký) tại index.html

function openLogin(tab = 'login'){
  document.getElementById('modalBg').classList.add('show');
  switchAuthTab(tab);
}

function closeLogin(){
  document.getElementById('modalBg').classList.remove('show');
}

function switchAuthTab(tab){
  const btnLogin = document.getElementById('tabBtnLogin');
  const btnReg = document.getElementById('tabBtnRegister');
  const loginArea = document.getElementById('loginFormArea');
  const regArea = document.getElementById('registerFormArea');
  const err = document.getElementById('errBox');
  const regMsg = document.getElementById('regMsg');

  if (err) err.innerText = '';
  if (regMsg) regMsg.innerText = '';

  if (tab === 'login') {
    if (btnLogin) btnLogin.classList.add('active');
    if (btnReg) btnReg.classList.remove('active');
    if (loginArea) loginArea.style.display = 'block';
    if (regArea) regArea.style.display = 'none';
    setTimeout(() => {
      const u = document.getElementById('userInput');
      if (u) u.focus();
    }, 100);
  } else {
    if (btnLogin) btnLogin.classList.remove('active');
    if (btnReg) btnReg.classList.add('active');
    if (loginArea) loginArea.style.display = 'none';
    if (regArea) regArea.style.display = 'block';
    setTimeout(() => {
      const u = document.getElementById('regUsername');
      if (u) u.focus();
    }, 100);
  }
}

// Xử lý Đăng nhập
async function submitLogin(){
  const username = document.getElementById('userInput').value.trim().toLowerCase().replace(/\s+/g, '');
  const pwd = document.getElementById('pwdInput').value;
  const err = document.getElementById('errBox');
  err.innerText = '';
  if (!username || !pwd) {
    err.innerText = 'Vui lòng nhập tên đăng nhập và mật khẩu!';
    return;
  }

  const btn = document.getElementById('btnLogin');
  if (btn) btn.disabled = true;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: username.includes('@') ? username : username + CONFIG.AUTH_EMAIL_SUFFIX,
    password: pwd,
  });

  if (btn) btn.disabled = false;

  if (error) {
    const m = (error.message || '').toLowerCase();
    if (m.includes('invalid login')) {
      err.innerText = 'Sai tên đăng nhập hoặc mật khẩu!';
    } else {
      err.innerText = error.message || 'Đăng nhập không thành công!';
    }
    return;
  }

  // Kiểm tra quyền người dùng:
  // Admin -> vào trang quản lý (admin.html)
  // Sinh viên & Đội trưởng -> mở trực tiếp form điền điểm danh (checkin.html)
  try {
    const { data: isAdmin } = await supabase.rpc('is_admin');
    const role = data.user?.user_metadata?.app_role;

    if (isAdmin || role === 'admin') {
      location.href = 'admin.html';
    } else {
      location.href = 'checkin.html';
    }
  } catch (e) {
    // Dự phòng
    location.href = 'checkin.html';
  }
}

// Xử lý Tạo tài khoản
async function submitRegister(){
  const uInput = document.getElementById('regUsername');
  const pInput = document.getElementById('regPassword');
  const roleInput = document.getElementById('regRole');
  const nameInput = document.getElementById('regFullName');
  const mssvInput = document.getElementById('regMssv');
  const msg = document.getElementById('regMsg');

  const username = uInput.value.trim().toLowerCase().replace(/\s+/g, '');
  const password = pInput.value;
  const role = roleInput.value;
  const fullName = nameInput.value.trim();
  const mssv = mssvInput.value.trim() || null;

  if (!username || !password || !fullName) {
    msg.style.color = 'var(--err)';
    msg.innerText = 'Vui lòng điền đủ tên đăng nhập, mật khẩu và họ tên!';
    return;
  }

  if (password.length < 6) {
    msg.style.color = 'var(--err)';
    msg.innerText = 'Mật khẩu phải có từ 6 ký tự trở lên!';
    return;
  }

  const btn = document.getElementById('btnRegister');
  if (btn) btn.disabled = true;
  msg.style.color = 'var(--text)';
  msg.innerText = 'Đang xử lý tạo tài khoản...';

  try {
    // Dùng isolated client để không ảnh hưởng phiên hiện hành
    const tempClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const email = username.includes('@') ? username : username + CONFIG.AUTH_EMAIL_SUFFIX;

    const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          name: fullName,
          mssv: mssv,
          app_role: role
        }
      }
    });

    if (signUpError) throw signUpError;
    if (!signUpData?.user) throw new Error('Không tạo được tài khoản Auth');

    msg.style.color = 'var(--ok)';
    msg.innerText = `✓ Tạo tài khoản thành công! Đang chuyển sang đăng nhập...`;

    // Điền sẵn tên đăng nhập sang tab Login
    document.getElementById('userInput').value = username;
    document.getElementById('pwdInput').value = password;

    setTimeout(() => {
      switchAuthTab('login');
      const err = document.getElementById('errBox');
      if (err) {
        err.style.color = 'var(--ok)';
        err.innerText = `Đã tạo tài khoản "${username}". Nhấn Đăng nhập để tiếp tục!`;
      }
    }, 1200);

    uInput.value = '';
    pInput.value = '';
    nameInput.value = '';
    mssvInput.value = '';
  } catch (err) {
    console.error('[submitRegister]', err);
    msg.style.color = 'var(--err)';
    msg.innerText = 'Lỗi: ' + (err.message || 'Không thể tạo tài khoản');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Kiểm tra phiên hiện hành để đổi nút Trang chủ
async function checkCurrentSession(){
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      const { data: ok } = await supabase.rpc('is_admin');
      const btn = document.getElementById('btnOpenLogin');
      if (btn) {
        if (ok) {
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg> Vào bảng quản trị →`;
          btn.onclick = () => { location.href = 'admin.html'; };
        } else {
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg> Vào form điểm danh →`;
          btn.onclick = () => { location.href = 'checkin.html'; };
        }
      }
    }
  } catch (e) {
    console.warn('[checkCurrentSession]', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkCurrentSession();
  const user = document.getElementById('userInput');
  const pwd = document.getElementById('pwdInput');
  if (user) {
    user.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (pwd && !pwd.value) pwd.focus();
        else submitLogin();
      }
    });
  }
  if (pwd) pwd.addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
});
