// js/auth.js — Đăng nhập đơn giản hóa
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

  if (!accountInput) {
    err.innerText = 'Vui lòng nhập MSSV hoặc tài khoản.';
    return;
  }

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.innerText = 'Đang kiểm tra...';

  try {
    // 1. THỬ KIỂM TRA XEM LÀ ADMIN (Có mật khẩu)
    if (pwd) {
      let email = accountInput.toLowerCase();
      if (!email.includes('@')) email += AUTH_SUFFIX;

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password: pwd });

      if (!authError && authData.session) {
        // Kiểm tra quyền admin trong bảng profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('mssv', accountInput)
          .single();

        if (profile?.is_admin) {
          location.href = 'admin.html';
          return;
        }
      }
    }

    // 2. LUỒNG SINH VIÊN (Không cần mật khẩu, chỉ cần MSSV tồn tại trong bảng profiles)
    const { data: student, error: studentError } = await supabase
      .from('profiles')
      .select('*')
      .eq('mssv', accountInput)
      .single();

    if (studentError || !student) {
      err.innerText = 'MSSV không tồn tại trong hệ thống. Vui lòng liên hệ Admin.';
    } else {
      // Lưu thông tin sinh viên vào localStorage để dùng ở trang checkin.html
      localStorage.setItem('student_profile', JSON.stringify(student));
      location.href = 'checkin.html';
    }

  } catch (e) {
    err.innerText = 'Có lỗi xảy ra: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.innerText = 'Đăng nhập';
  }
}

async function autoLogin() {
  try {
    // Check xem có session admin không
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('mssv', (await supabase.auth.getUser()).data.user.email.split('@')[0])
        .single();

      if (profile?.is_admin) {
        const btn = document.getElementById('btnOpenLogin');
        if (btn) {
          btn.innerHTML = '🛠️ Vào trang quản trị →';
          btn.onclick = () => { location.href = 'admin.html'; };
        }
        return;
      }
    }

    // Check xem có profile sinh viên đã lưu không
    const savedProfile = localStorage.getItem('student_profile');
    if (savedProfile) {
      const btn = document.getElementById('btnOpenLogin');
      if (btn) {
        btn.innerHTML = '📷 Vào trang điểm danh →';
        btn.onclick = () => { location.href = 'checkin.html'; };
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
  m?.addEventListener('keydown', e => { if (e.key === 'Enter') p?.focus(); });
  p?.addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
});
