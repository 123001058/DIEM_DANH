// js/auth.js — Đăng nhập chuẩn Supabase (Đơn giản nhất)
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

  try {
    // 1. Chuẩn hóa email (Nếu nhập MSSV thì tự thêm hậu tố)
    let email = accountInput.toLowerCase();
    if (!email.includes('@')) {
      email += AUTH_SUFFIX;
    }

    // 2. Đăng nhập trực tiếp qua Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password: pwd 
    });

    if (error) {
      err.innerText = error.message || 'Sai tài khoản hoặc mật khẩu.';
      btn.disabled = false;
      btn.innerText = 'Đăng nhập';
      return;
    }

    // 3. Kiểm tra quyền Admin thông qua RPC 'is_admin' (Bạn set quyền này trên Supabase)
    const { data: isAdm, error: admError } = await supabase.rpc('is_admin');
    
    if (admError) {
      console.warn('Lỗi check admin:', admError);
    }

    // Điều hướng dựa trên quyền
    if (isAdm) {
      location.href = 'admin.html';
    } else {
      location.href = 'checkin.html';
    }

  } catch (e) {
    err.innerText = 'Lỗi hệ thống: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.innerText = 'Đăng nhập';
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
      return;
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
