async function submitLogin() {
  // Chuẩn hóa: trim + lowercase (Supabase email phân biệt hoa thường)
  const mssv = document.getElementById('mssvInput').value.trim().toLowerCase();
  const pwd = document.getElementById('pwdInput').value;
  const err = document.getElementById('errBox');
  err.innerText = '';

  if (!mssv || !pwd) {
    err.innerText = 'Vui lòng nhập MSSV và mật khẩu.';
    return;
  }

  // Nới lỏng: cho phép chữ + số + . _ - (3-32 ký tự)
  if (!/^[a-z0-9._-]{3,32}$/.test(mssv)) {
    err.innerText = 'MSSV chỉ chứa chữ, số, dấu chấm, gạch ngang, gạch dưới (3–32 ký tự).';
    return;
  }

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.innerText = 'Đang đăng nhập...';

  const email = mssv + AUTH_SUFFIX;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });

  btn.disabled = false;
  btn.innerText = 'Đăng nhập';

  if (error) {
    const m = (error.message || '').toLowerCase();
    err.innerText = m.includes('invalid') ? 'Sai MSSV hoặc mật khẩu.' :
      error.message || 'Đăng nhập thất bại.';
    return;
  }

  try { localStorage.setItem('saved_creds', JSON.stringify({ email, pwd, mssv })); } catch (e) { }

  const { data: isAdm } = await supabase.rpc('is_admin');
  location.href = isAdm ? 'admin.html' : 'checkin.html';
}