// Đăng nhập trang quản lý (index.html) — Supabase Auth (username + password)
// Chỉ tài khoản được tạo trong Supabase Dashboard (email "<username>@diemdanh.admin") mới vào được.

function openLogin(){
  document.getElementById('modalBg').classList.add('show');
  // Nếu đã đăng nhập trước đó thì vào thẳng admin
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) location.href = 'admin.html';
  });
}
function closeLogin(){ document.getElementById('modalBg').classList.remove('show'); }

async function submitLogin(){
  const username = document.getElementById('userInput').value.trim().toLowerCase().replace(/\s+/g, '');
  const pwd = document.getElementById('pwdInput').value;
  const err = document.getElementById('errBox');
  err.innerText = '';
  if (!username || !pwd) { err.innerText = 'Nhập đủ tên đăng nhập và mật khẩu!'; return; }

  const btn = document.getElementById('btnLogin');
  if (btn) btn.disabled = true;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: username.includes('@') ? username : username + CONFIG.AUTH_EMAIL_SUFFIX,
    password: pwd,
  });
  if (btn) btn.disabled = false;

  if (error) { err.innerText = 'Sai tên đăng nhập hoặc mật khẩu!'; return; }
  
  // Kiểm tra quyền (admin vào admin.html, sinh viên vào student.html hoặc báo thành công)
  const role = data.user?.user_metadata?.app_role;
  if (role === 'student') {
      alert('Đăng nhập sinh viên thành công!');
      // location.href = 'student.html'; // Tương lai có thể làm trang cho sinh viên
  } else if (role === 'leader') {
      alert('Đăng nhập đội trưởng thành công!');
      // location.href = 'leader.html';
  } else {
      location.href = 'admin.html';
  }
}

// Cho phép nhấn Enter khi đang ở ô mật khẩu
document.addEventListener('DOMContentLoaded', () => {
  const pwd = document.getElementById('pwdInput');
  if (pwd) pwd.addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
});
