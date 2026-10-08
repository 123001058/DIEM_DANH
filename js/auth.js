const AUTH_SUFFIX = window.CONFIG?.AUTH_EMAIL_SUFFIX || '@sv.local';

function openLogin() {
  document.getElementById('modalBg')?.classList.add('show');
  setTimeout(() => document.getElementById('mssvInput')?.focus(), 100);
}

function closeLogin() {
  document.getElementById('modalBg')?.classList.remove('show');
}

function openForgotPassword() {
  closeLogin();
  document.getElementById('forgotModal')?.classList.add('show');
  setTimeout(() => document.getElementById('forgotMssvInput')?.focus(), 100);
}

function closeForgotPassword() {
  document.getElementById('forgotModal')?.classList.remove('show');
  document.getElementById('forgotMssvInput').value = '';
  const errBox = document.getElementById('forgotErrBox');
  if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }
}

async function submitForgotPassword() {
  const mssv = (document.getElementById('forgotMssvInput')?.value || '').trim();
  const errBox = document.getElementById('forgotErrBox');
  if (errBox) { errBox.style.display = 'none'; errBox.innerText = ''; }
  
  if (!mssv) {
    if (errBox) { errBox.innerText = 'Vui lòng nhập MSSV.'; errBox.style.display = 'block'; }
    return;
  }
  
  const btn = document.getElementById('btnForgot');
  if (btn) { btn.disabled = true; btn.innerText = 'Đang gửi...'; }
  
  try {
    const { error } = await supabase
      .from('password_reset_requests')
      .insert({ mssv: mssv.toUpperCase() });
      
    if (error) {
      if (error.code === '23505') { // unique violation
        throw new Error('Yêu cầu của bạn đang chờ Admin xử lý. Không thể gửi thêm.');
      }
      if (error.code === '23503') { // foreign key violation
        throw new Error('MSSV không tồn tại trong hệ thống.');
      }
      throw error;
    }
    
    alert('✅ Yêu cầu đã được gửi đến Admin.\nVui lòng nhận mật khẩu tạm từ Admin.');
    closeForgotPassword();
  } catch (e) {
    if (errBox) { errBox.innerText = e.message; errBox.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = 'Gửi yêu cầu'; }
  }
}


async function submitLogin() {
  const mssvInput = document.getElementById('mssvInput');
  const pwdInput = document.getElementById('pwdInput');
  const rawInput = (mssvInput?.value || '').trim();
  const pwd = pwdInput?.value || '';
  const err = document.getElementById('errBox');
  if (err) err.innerText = '';

  if (!rawInput || !pwd) {
    if (err) err.innerText = 'Vui lòng nhập MSSV và mật khẩu.';
    return;
  }

  const btn = document.getElementById('btnLogin');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang đăng nhập...';
  }

  const account = rawInput.toLowerCase();
  const email = account.includes('@') ? account : account + AUTH_SUFFIX;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });

    if (error) {
      const m = (error.message || '').toLowerCase();
      if (err) {
        err.innerText = m.includes('invalid') ? 'Sai MSSV hoặc mật khẩu.' :
          (error.message || 'Đăng nhập thất bại.');
      }
      return;
    }

    try { 
      localStorage.removeItem('saved_creds'); 
      localStorage.setItem('saved_mssv', rawInput); 
    } catch (e) { }

    const { data: isAdm } = await supabase.rpc('is_admin');
    location.href = isAdm ? 'admin.html' : 'checkin.html';
  } catch (e) {
    if (err) err.innerText = 'Lỗi hệ thống: ' + e.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Đăng nhập';
    }
  }
}

async function autoLogin() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      const { data: isAdm } = await supabase.rpc('is_admin');
      const btn = document.getElementById('btnOpenLogin');
      if (btn) {
        btn.innerHTML = isAdm ? '🛠️ Vào trang quản trị →' : '📷 Vào trang điểm danh →';
        btn.onclick = () => { location.href = isAdm ? 'admin.html' : 'checkin.html'; };
      }
    }
  } catch (e) {
    console.warn('[autoLogin]', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  autoLogin();
  const m = document.getElementById('mssvInput');
  const p = document.getElementById('pwdInput');
  
  try {
    const savedMssv = localStorage.getItem('saved_mssv');
    if (savedMssv && m) {
      m.value = savedMssv;
    }
    // Cleanup old saved_creds
    localStorage.removeItem('saved_creds');
  } catch(e) {}

  m?.addEventListener('keydown', e => { if (e.key === 'Enter') p?.focus(); });
  p?.addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
});