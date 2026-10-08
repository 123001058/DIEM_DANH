const AUTH_SUFFIX = window.CONFIG?.AUTH_EMAIL_SUFFIX || '@sv.local';

function openLogin() {
  document.getElementById('modalBg')?.classList.add('show');
  setTimeout(() => document.getElementById('mssvInput')?.focus(), 100);
}

function closeLogin() {
  document.getElementById('modalBg')?.classList.remove('show');
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