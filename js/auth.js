// js/auth.js — Đăng nhập bằng MSSV
const AUTH_SUFFIX = '@sv.local';

function openLogin(){
  document.getElementById('modalBg').classList.add('show');
  setTimeout(() => document.getElementById('mssvInput')?.focus(), 100);
}
function closeLogin(){
  document.getElementById('modalBg').classList.remove('show');
}

async function submitLogin(){
  const mssv = document.getElementById('mssvInput').value.trim();
  const pwd  = document.getElementById('pwdInput').value;
  const err  = document.getElementById('errBox');
  err.innerText = '';

  if (!mssv || !pwd){ err.innerText = 'Vui lòng nhập MSSV và mật khẩu.'; return; }
  if (!/^\d{6,12}$/.test(mssv)){ err.innerText = 'MSSV phải là dãy số (6–12 ký tự).'; return; }

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.innerText = 'Đang đăng nhập...';

  const email = mssv + AUTH_SUFFIX;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });
  btn.disabled = false;
  btn.innerText = 'Đăng nhập';

  if (error){
    const m = (error.message || '').toLowerCase();
    err.innerText = m.includes('invalid') ? 'Sai MSSV hoặc mật khẩu.' :
                    error.message || 'Đăng nhập thất bại.';
    return;
  }

  try { localStorage.setItem('saved_creds', JSON.stringify({ email, pwd, mssv })); } catch(e){}

  const { data: isAdm } = await supabase.rpc('is_admin');
  location.href = isAdm ? 'admin.html' : 'checkin.html';
}

async function autoLogin(){
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session){
      const { data: isAdm } = await supabase.rpc('is_admin');
      const btn = document.getElementById('btnOpenLogin');
      if (btn){
        btn.innerHTML = isAdm ? '🛠️ Vào trang quản trị →' : '📷 Vào trang điểm danh →';
        btn.onclick = () => { location.href = isAdm ? 'admin.html' : 'checkin.html'; };
      }
      return;
    }
    const raw = localStorage.getItem('saved_creds');
    if (!raw) return;
    const c = JSON.parse(raw);
    const { data: loginData } = await supabase.auth.signInWithPassword({
      email: c.email, password: c.pwd
    });
    if (loginData?.session){
      const { data: isAdm } = await supabase.rpc('is_admin');
      location.href = isAdm ? 'admin.html' : 'checkin.html';
    }
  } catch(e){ console.warn('[autoLogin]', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  autoLogin();
  const m = document.getElementById('mssvInput');
  const p = document.getElementById('pwdInput');
  m?.addEventListener('keydown', e => { if (e.key === 'Enter') p?.focus(); });
  p?.addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
});
