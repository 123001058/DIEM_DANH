/**
 * Hướng dẫn lấy Token Zalo trong 5 giây qua trình duyệt
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const sessionFile = path.join(__dirname, 'zalo_session.json');

console.log('================================================================');
console.log('🔑 CÁCH LẤY TOKEN ZALO TRONG 5 GIÂY (SIÊU ĐƠN GIẢN):');
console.log('================================================================');
console.log('1. Mở trình duyệt Chrome/Edge, vào trang: https://chat.zalo.me');
console.log('   (Đăng nhập tài khoản Zalo của bạn nếu chưa đăng nhập)');
console.log('2. Nhấn phím F12 (hoặc chuột phải -> Kiểm tra -> chọn tab Console)');
console.log('3. Copy đoạn mã bên dưới và DÁN vào Console rồi nhấn ENTER:');
console.log('----------------------------------------------------------------');
console.log(`copy(JSON.stringify({ cookie: document.cookie, imei: localStorage.getItem('z_imei') || localStorage.getItem('zpw_imei') || 'c04c5521-72f1-48cf-9a99-4d69bb8bc4b6', userAgent: navigator.userAgent })); alert("✅ ĐÃ COPY XONG TOKEN ZALO VÀO BỘ NHỚ TẠM!");`);
console.log('----------------------------------------------------------------');
console.log('4. Sau khi nhấn Enter, mã Token đã được tự động copy.');
console.log('   - Hãy dán vào GitHub Secret tên: ZALO_CREDENTIALS');
console.log('   - HOẶC dán trực tiếp vào đây rồi nhấn Enter để lưu trên máy:\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('👉 Dán mã Token vào đây (nhấn chuột phải hoặc Ctrl+V) rồi bấm Enter: \n', (answer) => {
  const trimmed = answer.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed.cookie || !parsed.userAgent) {
        console.log('⚠️ Dữ liệu JSON thiếu trường cookie hoặc userAgent.');
      }
      fs.writeFileSync(sessionFile, JSON.stringify(parsed, null, 2), 'utf-8');
      console.log('\n🎉 ĐÃ LƯU TOKEN THÀNH CÔNG VÀO FILE: zalo_session.json!');
      console.log('Bây giờ bạn có thể chạy: npm run send');
    } catch (e) {
      console.log('❌ Dữ liệu bạn dán không phải là chuỗi JSON hợp lệ.');
    }
  } else {
    console.log('ℹ️ Bạn chưa nhập gì. Hãy copy token và dán vào GitHub Secrets ZALO_CREDENTIALS nhé.');
  }
  rl.close();
});
