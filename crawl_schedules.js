const fs = require('fs');
const path = require('path');

const STUDENTS_FILE = path.join(__dirname, 'students.json');
const OUTPUT_JSON = path.join(__dirname, 'lich_hoc_tong_hop.json');
const OUTPUT_CSV = path.join(__dirname, 'lich_hoc_tong_hop.csv');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSchedule(studentId) {
  const payload = {
    StudentID: studentId,
    Ngay: new Date().toISOString(),
    PageIndex: 1,
    PageSize: 100
  };

  const res = await fetch('https://tapi.lhu.edu.vn/calen/auth/XemLich_LichSinhVien', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  const json = await res.json();
  const studentName = json.data?.[0]?.[0]?.HoTen || '';
  const semesterInfo = json.data?.[1]?.[0] || {};
  const scheduleItems = json.data?.[2] || [];

  return {
    studentName,
    semesterInfo,
    scheduleItems
  };
}

async function main() {
  const rawData = fs.readFileSync(STUDENTS_FILE, 'utf8');
  const { students } = JSON.parse(rawData);

  console.log(`Bắt đầu thu thập lịch học cho ${students.length} sinh viên...`);

  const allResults = [];
  const allRows = [];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    process.stdout.write(`[${i + 1}/${students.length}] Thu thập MSSV ${s.mssv} (${s.name})... `);
    try {
      const data = await fetchSchedule(s.mssv);
      const itemsCount = data.scheduleItems.length;
      console.log(`OK: ${itemsCount} buổi học`);

      allResults.push({
        mssv: s.mssv,
        name: s.name,
        hoTenLHU: data.studentName,
        semesterInfo: data.semesterInfo,
        totalSessions: itemsCount,
        schedule: data.scheduleItems
      });

      // Tách từng buổi vào mảng phẳng để xuất file CSV
      data.scheduleItems.forEach(item => {
        const thuStr = item.Thu === 1 ? 'Chủ nhật' : `Thứ ${item.Thu}`;
        const buoiStr = item.Buoi === 1 ? 'Sáng' : item.Buoi === 2 ? 'Chiều' : item.Buoi === 3 ? 'Tối' : `Buổi ${item.Buoi}`;
        const startStr = item.ThoiGianBD ? new Date(item.ThoiGianBD).toLocaleString('vi-VN') : '';
        const endStr = item.ThoiGianKT ? new Date(item.ThoiGianKT).toLocaleString('vi-VN') : '';

        allRows.push({
          mssv: s.mssv,
          studentName: s.name,
          thu: thuStr,
          buoi: buoiStr,
          monHoc: item.TenMonHoc || '',
          nhom: item.TenNhom || '',
          giaoVien: item.GiaoVien || '',
          phong: item.TenPhong || '',
          coSo: item.TenCoSo || '',
          thoiGianBD: startStr,
          thoiGianKT: endStr,
          onlineLink: item.OnlineLink || ''
        });
      });

      // Tránh request quá nhanh
      await sleep(250);
    } catch (e) {
      console.log(`LỖI: ${e.message}`);
      allResults.push({
        mssv: s.mssv,
        name: s.name,
        error: e.message,
        schedule: []
      });
    }
  }

  // 1. Lưu file JSON tổng hợp
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n✓ Đã lưu file JSON: ${OUTPUT_JSON}`);

  // 2. Lưu file CSV với BOM UTF-8 (chuẩn tiếng Việt Excel)
  let csv = '\uFEFF';
  csv += 'MSSV,Họ và tên,Thứ,Buổi,Môn học,Lớp/Nhóm,Giảng viên,Phòng học,Cơ sở,Bắt đầu,Kết thúc,Link Online\n';

  allRows.forEach(r => {
    const line = [
      `"${r.mssv}"`,
      `"${r.studentName.replace(/"/g, '""')}"`,
      `"${r.thu}"`,
      `"${r.buoi}"`,
      `"${r.monHoc.replace(/"/g, '""')}"`,
      `"${r.nhom.replace(/"/g, '""')}"`,
      `"${r.giaoVien.replace(/"/g, '""')}"`,
      `"${r.phong.replace(/"/g, '""')}"`,
      `"${r.coSo.replace(/"/g, '""')}"`,
      `"${r.thoiGianBD}"`,
      `"${r.thoiGianKT}"`,
      `"${r.onlineLink.replace(/"/g, '""')}"`
    ].join(',');
    csv += line + '\n';
  });

  fs.writeFileSync(OUTPUT_CSV, csv, 'utf8');
  console.log(`✓ Đã lưu file CSV: ${OUTPUT_CSV} (${allRows.length} buổi học tổng cộng)`);
}

main().catch(console.error);
