(function(){
  if (typeof window === 'undefined') return;
  const loc = window.location;
  const path = loc.pathname.substring(0, loc.pathname.lastIndexOf('/'));
  window.__DETECTED_BASE_URL__ = loc.origin + path;
})();

// 1. Cấu hình Supabase
const CONFIG = {
    SUPABASE_URL: 'https://nhjkpknhybenkxwadvzv.supabase.co',
    SUPABASE_KEY: 'sb_publishable_h1nRwciz_rOgnD88ZCnkIw_v0Czf1L8',
    CATEGORIES: ['Thiết kế', 'Cơ khí', 'Điện', 'Lập trình'],
    // Supabase Auth đăng nhập bằng email. Form chỉ hiện "Tên đăng nhập",
    // app tự ghép hậu tố này -> email nội bộ.
    AUTH_EMAIL_SUFFIX: '@sv.local',
};

// 2. Khởi tạo client Supabase (Sử dụng thư viện từ CDN)
const _supabaseLib = window.supabase;
const supabaseClient = _supabaseLib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
// Gán lại biến toàn cục để các file khác gọi là 'supabase' cho tiện
window.supabase = supabaseClient;
window.supabaseSDK = _supabaseLib;
// Đảm bảo gọi window.supabase.createClient(...) không bị lỗi is not a function
window.supabase.createClient = function(...args) {
  return _supabaseLib.createClient(...args);
};

// Escape dữ liệu từ DB trước khi chèn vào innerHTML (chống XSS)
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 3. Quản lý danh sách sinh viên từ file JSON
let validStudents = [];

async function loadStudents() {
  try {
    const { data, error } = await window.supabase.from('students').select('*').order('mssv');
    if (error) throw error;
    validStudents = data || [];
    return validStudents;
  } catch (e) {
    console.error('[loadStudents] Lỗi:', e);
    validStudents = [];
    return [];
  }
}
