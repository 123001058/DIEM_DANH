/**
 * Script Tự Động Gửi Lịch Rảnh / Bận Ngày Mai Vào Nhóm Zalo
 * Chạy bởi GitHub Actions lúc 20:00 Hàng ngày hoặc chạy trực tiếp bằng lệnh:
 * npm run send
 */
const { Zalo, MessageType } = require('zca-js');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Cấu hình Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nhjkpknhybenkxwadvzv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_h1nRwciz_rOgnD88ZCnkIw_v0Czf1L8';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Lấy session credentials từ biến môi trường hoặc file local
let appState = null;
if (process.env.ZALO_CREDENTIALS) {
  try {
    appState = typeof process.env.ZALO_CREDENTIALS === 'string' 
      ? JSON.parse(process.env.ZALO_CREDENTIALS) 
      : process.env.ZALO_CREDENTIALS;
  } catch (e) {
    console.error('❌ Lỗi đọc ZALO_CREDENTIALS từ ENV:', e);
  }
} else {
  const localFile = path.join(__dirname, 'zalo_session.json');
  if (fs.existsSync(localFile)) {
    try {
      appState = JSON.parse(fs.readFileSync(localFile, 'utf-8'));
    } catch (e) {
      console.error('❌ Lỗi đọc zalo_session.json:', e);
    }
  }
}

// 3. Hàm tính ngày mai theo giờ Việt Nam (UTC+7)
function getVietnamTomorrow() {
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  vnNow.setDate(vnNow.getDate() + 1);
  
  const yyyy = vnNow.getFullYear();
  const mm = String(vnNow.getMonth() + 1).padStart(2, '0');
  const dd = String(vnNow.getDate()).padStart(2, '0');
  const dateKey = `${yyyy}-${mm}-${dd}`;

  const weekdayStr = vnNow.toLocaleDateString('vi-VN', { weekday: 'long' });
  const dateDisplay = `${dd}/${mm}/${yyyy}`;

  return { dateKey, weekdayStr, dateDisplay };
}

async function main() {
  console.log('==================================================');
  console.log('🤖 ROBOCON AUTO ZALO SENDER — 20:00 NOTIFICATION');
  console.log('==================================================');

  if (!appState || !appState.cookie) {
    console.error('❌ Không tìm thấy thông tin Token Zalo (ZALO_CREDENTIALS hoặc zalo_session.json).');
    console.error('👉 Hãy chạy "npm run login" để lấy Token Zalo trong 5 giây.');
    process.exit(1);
  }

  const { dateKey, weekdayStr, dateDisplay } = getVietnamTomorrow();
  console.log(`📅 Đang tổng hợp lịch ngày mai: ${weekdayStr} (${dateDisplay}) [Key: ${dateKey}]`);

  // 4. Lấy danh sách thành viên và thời khóa biểu từ Supabase
  const fromTime = new Date(`${dateKey}T00:00:00+07:00`).toISOString();
  const toTime = new Date(new Date(fromTime).getTime() + 86400000).toISOString();

  console.log('🔍 Đang truy vấn dữ liệu từ Supabase...');
  const [{ data: members, error: e1 }, { data: schedules, error: e2 }, { data: zaloSettings }] = await Promise.all([
    supabase.from('team_group_members').select('mssv, students(name)').limit(1000),
    supabase.from('student_schedules').select('mssv, subject_name, room_name, start_time, end_time').lt('start_time', toTime).gte('end_time', fromTime).order('start_time'),
    supabase.from('zalo_schedule_settings').select('*').eq('id', true).maybeSingle()
  ]);

  if (e1 || e2) {
    console.error('❌ Lỗi truy vấn Supabase:', e1 || e2);
    process.exit(1);
  }

  const memberMap = new Map();
  (members || []).forEach(m => {
    if (!memberMap.has(m.mssv)) {
      memberMap.set(m.mssv, m.students?.name || m.mssv);
    }
  });

  if (memberMap.size === 0) {
    const { data: allStudents } = await supabase.from('students').select('mssv, name').limit(100);
    (allStudents || []).forEach(s => memberMap.set(s.mssv, s.name));
  }

  const scheduleByMssv = new Map();
  (schedules || []).forEach(s => {
    const list = scheduleByMssv.get(s.mssv) || [];
    list.push(s);
    scheduleByMssv.set(s.mssv, list);
  });

  const freeStudents = [];
  const busyStudents = [];

  for (const [mssv, name] of memberMap.entries()) {
    const schedList = scheduleByMssv.get(mssv) || [];
    if (schedList.length === 0) {
      freeStudents.push({ mssv, name });
    } else {
      busyStudents.push({ mssv, name, classes: schedList });
    }
  }

  console.log(`📊 Thống kê: ${freeStudents.length} bạn rảnh, ${busyStudents.length} bạn có lịch học trường.`);

  // 5. Soạn tin nhắn Zalo
  let message = `📢 [THÔNG BÁO LỊCH XƯỞNG NGÀY MAI]\n`;
  message += `🗓 ${weekdayStr.toUpperCase()} - NGÀY ${dateDisplay}\n`;
  message += `🤖 Xưởng Robocon LH-NaviX (Phòng C503)\n\n`;

  message += `✅ THÀNH VIÊN RẢNH CẢ NGÀY (${freeStudents.length} bạn):\n`;
  if (freeStudents.length === 0) {
    message += `  • (Không có thành viên rảnh cả ngày)\n`;
  } else {
    freeStudents.forEach((s, idx) => {
      message += `  ${idx + 1}. ${s.name} (${s.mssv})\n`;
    });
  }

  message += `\n⚠️ THÀNH VIÊN CÓ LỊCH HỌC TRƯỜNG (${busyStudents.length} bạn):\n`;
  if (busyStudents.length === 0) {
    message += `  • (Cả đội đều không vướng lịch học)\n`;
  } else {
    busyStudents.forEach((s, idx) => {
      const classInfo = s.classes.map(c => {
        const tStart = new Date(c.start_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        const tEnd = new Date(c.end_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
        const room = c.room_name ? ` (Phòng ${c.room_name})` : '';
        return `     👉 ${tStart} - ${tEnd}: ${c.subject_name}${room}`;
      }).join('\n');

      message += `  ${idx + 1}. ${s.name} (${s.mssv}):\n${classInfo}\n`;
    });
  }

  message += `\n📌 Đề nghị các thành viên rảnh có mặt đúng 07:30 (ca sáng) hoặc 13:00 (ca chiều) tại xưởng để tiếp tục tiến độ làm Robot!\n`;
  message += `💬 Mọi trường hợp bận việc đột xuất xin vui lòng báo sớm cho Đội trưởng.`;

  console.log('\n--- NỘI DUNG TIN NHẮN ---');
  console.log(message);
  console.log('-------------------------\n');

  // 6. Đăng nhập Zalo và gửi tin
  console.log('🔌 Đang kết nối Zalo Client...');
  const zalo = new Zalo(appState, {
    selfListen: false,
    checkUpdate: false
  });

  const api = await zalo.login();
  console.log('✅ Zalo Client đã đăng nhập thành công!');

  let targetGroupId = process.env.ZALO_GROUP_ID || zaloSettings?.group_id;

  if (!targetGroupId) {
    console.log('🔍 Đang tìm danh sách nhóm chat Zalo...');
    try {
      const groups = await api.getAllGroups();
      console.log('\n📋 DANH SÁCH NHÓM CHAT ZALO CỦA BẠN:');
      const groupList = groups?.gridList || groups || [];
      const entries = Array.isArray(groupList) ? groupList : Object.values(groupList);

      entries.forEach(g => {
        const gid = g.grid || g.id;
        const gname = g.name || g.groupName || 'Không tên';
        console.log(` • ID: ${gid} | Tên: ${gname}`);
      });

      const found = entries.find(g => {
        const name = (g.name || g.groupName || '').toLowerCase();
        return name.includes('robocon') || name.includes('c503') || name.includes('navix');
      });

      if (found) {
        targetGroupId = found.grid || found.id;
        console.log(`\n🎯 Tự động chọn nhóm: "${found.name || found.groupName}" (ID: ${targetGroupId})`);
      }
    } catch (err) {
      console.warn('⚠️ Không lấy được danh sách nhóm:', err?.message);
    }
  }

  if (!targetGroupId) {
    console.error('❌ Chưa có ZALO_GROUP_ID. Hãy điền ID nhóm vào GitHub Secret ZALO_GROUP_ID.');
    process.exit(1);
  }

  console.log(`🚀 Đang gửi tin nhắn vào nhóm Zalo (ID: ${targetGroupId})...`);
  try {
    const msgType = MessageType?.GroupMessage || 1;
    await api.sendMessage({ msg: message }, targetGroupId, msgType);
    console.log('🎉 GỬI TIN NHẮN ZALO THÀNH CÔNG!');

    // Ghi log vào Supabase
    await supabase.from('zalo_schedule_logs').insert({
      run_date: dateKey,
      trigger_type: process.env.GITHUB_ACTIONS ? 'github_actions' : 'manual',
      status: 'success',
      group_label: zaloSettings?.group_label || 'Robocon Xưởng C503',
      free_count: freeStudents.length,
      busy_count: busyStudents.length,
      message: message
    });

    console.log('📝 Đã lưu log vào Supabase.');
    process.exit(0);
  } catch (sendErr) {
    console.error('❌ Gửi tin nhắn thất bại:', sendErr);
    await supabase.from('zalo_schedule_logs').insert({
      run_date: dateKey,
      trigger_type: process.env.GITHUB_ACTIONS ? 'github_actions' : 'manual',
      status: 'error',
      error: String(sendErr?.message || sendErr)
    });
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
