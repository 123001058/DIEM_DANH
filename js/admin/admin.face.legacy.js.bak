/* =====================================================================
   LH-NaviX Admin — admin.face.js
   Camera điểm danh khuôn mặt ESP32 & huấn luyện 5 góc
   (Tách từ admin.html; các file nạp theo thứ tự, không đổi thứ tự.)
   ===================================================================== */
// ==========================================================
// CAMERA ĐIỂM DANH KHUÔN MẶT ESP32 (TÍCH HỢP TRỰC TIẾP ADMIN)
// ==========================================================
let adminFaceModelsLoaded = false;
let adminFaceMatcher = null;
let isAdminEspDetecting = false;
let adminEspStreamRunning = false;
let adminEspMirrored = false;
let adminAntiSpoofEnabled = true; // Bật chống ảnh giả 2D mặc định
let adminRecentScans = [];
let adminLastCheckinTime = {};
let adminConsecutiveHits = {};
let adminFpsCounter = 0;
let adminLastFpsTime = performance.now();

// MiniFASNet-V2 ONNX session cho Camera ESP32 Admin
let adminFasnetSession = null;
let adminFasnetLoading = false;

async function loadAdminFasnetModel() {
  if (adminFasnetSession || adminFasnetLoading) return;
  adminFasnetLoading = true;
  try {
    if (typeof ort === 'undefined') {
      console.warn('[Admin AntiSpoof] ort chưa sẵn sàng');
      return;
    }
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
    try {
      adminFasnetSession = await ort.InferenceSession.create('models/anti-spoofing/minifasnet_v2.onnx', { executionProviders: ['wasm'] });
      console.log('[Admin AntiSpoof] MiniFASNet-V2 loaded thành công từ local models/');
    } catch(errLocal) {
      console.warn('[Admin AntiSpoof] Thử tải HuggingFace CDN...', errLocal.message);
      adminFasnetSession = await ort.InferenceSession.create('https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/main/minifasnet_v2.onnx', { executionProviders: ['wasm'] });
      console.log('[Admin AntiSpoof] MiniFASNet-V2 loaded thành công từ CDN');
    }
  } catch(e) {
    console.warn('[Admin AntiSpoof] Lỗi load MiniFASNet:', e.message);
    adminFasnetSession = null;
  } finally {
    adminFasnetLoading = false;
  }
}

// 1. Mở ngăn trượt Camera
function openFaceCamAccordion() {
  const acc = document.getElementById('accFaceCam');
  const head = document.getElementById('accHeadFaceCam');
  if (acc && head) {
    if (!acc.classList.contains('open')) {
      toggleAcc(head, initFaceCamInAdmin);
    }
    acc.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function formatEspStreamUrl(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/\/.*$/, '');
  let host = s;
  let port = '81';
  if (s.includes(':')) {
    const parts = s.split(':');
    host = parts[0];
    port = parts[1] || '81';
  }
  return `http://${host}:${port}/stream`;
}

// Xuất toàn bộ dữ liệu khuôn mặt (descriptor + thumbnail) để huấn luyện nhận diện
async function exportAllFaceData() {
  try {
    const { data, error } = await supabase.rpc('admin_export_face_data');
    if (error) throw error;
    if (!data || data.ok === false) throw new Error((data && data.message) || 'Không xuất được dữ liệu.');
    const payload = {
      exported_at: data.exported_at,
      count: data.count,
      note: 'Du lieu khuon mat LH-NaviX. descriptors = vector 128D (face-api), thumbnails = anh 100x100 (data URL base64).',
      students: data.students || []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'LH-NaviX_face-data_' + stamp + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('ok', 'Đã xuất dữ liệu khuôn mặt', (data.count || 0) + ' sinh viên có mẫu khuôn mặt.');
  } catch (e) {
    toast('err', 'Xuất dữ liệu thất bại', escapeHtml(e.message || String(e)));
  }
}

// 2. Khởi tạo Camera & Face-API trong Admin
async function initFaceCamInAdmin() {
  const ipInput = document.getElementById('adminEspIpInput');
  let savedIp = localStorage.getItem('esp_cam_ip');
  if (!savedIp || savedIp === '192.168.1.104') {
    savedIp = '192.168.2.168';
  }
  if (ipInput) ipInput.value = savedIp;
  localStorage.setItem('esp_cam_ip', savedIp);

  // Khôi phục cấu hình số phút đi muộn đã lưu
  const lateInput = document.getElementById('adminLateMinutesInput');
  const savedLateMin = localStorage.getItem('admin_late_minutes') || '15';
  if (lateInput) lateInput.value = savedLateMin;

  // Tải MiniFASNet song song
  loadAdminFasnetModel();

  if (adminFaceModelsLoaded) {
    reloadAdminFaceMatcher();
    return;
  }

  const hud = document.getElementById('adminEspHudText');
  if (hud) hud.textContent = '⏳ Đang tải mô hình AI nhận diện & chống ảnh...';

  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    adminFaceModelsLoaded = true;

    reloadAdminFaceMatcher();
    syncAdminFacesFromSupabase();
    if (hud) hud.textContent = '🟢 AI sẵn sàng (Đã bật chống ảnh 2D) — Nhấn "Bắt đầu quét"';
  } catch(e) {
    console.error('Lỗi load face-api trong admin:', e);
    if (hud) hud.textContent = '❌ Lỗi tải AI. Vui lòng kiểm tra mạng.';
  }
}

// Tự động kéo dữ liệu 5 vector khuôn mặt từ bảng student_face_data trên Supabase
async function syncAdminFacesFromSupabase(showNotification = false) {
  const hud = document.getElementById('adminEspHudText');
  try {
    if (!students || students.length === 0) {
      await loadStudents();
    }
    const { data, error } = await supabase.from('student_face_data').select('mssv, descriptors, thumbnails, updated_at');
    if (error) throw error;
    const rows = data || [];
    let db = JSON.parse(localStorage.getItem('face_descriptors_db') || '{}');
    let tdb = JSON.parse(localStorage.getItem('face_thumbnails_db') || '{}');
    let merged = 0;

    rows.forEach(row => {
      const mssv = row.mssv;
      const st = (students || []).find(s => s.mssv === mssv);
      const name = st ? st.name : mssv;
      const label = `${mssv} - ${name}`;
      const valid = (row.descriptors || []).filter(d => d);
      if (valid.length > 0) {
        db[label] = valid;
        if (row.thumbnails && row.thumbnails.length > 0) {
          tdb[label] = row.thumbnails.filter(t => t);
        }
        merged++;
      }
    });

    // Tự động trích xuất vector khuôn mặt từ 29 ảnh avatar Word cho các bạn chưa có
    if (adminFaceModelsLoaded && typeof faceapi !== 'undefined' && students && students.length > 0) {
      for (const st of students) {
        const label = `${st.mssv} - ${st.name}`;
        if ((!db[label] || db[label].length === 0) && st.avatar) {
          try {
            const img = await faceapi.fetchImage(st.avatar);
            const det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.25 }))
              .withFaceLandmarks(true)
              .withFaceDescriptor();
            if (det && det.descriptor) {
              const vec = Array.from(det.descriptor);
              db[label] = [vec];
              tdb[label] = [st.avatar];
              merged++;
              // Lưu lên Supabase student_face_data
              supabase.from('student_face_data').upsert({
                mssv: st.mssv,
                descriptors: [vec],
                thumbnails: [st.avatar],
                updated_at: new Date().toISOString()
              }, { onConflict: 'mssv' }).then();
            }
          } catch(e) {}
        }
      }
    }

    localStorage.setItem('face_descriptors_db', JSON.stringify(db));
    localStorage.setItem('face_thumbnails_db', JSON.stringify(tdb));
    reloadAdminFaceMatcher();
    if (hud) hud.textContent = `🟢 Đã nạp ${merged} sinh viên (${Object.keys(db).length} người) vào bộ nhớ AI`;
    if (showNotification) {
      toast('ok', 'Đồng bộ thành công', `Đã đồng bộ ${merged} sinh viên vào bộ nhớ AI.`);
    }
  } catch(e) {
    console.warn('[syncAdminFacesFromSupabase]', e);
    if (showNotification) {
      toast('err', 'Lỗi đồng bộ Server', e.message);
    }
  }
}

// Nạp FaceMatcher từ localStorage
function reloadAdminFaceMatcher() {
  const db = JSON.parse(localStorage.getItem('face_descriptors_db') || '{}');
  const labeled = [];
  for (const [label, vectors] of Object.entries(db)) {
    if (vectors && vectors.length > 0) {
      const descriptors = vectors.map(v => new Float32Array(v));
      labeled.push(new faceapi.LabeledFaceDescriptors(label, descriptors));
    }
  }

  if (labeled.length > 0) {
    adminFaceMatcher = new faceapi.FaceMatcher(labeled, 0.39);
    const hud = document.getElementById('adminEspHudText');
    if (hud) hud.textContent = `🟢 Đã nạp ${labeled.length} sinh viên vào bộ nhớ AI`;
  } else {
    adminFaceMatcher = null;
  }
}

// Bật / Tắt luồng ESP32
function toggleAdminEspStream() {
  const btn = document.getElementById('btnAdminEspConnect');
  const img = document.getElementById('adminEspImg');
  const placeholder = document.getElementById('adminEspPlaceholder');
  const laser = document.getElementById('adminScanLaser');
  const ipInput = document.getElementById('adminEspIpInput');
  const hud = document.getElementById('adminEspHudText');

  if (adminEspStreamRunning) {
    // Dừng stream
    adminEspStreamRunning = false;
    isAdminEspDetecting = false;
    adminLivenessState = {};
    adminActiveSessionLabel = null;
    adminConsecutiveHits = {};
    adminLostFaceFrames = 0;
    if (img) {
      img.src = '';
      img.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'block';
    if (laser) laser.style.display = 'none';
    if (btn) {
      btn.textContent = '📡 Bắt đầu quét';
      btn.className = 'btn btn-primary btn-sm';
    }
    if (hud) hud.textContent = 'Đã ngắt kết nối Camera ESP32.';
    return;
  }

  const rawIp = ipInput ? ipInput.value.trim() : '';
  if (!rawIp) {
    toast('warn', 'Thiếu IP', 'Vui lòng nhập địa chỉ IP của ESP32!');
    return;
  }

  const streamUrl = formatEspStreamUrl(rawIp);
  localStorage.setItem('esp_cam_ip', rawIp);
  adminEspStreamRunning = true;
  adminLivenessState = {};
  adminActiveSessionLabel = null;
  adminConsecutiveHits = {};
  adminLostFaceFrames = 0;

  if (placeholder) placeholder.style.display = 'none';
  if (laser) laser.style.display = 'block';
  if (img) {
    img.style.display = 'block';
    img.style.transform = adminEspMirrored ? 'scaleX(-1)' : 'none';
    img.onload = () => {
      if (hud) hud.textContent = `🟢 ESP32 đang phát luồng: ${streamUrl}`;
    };
    img.onerror = () => {
      if (hud) hud.innerHTML = `❌ Không tải được luồng từ <b>${streamUrl}</b>. <br>Kiểm tra: 1) ESP32 đã cắm nguồn & sáng đèn chưa? 2) Laptop và ESP32 có cùng Wi-Fi không? 3) <a href="${streamUrl}" target="_blank" style="color:#38bdf8;text-decoration:underline;">Mở thử tab mới ↗</a>`;
    };
    img.src = streamUrl;
  }
  if (btn) {
    btn.textContent = '⏹ Dừng camera';
    btn.className = 'btn btn-danger btn-sm';
  }
  if (hud) hud.textContent = `📡 Đang kết nối ESP32: ${streamUrl}...`;

  if (!isAdminEspDetecting) {
    startAdminFaceLoop();
  }
}

function toggleAdminEspFlip() {
  adminEspMirrored = !adminEspMirrored;
  const img = document.getElementById('adminEspImg');
  if (img) {
    img.style.transform = adminEspMirrored ? 'scaleX(-1)' : 'none';
  }
}

let adminLivenessState = {}; // label -> session object
let adminActiveSessionLabel = null;
let adminLostFaceFrames = 0;

function resetAdminLivenessSession(label, reason = '') {
  if (label && adminLivenessState[label]) {
    delete adminLivenessState[label];
  }
  if (adminActiveSessionLabel === label) {
    adminActiveSessionLabel = null;
  }
}

// ==========================================================
// THÔNG SỐ CẤU HÌNH BỘ LỌC CHỐNG GIẢ MẠO 3 LỚP (LIVENESS CONFIG)
// ==========================================================
// ==========================================================
// CẤU HÌNH THỬ THÁCH NGẪU NHIÊN CHỐNG ẢNH GIẢ 100% (ACTIVE LIVENESS)
// ==========================================================
const ADMIN_CHALLENGES = [
  { id: 'TURN_RIGHT', label: '👉 LỆNH: HÃY QUAY PHẢI', hint: 'Quay đầu sang PHẢI' },
  { id: 'TURN_LEFT',  label: '👈 LỆNH: HÃY QUAY TRÁI', hint: 'Quay đầu sang TRÁI' },
  { id: 'LOOK_UP',    label: '👆 LỆNH: HÃY NGỬA ĐẦU',   hint: 'Ngửa nhẹ cằm lên trên' },
  { id: 'SMILE_OPEN', label: '😃 LỆNH: CƯỜI HOẶC HÁ MIỆNG', hint: 'Cười tươi hoặc há nhẹ miệng' }
];

const ADMIN_LIVENESS_CONFIG = {
  CHALLENGE_TIMEOUT_MS: 3800,  // Hạn thời gian 3.8 giây để làm theo lệnh
  PASS_CONSECUTIVE_FRAMES: 3   // Giữ đúng tư thế 3 frames liên tiếp (~0.2s) là chốt điểm danh
};

// 1. Tính Eye Aspect Ratio (EAR)
function calculateAdminEyeEAR(eye) {
  if (!eye || eye.length < 6) return 0.28;
  const p1_p5 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
  const p2_p4 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
  const p0_p3 = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
  return p0_p3 > 1 ? (p1_p5 + p2_p4) / (2.0 * p0_p3) : 0.28;
}

// 2. Tính Mouth Aspect Ratio (MAR)
function calculateAdminMAR(mouth) {
  if (!mouth || mouth.length < 12) return 0.16;
  const p0_p6 = Math.hypot(mouth[0].x - mouth[6].x, mouth[0].y - mouth[6].y);
  if (p0_p6 < 1) return 0.16;
  const p2_p10 = Math.hypot(mouth[2].x - mouth[10].x, mouth[2].y - mouth[10].y);
  const p3_p9 = Math.hypot(mouth[3].x - mouth[9].x, mouth[3].y - mouth[9].y);
  const p4_p8 = Math.hypot(mouth[4].x - mouth[8].x, mouth[4].y - mouth[8].y);
  return (p2_p10 + p3_p9 + p4_p8) / (2.0 * p0_p6);
}

// 3. Tính tỉ lệ lệch 3D chóp mũi so với 2 bên má (Head Yaw)
function calculateAdminHeadYaw(landmarks) {
  if (!landmarks) return 1.0;
  const nose = landmarks.getNose ? landmarks.getNose() : null;
  const jaw = landmarks.getJawOutline ? landmarks.getJawOutline() : null;
  if (!nose || !jaw || jaw.length < 17) return 1.0;

  const noseTip = nose[3] || nose[0];
  const leftCheek = jaw[1];
  const rightCheek = jaw[15];

  const dLeft = Math.hypot(noseTip.x - leftCheek.x, noseTip.y - leftCheek.y);
  const dRight = Math.hypot(noseTip.x - rightCheek.x, noseTip.y - rightCheek.y);

  if (dRight < 1) return 1.0;
  return dLeft / dRight;
}

// 4. Tính tỉ lệ ngửa đầu (Head Pitch)
function calculateAdminHeadPitch(landmarks) {
  if (!landmarks) return 1.0;
  const nose = landmarks.getNose ? landmarks.getNose() : null;
  const jaw = landmarks.getJawOutline ? landmarks.getJawOutline() : null;
  if (!nose || !jaw || jaw.length < 9) return 1.0;

  const noseRoot = nose[0];
  const noseTip = nose[3] || nose[0];
  const chin = jaw[8];

  const dUpper = Math.hypot(noseTip.x - noseRoot.x, noseTip.y - noseRoot.y);
  const dLower = Math.hypot(chin.x - noseTip.x, chin.y - noseTip.y);

  if (dUpper < 1) return 1.0;
  return dLower / dUpper;
}

// ==========================================================
// HỆ THỐNG THỬ THÁCH NGẪU NHIÊN THỜI GIAN THỰC (ACTIVE CHALLENGE)
// ==========================================================
async function evaluateAdminLiveness(label, landmarks, box) {
  if (!adminAntiSpoofEnabled) {
    return { isLive: true, prompt: '⚡ Nhận diện tức thì (Đã tắt chống giả)', isStaticPhoto: false };
  }
  if (!landmarks || !box) {
    return { isLive: false, prompt: '🔍 Đang căn chỉnh khuôn mặt...', isStaticPhoto: false };
  }

  const now = Date.now();

  // Khởi tạo hoặc lấy trạng thái của người này
  if (!adminLivenessState[label]) {
    adminLivenessState[label] = {
      challenge: null,
      challengeText: '',
      challengeStartTime: 0,
      baselineYaw: 1.0,
      baselinePitch: 1.0,
      baselineMar: 0.16,
      passFrames: 0,
      isPassed: false,
      lastPassTime: 0,
      failCount: 0
    };
  }

  const st = adminLivenessState[label];

  // Nếu người này vừa vượt qua thử thách trong vòng 8 giây qua -> Cho qua luôn để ghi nhận điểm danh
  if (st.isPassed && (now - st.lastPassTime < 8000)) {
    return { isLive: true, prompt: '✅ Đã xác thực thành công!', isStaticPhoto: false };
  }

  const yaw = calculateAdminHeadYaw(landmarks);
  const pitch = calculateAdminHeadPitch(landmarks);
  const mar = calculateAdminMAR(landmarks.getMouth ? landmarks.getMouth() : null);

  // Sinh thử thách ngẫu nhiên mới nếu chưa có hoặc vừa hết hạn
  if (!st.challenge || (now - st.challengeStartTime > ADMIN_LIVENESS_CONFIG.CHALLENGE_TIMEOUT_MS)) {
    // Nếu hết giờ của thử thách cũ mà chưa làm xong -> Phạt báo ảnh tĩnh
    const wasTimeout = (st.challenge !== null);

    const randomIdx = Math.floor(Math.random() * ADMIN_CHALLENGES.length);
    const chosen = ADMIN_CHALLENGES[randomIdx];

    st.challenge = chosen.id;
    st.challengeText = chosen.label;
    st.challengeStartTime = now;
    st.baselineYaw = yaw;
    st.baselinePitch = pitch;
    st.baselineMar = mar;
    st.passFrames = 0;
    st.isPassed = false;

    if (wasTimeout) {
      st.failCount++;
      return {
        isLive: false,
        prompt: `🚫 Chưa làm đúng lệnh! Thử lại: ${st.challengeText}`,
        isStaticPhoto: true
      };
    }
  }

  const elapsed = now - st.challengeStartTime;
  const remainSec = Math.max(0, (ADMIN_LIVENESS_CONFIG.CHALLENGE_TIMEOUT_MS - elapsed) / 1000).toFixed(1);

  // KIỂM TRA ĐIỀU KIỆN ĐẠT CỦA TỪNG LỆNH THỬ THÁCH
  let actionSatisfied = false;

  // Tính độ lệch so với tư thế ban đầu
  const yawDelta = yaw - st.baselineYaw;
  const pitchDelta = pitch - st.baselinePitch;
  const marDelta = mar - st.baselineMar;

  // Xét theo chiều lật gương (adminEspMirrored)
  const isMirrored = !!adminEspMirrored;

  switch (st.challenge) {
    case 'TURN_RIGHT':
      // Quay mặt sang PHẢI của người dùng:
      // Khi không lật gương: yaw dLeft/dRight tăng rõ rệt; Khi lật gương: ngược lại
      if (isMirrored) {
        actionSatisfied = (yaw <= 0.72 || yawDelta <= -0.22);
      } else {
        actionSatisfied = (yaw >= 1.35 || yawDelta >= 0.22);
      }
      break;

    case 'TURN_LEFT':
      // Quay mặt sang TRÁI của người dùng:
      if (isMirrored) {
        actionSatisfied = (yaw >= 1.35 || yawDelta >= 0.22);
      } else {
        actionSatisfied = (yaw <= 0.72 || yawDelta <= -0.22);
      }
      break;

    case 'LOOK_UP':
      // Ngửa cằm lên trên: pitch dLower/dUpper kéo dài
      actionSatisfied = (pitch >= 1.30 || pitchDelta >= 0.20);
      break;

    case 'SMILE_OPEN':
      // Cười tươi hoặc há nhẹ miệng
      actionSatisfied = (mar >= 0.24 || marDelta >= 0.08);
      break;
  }

  // Đếm số frame thỏa mãn liên tiếp
  if (actionSatisfied) {
    st.passFrames++;
    if (st.passFrames >= ADMIN_LIVENESS_CONFIG.PASS_CONSECUTIVE_FRAMES) {
      // ĐẠT THỬ THÁCH THÀNH CÔNG!
      st.isPassed = true;
      st.lastPassTime = now;
      return {
        isLive: true,
        prompt: '✅ Thử thách thành công! Đang điểm danh...',
        isStaticPhoto: false
      };
    } else {
      return {
        isLive: false,
        prompt: `✓ Đúng hướng! Giữ yên chút xíu (${st.passFrames}/3)`,
        isStaticPhoto: false
      };
    }
  } else {
    st.passFrames = 0;
    // Hiển thị chỉ dẫn kèm thời gian đếm ngược
    return {
      isLive: false,
      prompt: `⚡ ${st.challengeText} (${remainSec}s)`,
      isStaticPhoto: false
    };
  }
}
function toggleAdminAntiSpoof() {
  adminAntiSpoofEnabled = !adminAntiSpoofEnabled;
  const btn = document.getElementById('btnAdminAntiSpoof');
  if (btn) {
    btn.textContent = adminAntiSpoofEnabled ? '🛡️ AI Chống ảnh 2D: BẬT' : '⚡ Chế độ Siêu tốc (Tắt chống ảnh)';
    btn.classList.toggle('active', adminAntiSpoofEnabled);
  }
  adminLivenessState = {};
  adminActiveSessionLabel = null;
  adminConsecutiveHits = {};
  adminLostFaceFrames = 0;
  if (adminAntiSpoofEnabled) {
    toast('ok', 'Bảo vệ Anti-Spoof', 'Đã bật AI MiniFASNet-V2 chặn ảnh chụp 2D.');
  } else {
    toast('warn', 'Tắt Anti-Spoof', 'Đang ở chế độ quét nhanh không kiểm tra ảnh giả.');
  }
}

// Lưu cấu hình số phút đi muộn
function saveAdminLateMinutes(val) {
  const m = parseInt(val, 10);
  if (!isNaN(m) && m > 0) {
    localStorage.setItem('admin_late_minutes', String(m));
    toast('ok', 'Cài đặt Đi muộn', `Đã lưu: Sinh viên quét sau ${m} phút mở phiên sẽ bị tính là Đi muộn.`);
  }
}

// Vòng lặp nhận diện khuôn mặt ESP32 trong Admin
const adminCaptureCanvas = document.createElement('canvas');
const adminCaptureCtx = adminCaptureCanvas.getContext('2d', { willReadFrequently: true });

async function startAdminFaceLoop() {
  isAdminEspDetecting = true;
  const img = document.getElementById('adminEspImg');
  const canvas = document.getElementById('adminEspCanvas');
  const hud = document.getElementById('adminEspHudText');
  const fpsText = document.getElementById('adminEspFpsText');

  const step = async () => {
    if (!adminEspStreamRunning) {
      isAdminEspDetecting = false;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    try {
      if (adminFaceModelsLoaded && img && (img.naturalWidth > 0 || img.width > 0)) {
        // Cập nhật kích thước canvas
        const w = img.clientWidth || 480;
        const h = img.clientHeight || 360;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        // Chụp frame từ ảnh MJPEG sang canvas ngầm để AI đọc điểm ảnh ổn định tuyệt đối
        const frameW = img.videoWidth || img.naturalWidth || img.clientWidth || 640;
        const frameH = img.videoHeight || img.naturalHeight || img.clientHeight || 480;
        if (adminCaptureCanvas.width !== frameW || adminCaptureCanvas.height !== frameH) {
          adminCaptureCanvas.width = frameW;
          adminCaptureCanvas.height = frameH;
        }
        adminCaptureCtx.drawImage(img, 0, 0, frameW, frameH);

        // Ngưỡng 0.20 giúp bắt nhạy khuôn mặt ngay cả khi ngược sáng, đeo kính hoặc camera hơi tối
        let detections = [];
        try {
          detections = await faceapi
            .detectAllFaces(adminCaptureCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.22 }))
            .withFaceLandmarks(true)
            .withFaceDescriptors();
        } catch(detErr) {
          try {
            detections = await faceapi
              .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.22 }))
              .withFaceLandmarks(true)
              .withFaceDescriptors();
          } catch(e) {}
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const resizedDetections = faceapi.resizeResults(detections, { width: w, height: h });

        // FPS calculate
        adminFpsCounter++;
        const now = performance.now();
        if (now - adminLastFpsTime >= 1000) {
          if (fpsText) fpsText.textContent = `${adminFpsCounter} FPS`;
          adminFpsCounter = 0;
          adminLastFpsTime = now;
        }

        if (resizedDetections.length === 0) {
          adminLostFaceFrames++;
          if (hud) hud.textContent = adminSpeedMode ? '🟢 Đang quét tìm khuôn mặt...' : '🛡️ Đang quét tìm khuôn mặt...';
          if (adminLostFaceFrames >= 6) {
            adminLivenessState = {};
            adminActiveSessionLabel = null;
            adminConsecutiveHits = {};
          }
        } else {
          adminLostFaceFrames = 0;
          
          // Sắp xếp các khuôn mặt theo diện tích bbox giảm dần (mặt to/gần camera nhất đứng trước)
          const sortedDetections = [...resizedDetections].sort((a, b) => {
            const areaA = a.detection.box.width * a.detection.box.height;
            const areaB = b.detection.box.width * b.detection.box.height;
            return areaB - areaA;
          });

          if (sortedDetections.length > 1 && hud) {
            hud.textContent = `👥 Phát hiện ${sortedDetections.length} khuôn mặt — Đang quét từng người...`;
          }

          // Xử lý từng khuôn mặt
          for (let i = 0; i < sortedDetections.length; i++) {
            const det = sortedDetections[i];
            let labelText = 'Chưa nhận diện';
            let boxColor = '#38bdf8';
            let isMatched = false;
            let isLive = false;
            let livenessPrompt = '';

            if (adminFaceMatcher) {
              const bestMatch = adminFaceMatcher.findBestMatch(det.descriptor);
              const maxDistance = adminAntiSpoofEnabled ? 0.39 : 0.42;

              if (bestMatch.label !== 'unknown' && bestMatch.distance <= maxDistance) {
                isMatched = true;
                const confidence = Math.round((1 - bestMatch.distance) * 100);

                // Điểm danh cho sinh viên nếu khớp
                const rawBox = detections[i] ? detections[i].detection.box : det.detection.box;
                const liveCheck = await evaluateAdminLiveness(bestMatch.label, det.landmarks, rawBox);
                isLive = liveCheck.isLive;
                livenessPrompt = liveCheck.prompt;

                if (isLive) {
                  boxColor = '#22c55e'; // Xanh lá
                  labelText = `✓ ${bestMatch.label} (${confidence}%)`;
                  handleAdminFaceCheckin(bestMatch.label);
                  if (hud) hud.textContent = `✅ Nhận diện thành công: ${bestMatch.label}`;
                } else if (liveCheck.isStaticPhoto) {
                  boxColor = '#ef4444'; // Đỏ: Chặn ảnh giả mạo
                  labelText = `${livenessPrompt}`;
                  if (hud) hud.textContent = `🛡️ Cảnh báo: ${livenessPrompt} — Từ chối điểm danh!`;
                } else {
                  boxColor = '#f59e0b'; // Cam: Đang quét / căn chỉnh
                  labelText = `⏳ ${bestMatch.label}: ${livenessPrompt}`;
                }
              } else if (bestMatch.label !== 'unknown') {
                labelText = 'Khớp yếu / Nghi ngờ';
                boxColor = '#f59e0b';
              } else {
                labelText = 'Người lạ / Chưa học';
                boxColor = '#94a3b8';
              }
            }

            // Vẽ khung cho từng khuôn mặt (Chuẩn tọa độ khi lật gương, chữ không bị lộn ngược)
            const box = det.detection.box;
            const drawX = adminEspMirrored ? (w - box.x - box.width) : box.x;
            const labelY = box.y > 24 ? box.y - 24 : box.y;

            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(drawX, box.y, box.width, box.height);

            // Vẽ nhãn phía trên
            ctx.fillStyle = boxColor;
            ctx.font = 'bold 11.5px system-ui, sans-serif';
            const textWidth = ctx.measureText(labelText).width;
            ctx.fillRect(drawX, labelY, textWidth + 14, 22);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, drawX + 6, labelY + 15);
          }
        }
      }
    } catch(err) {
      console.warn('[Admin Face Loop Error]:', err);
    }

    requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

// Xử lý điểm danh khi phát hiện khuôn mặt sinh viên
async function handleAdminFaceCheckin(label) {
  const mssv = label.split(' - ')[0]?.trim();
  const name = label.split(' - ')[1]?.trim() || mssv;
  if (!mssv) return;

  const nowMs = Date.now();
  if (adminLastCheckinTime[mssv] && (nowMs - adminLastCheckinTime[mssv] < 12000)) {
    return; // Đã quét trong vòng 12 giây, bỏ qua để tránh spam
  }
  adminLastCheckinTime[mssv] = nowMs;

  // 1. Hiển thị Popup chúc mừng & âm thanh trên màn hình camera
  showAdminMatchPopup(name, mssv);
  playAdminBeep();

  // 2. Thêm vào danh sách vừa quét
  addAdminRecentScan(name, mssv);

  // 3. Kiểm tra xem có phiên nào đang mở không
  if (!currentSession || !currentSession.id) {
    toast('warn', 'Chưa có phiên mở', `Nhận diện: ${name} (${mssv}) thành công! (Vui lòng bấm 'Bắt đầu phiên' ở tab Điểm danh để lưu điểm danh)`);
    return;
  }

  // 4. LƯU VÀO SUPABASE & CẬP NHẬT TRẠNG THÁI
  const now = new Date();
  const nowIso = now.toISOString();
  const timeFormatted = fmtClock(now);

  const sessionStartMs = currentSession.started_at ? new Date(currentSession.started_at).getTime() : nowMs;
  const elapsedMin = (nowMs - sessionStartMs) / 60000;
  
  // Lấy ngưỡng đi muộn từ ô nhập người dùng (hoặc localStorage, mặc định 15 phút)
  const inputEl = document.getElementById('adminLateMinutesInput');
  const userLateSetting = inputEl ? parseInt(inputEl.value, 10) : parseInt(localStorage.getItem('admin_late_minutes') || '15', 10);
  const lateThresholdMin = (!isNaN(userLateSetting) && userLateSetting > 0)
    ? userLateSetting
    : ((currentSession.warn_before_min && currentSession.warn_before_min > 0) ? currentSession.warn_before_min : 15);

  const isLate = elapsedMin > lateThresholdMin;
  const targetStatus = isLate ? 'đi muộn' : 'có mặt';
  const lateMinRound = Math.round(elapsedMin);
  const checkinNote = isLate
    ? `Camera ESP32: Đi muộn (+${lateMinRound}p, sau mốc ${lateThresholdMin}p)`
    : 'Camera ESP32 điểm danh AI';

  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('kiosk_record_face_checkin', {
      p_session_id: String(currentSession.id),
      p_mssv: mssv,
      p_note: checkinNote
    });

    if (rpcErr) {
      await supabase.rpc('admin_set_status', {
        p_session_id: String(currentSession.id),
        p_mssv: mssv,
        p_status: targetStatus,
        p_reason: checkinNote
      });
    }

    // Cập nhật created_at của bảng attendance
    await supabase.from('attendance').update({
      created_at: nowIso,
      status: targetStatus,
      category: 'Khuôn mặt',
      note: checkinNote
    }).eq('session_id', currentSession.id).eq('mssv', mssv);
  } catch(e) {
    console.error('Lỗi lưu điểm danh:', e);
  }

  // 5. Cập nhật bảng điểm danh & KPI giao diện Admin ngay lập tức
  const prev = attendanceMap[mssv] || {};
  attendanceMap[mssv] = {
    ...prev,
    status: targetStatus,
    time: timeFormatted,
    editedAt: nowIso,
    category: prev.category || 'Khuôn mặt',
    note: checkinNote
  };
  renderAll();
  const statusLabel = isLate ? 'Đi muộn' : 'Có mặt';
  toast(isLate ? 'warn' : 'ok', isLate ? 'Điểm danh trễ' : 'Điểm danh thành công', `${name} (${mssv}) → ${statusLabel} (${timeFormatted})`);
}

// Hiển thị Card chúc mừng lớn
let adminMatchTimeout = null;
function showAdminMatchPopup(name, mssv) {
  const overlay = document.getElementById('adminMatchOverlay');
  const nameEl = document.getElementById('adminMatchName');
  const detailEl = document.getElementById('adminMatchDetail');
  const avatarEl = document.getElementById('adminMatchAvatar');

  if (!overlay) return;
  if (nameEl) nameEl.textContent = name;
  if (detailEl) detailEl.textContent = `MSSV: ${mssv} · ${new Date().toLocaleTimeString('vi-VN')}`;

  const st = (students || []).find(s => s.mssv === mssv);
  if (avatarEl) avatarEl.src = st?.avatar || `images/faces/${mssv}.png`;

  overlay.style.display = 'flex';
  clearTimeout(adminMatchTimeout);
  adminMatchTimeout = setTimeout(() => {
    overlay.style.display = 'none';
  }, 2200);
}

// Âm thanh Beep thông báo nhẹ nhàng
function playAdminBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}

// Thêm sinh viên vào danh sách quét gần nhất
function addAdminRecentScan(name, mssv) {
  const list = document.getElementById('adminRecentScansList');
  const empty = document.getElementById('adminRecentEmpty');
  const countEl = document.getElementById('adminScanCount');
  if (empty) empty.style.display = 'none';

  adminRecentScans.unshift({
    name, mssv,
    time: new Date().toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  });

  if (countEl) countEl.textContent = adminRecentScans.length;

  if (list) {
    const st = (students || []).find(s => s.mssv === mssv);
    const avatar = st?.avatar || `images/faces/${mssv}.png`;
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);animation:popInAdmin 0.2s ease-out;';
    item.innerHTML = `
      <img src="${avatar}" onerror="this.src='images/logo.png'" style="width:36px;height:36px;border-radius:8px;object-fit:cover;border:1.5px solid #22c55e;">
      <div style="min-width:0;flex:1;">
        <div style="font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</div>
        <div style="font-size:11px;color:var(--muted);">${escapeHtml(mssv)} · ${adminRecentScans[0].time}</div>
      </div>
      <span style="font-size:11px;font-weight:800;color:#22c55e;background:#dcfce7;padding:2px 8px;border-radius:4px;">✓ Có mặt</span>
    `;
    list.insertBefore(item, list.firstChild);
  }
}

function clearAdminRecentScans() {
  adminRecentScans = [];
  const list = document.getElementById('adminRecentScansList');
  const countEl = document.getElementById('adminScanCount');
  if (countEl) countEl.textContent = '0';
  if (list) {
    list.innerHTML = '<div id="adminRecentEmpty" style="text-align:center;padding:30px 10px;color:var(--muted);font-size:12px;font-style:italic;">Chưa có sinh viên nào quét qua camera ESP32.</div>';
  }
}

// ==========================================
// TÍNH NĂNG TOÀN MÀN HÌNH TẠI CHỖ (IN-PLACE FULLSCREEN - KHÔNG MỞ TAB MỚI)
// ==========================================
function toggleAdminFaceFullscreen() {
  const target = document.getElementById('view-face-cam');
  if (!target) return;
  if (!document.fullscreenElement) {
    if (target.requestFullscreen) {
      target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('btnAdminFaceFullscreen');
  const view = document.getElementById('view-face-cam');
  const isFull = !!document.fullscreenElement;
  if (btn) {
    btn.innerHTML = isFull ? '<span>🗗</span> Thu nhỏ' : '<span>⛶</span> Toàn màn hình';
  }
  if (view) {
    view.classList.toggle('is-fullscreen', isFull);
  }
});

// ==========================================
// BỘ QUẢN LÝ HUẤN LUYỆN KHUÔN MẶT 5 GÓC AI (ADMIN FACE ENROLL)
// Chụp trực tiếp từ Webcam hoặc ESP32-CAM và lưu Supabase student_face_data
// ==========================================

const ENROLL_SLOTS_DEF = [
  { id: 'front', label: 'Góc 1: Nhìn thẳng 0°', guide: 'Nhìn thẳng vào tâm camera, giữ nét mặt tự nhiên', target: (m) => m.yaw >= 0.85 && m.yaw <= 1.15 && m.eyeOpen && m.mouthNeutral, hint: 'Nhìn thẳng vào tâm camera...' },
  { id: 'left', label: 'Góc 2: Quay trái ~15°', guide: 'Quay nhẹ đầu sang TRÁI của bạn', target: (m) => m.yaw <= 0.82, hint: 'Quay thêm nhẹ sang TRÁI...' },
  { id: 'right', label: 'Góc 3: Quay phải ~15°', guide: 'Quay nhẹ đầu sang PHẢI của bạn', target: (m) => m.yaw >= 1.18, hint: 'Quay thêm nhẹ sang PHẢI...' },
  { id: 'tilt', label: 'Góc 4: Ngẩng / cúi ~10°', guide: 'Ngẩng hoặc cúi nhẹ đầu', target: (m) => (enrollBasePitch != null && Math.abs(m.pitch - enrollBasePitch) > 0.035) || m.pitch > 0.49 || m.pitch < 0.38, hint: 'Ngẩng hoặc cúi nhẹ đầu...' },
  { id: 'smile', label: 'Góc 5: Cười nhẹ', guide: 'Mỉm cười nhẹ, biểu cảm tự nhiên', target: (m) => (enrollBaseMar != null && m.mar >= enrollBaseMar * 1.15) || m.mar > 0.20, hint: 'Mỉm cười nhẹ...' }
];

let enrollSlots = [];
let enrollCurrentSlotIndex = 0;
let enrollCameraSource = 'webcam';
let enrollWebcamStream = null;
let enrollMirrored = true;
let enrollAutoSnap = true;
let enrollActiveMssv = '';
let enrollBasePitch = null;
let enrollBaseMar = null;
let enrollHoldFrames = 0;
let enrollDetectionActive = false;
let enrollLatestDetection = null;

const enrollCaptureCanvas = document.createElement('canvas');
const enrollCaptureCtx = enrollCaptureCanvas.getContext('2d', { willReadFrequently: true });

function resetEnrollSlots() {
  enrollSlots = ENROLL_SLOTS_DEF.map(s => ({
    id: s.id,
    label: s.label,
    guide: s.guide,
    done: false,
    descriptor: null,
    thumbnail: null
  }));
  enrollBasePitch = null;
  enrollBaseMar = null;
  enrollHoldFrames = 0;
  enrollCurrentSlotIndex = 0;
}

function renderEnrollSlots() {
  const container = document.getElementById('enrollSlotsContainer');
  const badge = document.getElementById('enrollSlotsCountBadge');
  const btnSave = document.getElementById('btnEnrollSaveServer');
  if (!container) return;

  let doneCount = 0;
  container.innerHTML = enrollSlots.map((s, idx) => {
    if (s.done) doneCount++;
    const isCurrent = (idx === enrollCurrentSlotIndex && !s.done);
    const thumbHtml = s.thumbnail?.url
      ? `<img src="${s.thumbnail.url}" style="width:42px;height:42px;border-radius:6px;object-fit:cover;border:1px solid var(--border);">`
      : `<div style="width:42px;height:42px;border-radius:6px;background:var(--surface-2);border:1px dashed var(--border);display:grid;place-items:center;font-size:10px;color:var(--muted);">Trống</div>`;

    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'};background:${isCurrent ? 'rgba(37,99,235,0.06)' : 'var(--surface-2)'};">
        ${thumbHtml}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.label)}</div>
            <span style="font-size:10.5px;font-weight:800;color:${s.done ? 'var(--ok)' : 'var(--muted)'};">${s.done ? '✓ Đã chụp' : 'Chưa'}</span>
          </div>
          <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.guide)}</div>
        </div>
        <div style="display:flex;gap:4px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="enrollManualCapture(${idx})" style="padding:3px 7px;font-size:11px;">
            ${s.done ? '🔄' : '📷'}
          </button>
          ${s.done ? `<button type="button" class="btn btn-danger btn-sm" onclick="enrollDeleteSlot(${idx})" style="padding:3px 6px;font-size:11px;">🗑</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (badge) badge.textContent = `${doneCount} / 5 đã chụp`;
  if (btnSave) btnSave.disabled = (doneCount < 1);

  const guideTitle = document.getElementById('enrollGuideTitle');
  const guideDesc = document.getElementById('enrollGuideDesc');
  if (enrollCurrentSlotIndex < 5 && enrollSlots[enrollCurrentSlotIndex]) {
    const cur = enrollSlots[enrollCurrentSlotIndex];
    if (guideTitle) guideTitle.textContent = cur.label;
    if (guideDesc) guideDesc.textContent = cur.guide;
  } else if (doneCount === 5) {
    if (guideTitle) guideTitle.textContent = '🎉 ĐÃ HOÀN TẤT ĐỦ 5 GÓC!';
    if (guideDesc) guideDesc.textContent = 'Bấm "Lưu vào Server" để hoàn thành và kích hoạt nhận diện AI.';
  }
}

async function openAdminFaceEnrollModal(targetMssv = '') {
  const modal = document.getElementById('adminFaceEnrollModal');
  if (!modal) return;

  const sel = document.getElementById('enrollStudentSelect');
  if (sel) {
    sel.innerHTML = '<option value="">-- Chọn sinh viên để huấn luyện --</option>' +
      (students || []).map(s => {
        const hasData = studentFaceDataMap.has(s.mssv);
        const icon = hasData ? '🟢' : '⚪';
        return `<option value="${escapeHtml(s.mssv)}">${icon} ${escapeHtml(s.mssv)} - ${escapeHtml(s.name)}</option>`;
      }).join('');
  }

  const pickMssv = targetMssv || (students && students.length > 0 ? students[0].mssv : '');
  if (sel && pickMssv) {
    sel.value = pickMssv;
  }

  modal.style.display = 'flex';
  await onEnrollStudentChange();
  await startEnrollCamera();
}

async function closeAdminFaceEnrollModal() {
  const modal = document.getElementById('adminFaceEnrollModal');
  if (modal) modal.style.display = 'none';
  stopEnrollCamera();
}

async function onEnrollStudentChange() {
  const sel = document.getElementById('enrollStudentSelect');
  const mssv = sel?.value || '';
  enrollActiveMssv = mssv;

  const avatar = document.getElementById('enrollStudentAvatar');
  const badge = document.getElementById('enrollStudentBadge');
  const btnDel = document.getElementById('btnEnrollDeleteServer');

  resetEnrollSlots();

  if (!mssv) {
    if (avatar) avatar.src = 'images/logo.png';
    if (badge) { badge.textContent = '⚪ Chưa chọn'; badge.style.color = 'var(--muted)'; }
    if (btnDel) btnDel.style.display = 'none';
    renderEnrollSlots();
    return;
  }

  const st = (students || []).find(s => s.mssv === mssv);
  if (avatar) avatar.src = st?.avatar || `images/faces/${mssv}.png`;

  try {
    const { data, error } = await supabase.from('student_face_data')
      .select('descriptors, thumbnails, updated_at')
      .eq('mssv', mssv)
      .maybeSingle();

    if (!error && data) {
      const descs = data.descriptors || [];
      const thumbs = data.thumbnails || [];
      enrollSlots.forEach((slot, i) => {
        if (descs[i]) { slot.descriptor = descs[i]; slot.done = true; }
        if (thumbs[i]) { slot.thumbnail = thumbs[i]; slot.done = true; }
      });
      if (enrollSlots.some(s => s.done)) {
        enrollBasePitch = 0.45;
        enrollBaseMar = 0.16;
      }
      const firstUndone = enrollSlots.findIndex(s => !s.done);
      enrollCurrentSlotIndex = (firstUndone !== -1) ? firstUndone : 5;

      const doneCount = enrollSlots.filter(s => s.done).length;
      if (badge) {
        badge.textContent = `🟢 ${doneCount}/5 góc đã lưu`;
        badge.style.color = 'var(--ok)';
      }
      if (btnDel) btnDel.style.display = doneCount > 0 ? 'inline-block' : 'none';
    } else {
      if (badge) {
        badge.textContent = '⚪ Chưa có dữ liệu';
        badge.style.color = 'var(--muted)';
      }
      if (btnDel) btnDel.style.display = 'none';
    }
  } catch(e) {
    console.warn('[onEnrollStudentChange]', e);
  }

  renderEnrollSlots();
}

function setEnrollCameraSource(source) {
  enrollCameraSource = source;
  const btnWebcam = document.getElementById('btnEnrollSrcWebcam');
  const btnEsp = document.getElementById('btnEnrollSrcEsp');

  if (source === 'webcam') {
    if (btnWebcam) { btnWebcam.style.background = 'var(--primary)'; btnWebcam.style.color = '#fff'; }
    if (btnEsp) { btnEsp.style.background = 'transparent'; btnEsp.style.color = 'var(--text)'; }
  } else {
    if (btnWebcam) { btnWebcam.style.background = 'transparent'; btnWebcam.style.color = 'var(--text)'; }
    if (btnEsp) { btnEsp.style.background = 'var(--primary)'; btnEsp.style.color = '#fff'; }
  }

  startEnrollCamera();
}

function toggleEnrollFlip() {
  enrollMirrored = !enrollMirrored;
  const video = document.getElementById('enrollVideo');
  const img = document.getElementById('enrollEspImg');
  const transform = enrollMirrored ? 'scaleX(-1)' : 'none';
  if (video) video.style.transform = transform;
  if (img) img.style.transform = transform;
}

function toggleEnrollAutoSnap() {
  enrollAutoSnap = !enrollAutoSnap;
  const btn = document.getElementById('btnEnrollAutoSnap');
  if (btn) {
    btn.textContent = enrollAutoSnap ? '⚡ Tự động: BẬT' : '👆 Thủ công: BẬT';
    btn.style.color = enrollAutoSnap ? 'var(--ok)' : 'var(--muted)';
  }
}

async function startEnrollCamera() {
  stopEnrollCamera();

  const video = document.getElementById('enrollVideo');
  const img = document.getElementById('enrollEspImg');
  const transform = enrollMirrored ? 'scaleX(-1)' : 'none';

  if (enrollCameraSource === 'webcam') {
    if (img) img.style.display = 'none';
    if (video) {
      video.style.display = 'block';
      video.style.transform = transform;
      try {
        enrollWebcamStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        video.srcObject = enrollWebcamStream;
        await video.play();
      } catch(err) {
        console.error('Lỗi mở webcam:', err);
        toast('warn', 'Không thể mở Webcam', 'Vui lòng kiểm tra quyền truy cập camera của trình duyệt.');
      }
    }
  } else {
    if (video) video.style.display = 'none';
    if (img) {
      const rawIp = document.getElementById('adminEspIpInput')?.value?.trim() || localStorage.getItem('esp_cam_ip') || '192.168.2.168';
      const streamUrl = formatEspStreamUrl(rawIp);
      img.style.display = 'block';
      img.style.transform = transform;
      img.src = streamUrl;
    }
  }

  enrollDetectionActive = true;
  runEnrollDetectionLoop();
}

function stopEnrollCamera() {
  enrollDetectionActive = false;
  if (enrollWebcamStream) {
    enrollWebcamStream.getTracks().forEach(t => t.stop());
    enrollWebcamStream = null;
  }
  const video = document.getElementById('enrollVideo');
  if (video) { video.srcObject = null; }
  const img = document.getElementById('enrollEspImg');
  if (img) { img.src = ''; }
}

function getEnrollMetrics(landmarks) {
  if (!landmarks) return null;
  const nose = landmarks.getNose();
  const jaw = landmarks.getJawOutline();
  const lEye = landmarks.getLeftEye();
  const rEye = landmarks.getRightEye();
  const mouth = landmarks.getMouth();

  let yaw = 1.0;
  if (nose && jaw && jaw.length >= 17) {
    const tip = nose[3] || nose[0];
    const dL = Math.hypot(tip.x - jaw[1].x, tip.y - jaw[1].y);
    const dR = Math.hypot(tip.x - jaw[15].x, tip.y - jaw[15].y);
    yaw = dR > 0.5 ? dL / dR : 1.0;
  }

  const calcEye = (eye) => {
    if (!eye || eye.length < 6) return 0.28;
    const a = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const b = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    const c = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return c > 1 ? (a + b) / (2.0 * c) : 0.28;
  };
  const ear = (calcEye(lEye) + calcEye(rEye)) / 2.0;

  let mar = 0.16;
  if (mouth && mouth.length >= 12) {
    const p0p6 = Math.hypot(mouth[0].x - mouth[6].x, mouth[0].y - mouth[6].y);
    if (p0p6 >= 1) {
      const a = Math.hypot(mouth[2].x - mouth[10].x, mouth[2].y - mouth[10].y);
      const b = Math.hypot(mouth[3].x - mouth[9].x, mouth[3].y - mouth[9].y);
      const c = Math.hypot(mouth[4].x - mouth[8].x, mouth[4].y - mouth[8].y);
      mar = (a + b + c) / (2.0 * p0p6);
    }
  }

  let pitch = 0.45;
  if (nose && jaw && jaw.length >= 9 && lEye && rEye) {
    const tip = nose[3] || nose[nose.length - 1];
    const eyeY = (lEye.reduce((s,p)=>s+p.y,0)/lEye.length + rEye.reduce((s,p)=>s+p.y,0)/rEye.length)/2;
    const chin = jaw[8];
    const span = Math.max(1, chin.y - eyeY);
    pitch = (tip.y - eyeY) / span;
  }

  return {
    yaw, ear, mar, pitch,
    eyeOpen: ear >= 0.16,
    mouthNeutral: mar <= 0.35
  };
}

async function runEnrollDetectionLoop() {
  const video = document.getElementById('enrollVideo');
  const img = document.getElementById('enrollEspImg');
  const canvas = document.getElementById('enrollCanvas');
  const holdBadge = document.getElementById('enrollHoldBadge');

  const pYaw = document.getElementById('enrollMetricYaw');
  const pPitch = document.getElementById('enrollMetricPitch');
  const pEar = document.getElementById('enrollMetricEar');
  const pMar = document.getElementById('enrollMetricMar');

  const step = async () => {
    if (!enrollDetectionActive) return;

    try {
      const isWebcam = (enrollCameraSource === 'webcam');
      const srcEl = isWebcam ? video : img;
      const hasFrame = srcEl && ((isWebcam && srcEl.readyState >= 2) || (!isWebcam && (srcEl.naturalWidth > 0 || srcEl.width > 0)));

      if (hasFrame && adminFaceModelsLoaded) {
        const w = srcEl.clientWidth || 480;
        const h = srcEl.clientHeight || 360;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        const natW = isWebcam ? (srcEl.videoWidth || 640) : (srcEl.naturalWidth || 640);
        const natH = isWebcam ? (srcEl.videoHeight || 480) : (srcEl.naturalHeight || 480);
        enrollCaptureCanvas.width = natW;
        enrollCaptureCanvas.height = natH;
        enrollCaptureCtx.drawImage(srcEl, 0, 0, natW, natH);

        const detection = await faceapi
          .detectSingleFace(enrollCaptureCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.25 }))
          .withFaceLandmarks(true)
          .withFaceDescriptor();

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detection) {
          enrollLatestDetection = detection;
          const resized = faceapi.resizeResults(detection, { width: w, height: h });
          const metrics = getEnrollMetrics(detection.landmarks);

          if (metrics) {
            if (pYaw) pYaw.textContent = `Yaw: ${metrics.yaw.toFixed(2)}`;
            if (pPitch) pPitch.textContent = `Pitch: ${metrics.pitch.toFixed(2)}`;
            if (pEar) pEar.textContent = `Mắt: ${metrics.ear.toFixed(2)}`;
            if (pMar) pMar.textContent = `Miệng: ${metrics.mar.toFixed(2)}`;
          }

          const box = resized.detection.box;
          let isTargetAngle = false;

          if (enrollCurrentSlotIndex < 5 && metrics) {
            const currentDef = ENROLL_SLOTS_DEF[enrollCurrentSlotIndex];
            isTargetAngle = currentDef.target(metrics);
          }

          ctx.save();
          if (enrollMirrored) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }

          ctx.strokeStyle = isTargetAngle ? '#22c55e' : '#38bdf8';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(box.x + box.width / 2, box.y + box.height / 2, box.width * 0.48, box.height * 0.58, 0, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();

          if (isTargetAngle && enrollCurrentSlotIndex < 5) {
            enrollHoldFrames++;
            if (holdBadge) {
              holdBadge.textContent = `${enrollHoldFrames}/8 frame`;
              holdBadge.style.background = 'rgba(34, 197, 94, 0.4)';
            }
            if (enrollHoldFrames >= 8 && enrollAutoSnap) {
              enrollHoldFrames = 0;
              await enrollApplyCapture(enrollCurrentSlotIndex, detection);
            }
          } else {
            enrollHoldFrames = Math.max(0, enrollHoldFrames - 1);
            if (holdBadge) {
              holdBadge.textContent = `${enrollHoldFrames}/8 frame`;
              holdBadge.style.background = 'rgba(255, 255, 255, 0.1)';
            }
          }
        } else {
          enrollLatestDetection = null;
          enrollHoldFrames = 0;
          if (holdBadge) holdBadge.textContent = 'Chưa thấy mặt';
        }
      }
    } catch(err) {}

    if (enrollDetectionActive) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

function cropEnrollThumbnailFromBox(box, srcCanvas) {
  const pad = 0.35;
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const size = Math.max(box.width, box.height) * (1 + pad);
  const sx = Math.max(0, cx - size / 2);
  const sy = Math.max(0, cy - size / 2);
  const sw = Math.min(size, w - sx);
  const sh = Math.min(size, h - sy);

  const tCanvas = document.createElement('canvas');
  tCanvas.width = 100;
  tCanvas.height = 100;
  const tCtx = tCanvas.getContext('2d');
  tCtx.fillStyle = '#ffffff';
  tCtx.fillRect(0, 0, 100, 100);
  tCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, 100, 100);
  return tCanvas.toDataURL('image/jpeg', 0.85);
}

async function enrollApplyCapture(slotIdx, detection) {
  if (!detection) return;
  const m = getEnrollMetrics(detection.landmarks);
  const thumbUrl = cropEnrollThumbnailFromBox(detection.detection.box, enrollCaptureCanvas);

  enrollSlots[slotIdx].done = true;
  enrollSlots[slotIdx].descriptor = Array.from(detection.descriptor);
  enrollSlots[slotIdx].thumbnail = { url: thumbUrl, label: enrollSlots[slotIdx].label };

  if (slotIdx === 0 && m) {
    enrollBasePitch = m.pitch;
    enrollBaseMar = m.mar;
  }

  playAdminBeep();
  renderEnrollSlots();

  const nextUndone = enrollSlots.findIndex((s, i) => i > slotIdx && !s.done);
  if (nextUndone !== -1) {
    enrollCurrentSlotIndex = nextUndone;
  } else {
    const anyUndone = enrollSlots.findIndex(s => !s.done);
    enrollCurrentSlotIndex = (anyUndone !== -1) ? anyUndone : 5;
  }

  renderEnrollSlots();
}

async function enrollSnapCurrent() {
  if (!enrollLatestDetection) {
    toast('warn', 'Chưa phát hiện khuôn mặt', 'Vui lòng đưa mặt vào khung hình camera.');
    return;
  }
  const targetIdx = (enrollCurrentSlotIndex < 5) ? enrollCurrentSlotIndex : 0;
  await enrollApplyCapture(targetIdx, enrollLatestDetection);
  toast('ok', 'Đã chụp', `Đã lưu ${enrollSlots[targetIdx].label}`);
}

async function enrollManualCapture(idx) {
  if (!enrollLatestDetection) {
    toast('warn', 'Chưa phát hiện khuôn mặt', 'Vui lòng đưa mặt vào khung hình camera để chụp.');
    return;
  }
  await enrollApplyCapture(idx, enrollLatestDetection);
  toast('ok', 'Đã chụp lại', `Đã cập nhật ${enrollSlots[idx].label}`);
}

function enrollDeleteSlot(idx) {
  enrollSlots[idx].done = false;
  enrollSlots[idx].descriptor = null;
  enrollSlots[idx].thumbnail = null;
  enrollCurrentSlotIndex = idx;
  renderEnrollSlots();
}

async function saveEnrollToServer() {
  if (!enrollActiveMssv) {
    toast('warn', 'Thiếu MSSV', 'Vui lòng chọn sinh viên cần lưu dữ liệu.');
    return;
  }

  const descriptors = enrollSlots.map(s => s.descriptor || null);
  const thumbnails = enrollSlots.map(s => s.thumbnail || null);
  const validDescs = descriptors.filter(Boolean);

  if (validDescs.length === 0) {
    toast('warn', 'Chưa có mẫu nào', 'Hãy chụp ít nhất 1 góc khuôn mặt.');
    return;
  }

  const btnSave = document.getElementById('btnEnrollSaveServer');
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = '⏳ Đang lưu...'; }

  try {
    const { error } = await supabase.from('student_face_data').upsert({
      mssv: enrollActiveMssv,
      descriptors: descriptors,
      thumbnails: thumbnails,
      updated_at: new Date().toISOString()
    }, { onConflict: 'mssv' });

    if (error) throw error;

    const st = (students || []).find(s => s.mssv === enrollActiveMssv);
    const label = `${enrollActiveMssv} - ${st ? st.name : enrollActiveMssv}`;
    let db = JSON.parse(localStorage.getItem('face_descriptors_db') || '{}');
    let tdb = JSON.parse(localStorage.getItem('face_thumbnails_db') || '{}');

    db[label] = validDescs;
    tdb[label] = thumbnails.filter(Boolean);
    localStorage.setItem('face_descriptors_db', JSON.stringify(db));
    localStorage.setItem('face_thumbnails_db', JSON.stringify(tdb));

    studentFaceDataMap.set(enrollActiveMssv, {
      count: validDescs.length,
      thumbnails: thumbnails.filter(Boolean),
      updated_at: new Date().toISOString()
    });

    reloadAdminFaceMatcher();
    renderStudentsTable();

    try {
      const bc = new BroadcastChannel('lh_attendance_sync');
      bc.postMessage({ type: 'face_descriptors_updated', mssv: enrollActiveMssv });
      bc.close();
    } catch(e) {}

    const badge = document.getElementById('enrollStudentBadge');
    if (badge) {
      badge.textContent = `🟢 ${validDescs.length}/5 góc đã lưu`;
      badge.style.color = 'var(--ok)';
    }
    const btnDel = document.getElementById('btnEnrollDeleteServer');
    if (btnDel) btnDel.style.display = 'inline-block';

    toast('ok', 'Đã lưu lên Server', `Đã lưu thành công ${validDescs.length}/5 góc mặt của ${label} lên Supabase.`);
  } catch(err) {
    console.error('Lỗi lưu mẫu mặt:', err);
    toast('err', 'Lỗi lưu Server', err.message);
  } finally {
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = '💾 Lưu vào Server (Supabase)'; }
  }
}

async function deleteEnrollStudentFromServer() {
  if (!enrollActiveMssv) return;
  const st = (students || []).find(s => s.mssv === enrollActiveMssv);
  const name = st ? st.name : enrollActiveMssv;

  if (!confirm(`Bạn có chắc muốn XÓA TOÀN BỘ dữ liệu khuôn mặt của ${name} (${enrollActiveMssv}) khỏi Server?`)) {
    return;
  }

  try {
    const { error } = await supabase.from('student_face_data').delete().eq('mssv', enrollActiveMssv);
    if (error) throw error;

    const label = `${enrollActiveMssv} - ${name}`;
    let db = JSON.parse(localStorage.getItem('face_descriptors_db') || '{}');
    let tdb = JSON.parse(localStorage.getItem('face_thumbnails_db') || '{}');
    delete db[label];
    delete tdb[label];
    localStorage.setItem('face_descriptors_db', JSON.stringify(db));
    localStorage.setItem('face_thumbnails_db', JSON.stringify(tdb));

    studentFaceDataMap.delete(enrollActiveMssv);
    reloadAdminFaceMatcher();
    renderStudentsTable();

    resetEnrollSlots();
    renderEnrollSlots();

    const badge = document.getElementById('enrollStudentBadge');
    if (badge) { badge.textContent = '⚪ Chưa có dữ liệu'; badge.style.color = 'var(--muted)'; }
    const btnDel = document.getElementById('btnEnrollDeleteServer');
    if (btnDel) btnDel.style.display = 'none';

    toast('ok', 'Đã xóa', `Đã xóa sạch dữ liệu khuôn mặt của ${name}.`);
  } catch(err) {
    toast('err', 'Lỗi xóa', err.message);
  }
}

// 7. LẮNG NGHE ĐỒNG BỘ BROADCAST CHANNEL (TỪ TAB FACE-KIOSK RIÊNG NẾU CÓ)
try {
  const syncChannel = new BroadcastChannel('lh_attendance_sync');
  syncChannel.onmessage = async (event) => {
    if (event.data && event.data.type === 'face_checkin') {
      const { mssv, name } = event.data;
      if (mssv) {
        const now = new Date();
        const prev = attendanceMap[mssv] || {};
        attendanceMap[mssv] = {
          ...prev,
          status: 'có mặt',
          time: fmtClock(now),
          editedAt: now.toISOString(),
          category: 'Khuôn mặt',
          note: 'Camera ESP32 điểm danh AI'
        };
        renderAll();
        addAdminRecentScan(name, mssv);
        toast('ok', 'SV vừa điểm danh (Camera)', `${name} (${mssv}) → Có mặt (${fmtClock(now)})`);
      }
    }
  };
} catch(e) {}
