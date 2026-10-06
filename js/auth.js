// js/auth.js — Đăng nhập bằng MSSV hoặc Email
const AUTH_SUFFIX = '@sv.local';

function openLogin() {
  document.getElementById('modalBg').classList.add('show');
  setTimeout(() => document.getElementById('mssvInput')?.focus(), 100);
}

function closeLogin() {
  document.getElementById('modalBg').classList.remove('show');
}

async function submitLogin() {
  const accountInput = document.getElementById('mssvInput').value.trim();
  const pwd = document.getElementById('pwdInput').value;
  const err = document.getElementById('errBox');
  err.innerText = '';

  if (!accountInput || !pwd) {
    err.innerText = 'Vui lòng nhập tài khoản và mật khẩu.';
    return;
  }

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.innerText = 'Đang đăng nhập...';

  // Xác định email đăng nhập:
  // 1. Nếu người dùng nhập đầy đủ email (có '@') -> dùng trực tiếp
  // 2. Nếu chỉ nhập MSSV / username -> ghép hậu tố mặc định
  let email = accountInput.toLowerCase();
  if (!email.includes('@')) {
    email += AUTH_SUFFIX;
  }

  let { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });

  // Fallback: nếu đăng nhập bằng @sv.local thất bại và trong config có AUTH_EMAIL_SUFFIX khác (vd: @diemdanh.local)
  if (error && !accountInput.includes('@')) {
    const altSuffix = window.CONFIG?.AUTH_EMAIL_SUFFIX;
    if (altSuffix && altSuffix !== AUTH_SUFFIX) {
      const altEmail = accountInput.toLowerCase() + altSuffix;
      const altRes = await supabase.auth.signInWithPassword({ email: altEmail, password: pwd });
      if (!altRes.error) {
        data = altRes.data;
        error = null;
        email = altEmail;
      }
    }
  }

  btn.disabled = false;
  btn.innerText = 'Đăng nhập';

  if (error) {
    const m = (error.message || '').toLowerCase();
    if (m.includes('email not confirmed')) {
      err.innerText = 'Email chưa xác nhận trên Supabase (bật Auto Confirm User trong Dashboard).';
    } else if (m.includes('invalid') || m.includes('credentials')) {
      err.innerText = 'Sai tài khoản hoặc mật khẩu.';
    } else {
      err.innerText = error.message || 'Đăng nhập thất bại.';
    }
    return;
  }

  try {
    localStorage.setItem('saved_creds', JSON.stringify({ email, pwd, accountInput }));
  } catch (e) {}

  const { data: isAdm } = await supabase.rpc('is_admin');
  location.href = isAdm ? 'admin.html' : 'checkin.html';
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
      return;
    }
    const raw = localStorage.getItem('saved_creds');
    if (!raw) return;
    const c = JSON.parse(raw);
    if (!c?.email || !c?.pwd) return;
    const { data: loginData } = await supabase.auth.signInWithPassword({
      email: c.email,
      password: c.pwd
    });
    if (loginData?.session) {
      const { data: isAdm } = await supabase.rpc('is_admin');
      location.href = isAdm ? 'admin.html' : 'checkin.html';
    }
  } catch (e) {
    console.warn('[autoLogin]', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  autoLogin();
  const m = document.getElementById('mssvInput');
  const p = document.getElementById('pwdInput');
  m?.addEventListener('keydown', e => { if (e.key === 'Enter') p?.focus(); });
  p?.addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
});
