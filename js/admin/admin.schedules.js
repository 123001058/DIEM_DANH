/* =====================================================================
   LH-NaviX Admin — admin.schedules.js
   Lịch Zalo (carousel tuần) & nội quy Robocon
   (Tách từ admin.html; các file nạp theo thứ tự, không đổi thứ tự.)
   ===================================================================== */
/* ==========================================================
   MOBILE ZALO SCHEDULE HELPERS: WEEK CAROUSEL & CARD VIEW
   ========================================================== */
function toggleZaloViewMode() {
  const isTable = document.body.classList.toggle('zalo-show-table');
  const txt = document.getElementById('zaloToggleViewText');
  if (txt) txt.textContent = isTable ? 'Xem Thẻ' : 'Xem Bảng';
}

function renderZaloWeekPills(dateKey) {
  const container = document.getElementById('zaloWeekCarousel');
  if (!container) return;
  const today = new Date();
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const pills = [];
  
  // Hiển thị 7 ngày từ hôm qua (-1) đến 5 ngày sau (+5)
  for (let offset = -1; offset <= 5; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const key = getVietnamDateKey(offset);
    const labelDay = offset === 0 ? 'H.Nay' : offset === 1 ? 'N.Mai' : dayNames[d.getDay()];
    const labelDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const isActive = (key === dateKey);

    pills.push(`
      <button type="button" class="zalo-week-pill ${isActive ? 'active' : ''}" onclick="setZaloQuickDate(${offset})">
        <span class="wp-day">${labelDay}</span>
        <span class="wp-date">${labelDate}</span>
      </button>
    `);
  }
  container.innerHTML = pills.join('');
}

function openDatePickerPopup() {
  const picker = document.getElementById('zaloDatePicker');
  if (!picker) return;
  if (typeof picker.showPicker === 'function') {
    picker.showPicker();
  } else {
    picker.focus();
    picker.click();
  }
}

/* ==========================================================
   ROBOCON RULES & NOTES (TẠO, ĐIỀN, SỬA, XÓA)
   ========================================================== */
const DEFAULT_ROBOCON_RULES = [
  {
    id: 'r_1',
    title: '⏰ Giờ giấc điểm danh chuẩn',
    desc: 'Có mặt tại xưởng C503 đúng 07:30 (ca sáng) và 13:00 (ca chiều). Quét mã QR trong 45 phút đầu ca.'
  },
  {
    id: 'r_2',
    title: '⏱ Quy định Đi muộn & Vắng không phép',
    desc: 'Quét QR trễ từ 15 đến 45 phút tính "Đi muộn". Sau 45 phút không có lý do chính đáng sẽ tính "Vắng không phép".'
  },
  {
    id: 'r_3',
    title: '📝 Quy trình Xin phép nghỉ & Bù ca',
    desc: 'Thành viên bận học trường hoặc việc đột xuất phải báo đội trưởng/admin trước ít nhất 2 giờ và chủ động bù ca vào ngày rảnh.'
  },
  {
    id: 'r_4',
    title: '🛡️ An toàn lao động & Thiết bị xưởng',
    desc: 'Bắt buộc mang giày bít mũi và đeo kính bảo hộ khi hàn cắt phay tiện. Không bật nguồn robot khi chưa kiểm tra dây dẫn.'
  },
  {
    id: 'r_5',
    title: '🧹 Vệ sinh xưởng cuối mỗi ca',
    desc: '15 phút trước khi kết thúc ca: Thu dọn phoi nhôm, cuộn gọn dây cắm, cất dụng cụ về đúng vị trí và tắt thiết bị điện.'
  }
];

let roboconRulesCache = [];
function getRoboconRules(){return roboconRulesCache;}
function renderRoboconRules(){
  const container=document.getElementById('roboconRulesList');if(!container)return;
  if(!roboconRulesCache.length){container.innerHTML='<div style="padding:18px;text-align:center;color:var(--muted);font-size:13px">Chưa có quy định nào được ghi lại.</div>';return;}
  container.innerHTML=roboconRulesCache.map(r=>`<div class="rule-item" id="rule_item_${r.id}"><div class="rule-item-content"><div class="rule-item-title">${escapeHtml(r.title)}</div><div class="rule-item-desc">${escapeHtml(r.desc)}</div></div><div class="rule-item-actions"><button class="btn btn-sm btn-secondary" onclick="openEditRuleModal('${r.id}')" title="Chỉnh sửa">✏️ Sửa</button><button class="btn btn-sm btn-danger" onclick="deleteRoboconRule('${r.id}')" title="Xóa">🗑 Xóa</button></div></div>`).join('');
}
async function loadRoboconRules(){
  const container=document.getElementById('roboconRulesList');if(container)container.innerHTML='<div class="schedule-loading">Đang tải quy định…</div>';
  const {data,error}=await supabase.from('workshop_rules').select('id,title,content,created_at').order('created_at',{ascending:true});
  if(error){if(container)container.innerHTML='<div class="schedule-loading">Không tải được quy định: '+escapeHtml(error.message)+'</div>';return;}
  let rows=data||[];
  if(!rows.length){
    let seed=DEFAULT_ROBOCON_RULES;
    try{const legacy=JSON.parse(localStorage.getItem('robocon_rules_notes')||'null');if(Array.isArray(legacy)&&legacy.length)seed=legacy;}catch{}
    const {data:inserted,error:seedError}=await supabase.from('workshop_rules').insert(seed.map(r=>({title:r.title,content:r.desc}))).select('id,title,content,created_at');
    if(seedError){if(container)container.innerHTML='<div class="schedule-loading">Không khởi tạo được quy định: '+escapeHtml(seedError.message)+'</div>';return;}
    rows=inserted||[];
  }
  roboconRulesCache=rows.map(r=>({id:r.id,title:r.title,desc:r.content}));renderRoboconRules();
}

function openAddRuleModal(){document.getElementById('editRuleId').value='';document.getElementById('ruleModalHeading').textContent='Thêm quy định / ghi chú mới';document.getElementById('ruleTitleInput').value='';document.getElementById('ruleContentInput').value='';document.getElementById('ruleEditModal')?.classList.add('show');}
function openEditRuleModal(ruleId){const rule=getRoboconRules().find(x=>x.id===ruleId);if(!rule)return;document.getElementById('editRuleId').value=rule.id;document.getElementById('ruleModalHeading').textContent='Chỉnh sửa quy định / ghi chú';document.getElementById('ruleTitleInput').value=rule.title;document.getElementById('ruleContentInput').value=rule.desc;document.getElementById('ruleEditModal')?.classList.add('show');}
function closeRuleEditModal(){document.getElementById('ruleEditModal')?.classList.remove('show');}
async function saveRoboconRule(){
  const id=document.getElementById('editRuleId').value.trim(),title=document.getElementById('ruleTitleInput').value.trim(),content=document.getElementById('ruleContentInput').value.trim();
  if(!title||!content){toast('warn','Thiếu thông tin','Vui lòng điền tiêu đề và nội dung quy định.');return;}
  const result=id?await supabase.from('workshop_rules').update({title,content,updated_at:new Date().toISOString()}).eq('id',id):await supabase.from('workshop_rules').insert({title,content});
  if(result.error){toast('err','Chưa lưu được',result.error.message);return;}
  closeRuleEditModal();await loadRoboconRules();toast('ok',id?'Đã cập nhật luật':'Đã thêm luật','Sinh viên sẽ xem được sau khi tải lại hoặc đồng bộ trang.');
}
async function deleteRoboconRule(ruleId){if(!confirm('Bạn có chắc muốn xóa quy định này?'))return;const {error}=await supabase.from('workshop_rules').delete().eq('id',ruleId);if(error){toast('err','Chưa xóa được',error.message);return;}await loadRoboconRules();toast('ok','Đã xóa','Quy định đã được gỡ khỏi trang sinh viên.');}
async function resetDefaultRoboconRules(){
  if(!confirm('Khôi phục lại 5 quy định mẫu? Các quy định hiện tại sẽ bị thay thế.'))return;
  const {error:delError}=await supabase.from('workshop_rules').delete().not('id','is',null);if(delError){toast('err','Không thể khôi phục',delError.message);return;}
  const {error}=await supabase.from('workshop_rules').insert(DEFAULT_ROBOCON_RULES.map(r=>({title:r.title,content:r.desc})));if(error){toast('err','Không thể khôi phục',error.message);return;}
  await loadRoboconRules();toast('ok','Đã khôi phục','Đã thay thế bằng 5 quy định mẫu.');
}

