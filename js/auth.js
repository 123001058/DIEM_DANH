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

  // Hiển thị lỗi rõ ràng nếu có
  if (error) {
    const m = (error.message || '').toLowerCase();
    if (m.includes('invalid login')) {
      err.innerText = 'Sai tên đăng nhập hoặc mật khẩu!';
    } else if (m.includes('email not confirmed')) {
      err.innerText = 'Tài khoản chưa được xác nhận email trên hệ thống!';
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
  const role = 'student';
  const fullName = nameInput.value.trim();
  const mssv = mssvInput ? mssvInput.value.trim() : '';

  if (!username) {
    msg.style.color = 'var(--err)';
    msg.innerText = 'Vui lòng nhập tên đăng nhập!';
    uInput.focus();
    return;
  }

  if (!/^[a-z0-9_-]+$/.test(username)) {
    msg.style.color = 'var(--err)';
    msg.innerText = 'Tên đăng nhập chỉ chứa chữ cái, số và dấu gạch (_ -)!';
    uInput.focus();
    return;
  }

  if (!password || password.length < 6) {
    msg.style.color = 'var(--err)';
    msg.innerText = 'Mật khẩu phải có từ 6 ký tự trở lên!';
    pInput.focus();
    return;
  }

  if (!fullName) {
    msg.style.color = 'var(--err)';
    msg.innerText = 'Vui lòng nhập họ và tên!';
    nameInput.focus();
    return;
  }

  if (role === 'student' && !mssv) {
    msg.style.color = 'var(--err)';
    msg.innerText = 'Sinh viên bắt buộc phải nhập MSSV để điểm danh!';
    mssvInput.focus();
    return;
  }

  const btn = document.getElementById('btnRegister');
  if (btn) btn.disabled = true;
  msg.style.color = 'var(--text)';
  msg.innerText = 'Đang xử lý tạo tài khoản...';

  try {
    // Dùng client độc lập để không ảnh hưởng phiên hiện hành
    const sdk = window.supabaseSDK || window.supabase;
    const tempClient = sdk.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const email = username.includes('@') ? username : username + CONFIG.AUTH_EMAIL_SUFFIX;

    const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: username,
          name: fullName,
          mssv: mssv || null,
          app_role: role
        }
      }
    });

    if (signUpError) {
      const em = (signUpError.message || '').toLowerCase();
      if (em.includes('already registered') || em.includes('user already exists')) {
        throw new Error('Tên đăng nhập này đã được sử dụng!');
      }
      throw signUpError;
    }
    if (!signUpData?.user) throw new Error('Không tạo được tài khoản Auth');

    msg.style.color = 'var(--ok)';
    msg.innerText = `✓ Tạo tài khoản thành công! Đang tự động đăng nhập...`;

    // Tự động đăng nhập vào hệ thống
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (!loginError && loginData?.session) {
      setTimeout(async () => {
        try {
          const { data: isAdmin } = await supabase.rpc('is_admin');
          if (isAdmin || role === 'admin') {
            location.href = 'admin.html';
          } else {
            location.href = 'checkin.html';
          }
        } catch (e) {
          location.href = 'checkin.html';
        }
      }, 700);
      return;
    }

    // Nếu không tự đăng nhập được thì chuyển sang tab Đăng nhập
    document.getElementById('userInput').value = username;
    document.getElementById('pwdInput').value = password;

    setTimeout(() => {
      switchAuthTab('login');
      const err = document.getElementById('errBox');
      if (err) {
        err.style.color = 'var(--ok)';
        err.innerText = `Đã tạo tài khoản "${username}". Nhấn Đăng nhập để tiếp tục!`;
      }
    }, 1000);

    uInput.value = '';
    pInput.value = '';
    nameInput.value = '';
    if (mssvInput) mssvInput.value = '';
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

document.addEventListener('DOMContentLoaded', async () => {
  checkCurrentSession();
  if (typeof loadStudents === 'function') {
    loadStudents();
  }

  // Tự động điền họ tên khi gõ MSSV (nếu có trong danh sách sinh viên)
  const regMssv = document.getElementById('regMssv');
  const regName = document.getElementById('regFullName');
  if (regMssv && regName) {
    regMssv.addEventListener('input', () => {
      const m = regMssv.value.trim();
      if (m && Array.isArray(validStudents) && validStudents.length > 0) {
        const found = validStudents.find(s => s.mssv === m);
        if (found && !regName.value) {
          regName.value = found.name;
        }
      }
    });
  }

  // Xử lý phím Enter ở các ô nhập
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

  ['regUsername', 'regPassword', 'regFullName', 'regMssv'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitRegister();
      });
    }
  });
});
