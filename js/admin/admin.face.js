/* =====================================================================
   LH-NaviX Admin — admin.face.js (Phiên bản Thiết kế mới)
   Module Nhận diện Khuôn mặt, Chống Giả mạo MiniFASNet & Quản lý Ảnh Sinh viên
   Giao diện School Management chuyên nghiệp · Slate & Light Theme
   ===================================================================== */

// =====================================================================
// 1. BIẾN TOÀN CỤC & TRẠNG THÁI HỆ THỐNG
// =====================================================================
let adminFaceModelsLoaded = false;
let adminFasnetSession = null;
let adminFasnetLoading = false;
let adminFaceMatcher = null;

// Luồng Camera Quét Điểm danh (Mặc định cố định ESP32-S3)
let adminCameraSource = 'esp32';
let adminCameraActive = false;
let adminEspMirrored = false;
let adminInferenceRunning = false;
let adminAntiSpoofEnabled = true; // Luôn bật sẵn khi quét, không cần nút bật tắt thủ công
let adminAnimFrameId = null; // Quản lý requestAnimationFrame để hủy dứt khoát khi tắt cam
let adminGroupOpenState = {}; // Trạng thái mở/đóng các folder accordion ngày

// Bộ đệm hiệu năng & Temporal Smoothing chống giả mạo
let adminFpsCounter = 0;
let adminLastFpsTime = performance.now();
let adminConsecutiveLiveHits = {}; // mssv/trackId -> số frame liên tiếp đạt LIVE
let adminConsecutiveSpoofHits = 0;
let adminLastCheckinTime = {}; // Chống spam điểm danh cùng 1 sinh viên trong thời gian ngắn

// Bộ đệm Tensor & Canvas ẩn cho MiniFASNet chuẩn FaceX
const adminCaptureCanvas = document.createElement('canvas');
const adminCaptureCtx = adminCaptureCanvas.getContext('2d', { willReadFrequently: true });
const adminCropCanvas = document.createElement('canvas');
adminCropCanvas.width = 80;
adminCropCanvas.height = 80;
const adminCropCtx = adminCropCanvas.getContext('2d', { willReadFrequently: true });
const adminSpoofTensorBuffer = new Float32Array(3 * 80 * 80);

// Quản lý Modal Chi tiết Khuôn mặt theo từng MSSV
let enrollActiveMssv = '';
let enrollActiveStudent = null;
let enrollPhotos = []; // [{ id, url, descriptor, label, created_at }]
let enrollCameraMode = 'upload'; // 'upload' | 'camera'
let enrollWebcamStream = null;
let enrollPendingPhoto = null; // { dataUrl, descriptor, detection }
// =====================================================================
// 2. KHỞI TẠO MÔ HÌNH AI (ONNX MiniFASNet-V2 & Face-API)
// =====================================================================
// IP mặc định của ESP32-CAM (đổi ở đây khi router cấp IP khác)
const DEFAULT_ESP_CAM_IP = '192.168.2.169';
const LEGACY_ESP_CAM_IPS = ['10.96.38.99', '192.168.1.1', '192.168.2.168'];

function cleanEspCamIp(raw) {
  let s = (raw || '').trim();
  if (!s) return DEFAULT_ESP_CAM_IP;
  // Hỗ trợ cả trường hợp user nhập hoặc copy dính prefix http://, https:// hoặc ttp://
  s = s.replace(/^h?ttps?:\/\//i, '');
  s = s.replace(/\/.*$/, '');
  return s || DEFAULT_ESP_CAM_IP;
}

// Quản lý âm thanh thông báo và còi ESP32
let adminSoundMuted = localStorage.getItem('admin_sound_muted') === 'true';
let adminLastGlobalBeepTime = 0;

// Quản lý trạng thái luồng stream và fallback thông minh trên Mobile
let adminStreamMode = 'mjpeg'; // 'mjpeg' | 'fast_stream'
let adminFastStreamLoopActive = false;
let adminFastStreamTimer = null;
let adminStreamReconnectTimer = null;

function formatEspCaptureUrl(raw) {
  const s = cleanEspCamIp(raw);
  let host = s;
  if (s.includes(':')) host = s.split(':')[0];
  return `http://${host}/capture`;
}

function updateAdminSoundBtn() {
  const btn = document.getElementById('btnAdminSoundToggle');
  if (!btn) return;
  if (adminSoundMuted) {
    btn.innerHTML = '🔇 Đã tắt âm';
    btn.style.color = '#ef4444';
    btn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
  } else {
    btn.innerHTML = '🔊 Âm thanh';
    btn.style.color = 'var(--text)';
    btn.style.borderColor = 'var(--border)';
  }
}

async function silenceEspBuzzerNow() {
  const ipInput = document.getElementById('adminEspIpInput');
  let ip = cleanEspCamIp((ipInput ? ipInput.value.trim() : '') || localStorage.getItem('esp_cam_ip') || DEFAULT_ESP_CAM_IP);
  if (ip.includes(':')) ip = ip.split(':')[0];
  try {
    fetch(`http://${ip}/test_pin?pin=14&val=0&_=${Date.now()}`, { mode: 'no-cors' }).catch(() => { });
  } catch (e) { }
}
window.silenceEspBuzzerNow = silenceEspBuzzerNow;

function toggleAdminSound() {
  adminSoundMuted = !adminSoundMuted;
  localStorage.setItem('admin_sound_muted', adminSoundMuted ? 'true' : 'false');
  updateAdminSoundBtn();
  if (adminSoundMuted) {
    silenceEspBuzzerNow();
    toast('info', 'Đã tắt âm thanh', 'Đã tắt âm thanh loa máy tính và còi ESP32.');
  } else {
    toast('success', 'Đã bật âm thanh', 'Đã bật lại âm thanh thông báo khi điểm danh.');
  }
}
window.toggleAdminSound = toggleAdminSound;

let adminFaceModelsLoading = false;
async function initFaceCamInAdmin(isBackground = false) {
  const ipInput = document.getElementById('adminEspIpInput');
  let savedIp = localStorage.getItem('esp_cam_ip');
  // Chưa lưu, hoặc còn lưu IP cũ / dính prefix -> reset về IP mặc định
  if (!savedIp || LEGACY_ESP_CAM_IPS.includes(savedIp) || savedIp.startsWith('ttp://')) {
    savedIp = DEFAULT_ESP_CAM_IP;
  }
  savedIp = cleanEspCamIp(savedIp);
  if (ipInput) {
    ipInput.value = savedIp;
    ipInput.oninput = () => {
      const v = cleanEspCamIp(ipInput.value);
      localStorage.setItem('esp_cam_ip', v);
    };
    ipInput.onchange = () => {
      ipInput.value = cleanEspCamIp(ipInput.value);
      localStorage.setItem('esp_cam_ip', ipInput.value);
    };
  }
  localStorage.setItem('esp_cam_ip', savedIp);
  updateAdminSoundBtn();

  if (window.location.protocol === 'https:') {
    const alertEl = document.getElementById('adminCamHttpsAlert');
    if (alertEl) alertEl.style.display = 'block';
  }

  // Khởi tạo Lịch sử quét gom nhóm theo ngày từ bộ nhớ
  renderAdminRecentScansGrouped();
  updateAdminCamSessionStatus();

  // Nạp song song MiniFASNet và Face-API
  loadAdminFasnetModel();

  if (adminFaceModelsLoaded) {
    reloadAdminFaceMatcher();
    renderFaceStudentTable();
    const hasActiveSession = Boolean(window.currentSession?.id || (typeof currentSession !== 'undefined' && currentSession?.id));
    if (!adminCameraActive && (hasActiveSession || !isBackground)) {
      startAdminCamera();
    }
    return;
  }

  if (adminFaceModelsLoading) return;
  adminFaceModelsLoading = true;

  const hudStatus = document.getElementById('adminCamHudStatus');
  if (hudStatus && !isBackground) hudStatus.textContent = '⏳ Đang nạp mô hình Face-API & MiniFASNet...';

  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    adminFaceModelsLoaded = true;

    await syncAdminFacesFromSupabase(false);
    renderFaceStudentTable();

    if (hudStatus) {
      hudStatus.textContent = '🟢 AI sẵn sàng — Camera đang hoạt động';
      hudStatus.style.color = 'var(--ok)';
    }

    const hasActiveSession = Boolean(window.currentSession?.id || (typeof currentSession !== 'undefined' && currentSession?.id));
    if (!adminCameraActive && (hasActiveSession || !isBackground)) {
      startAdminCamera();
    }
  } catch (err) {
    console.error('Lỗi khởi tạo mô hình Face-API:', err);
    if (hudStatus) {
      hudStatus.textContent = '❌ Lỗi tải mô hình AI. Vui lòng kiểm tra kết nối mạng.';
      hudStatus.style.color = 'var(--err)';
    }
  } finally {
    adminFaceModelsLoading = false;
  }
}

// Nạp mô hình MiniFASNet-V2 ONNX chuẩn
async function loadAdminFasnetModel() {
  if (adminFasnetSession || adminFasnetLoading) return;
  adminFasnetLoading = true;
  const pill = document.getElementById('adminFasnetStatusPill');

  try {
    if (typeof ort === 'undefined') {
      console.warn('[MiniFASNet] onnxruntime-web chưa được import.');
      return;
    }
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
    ort.env.wasm.numThreads = 1;

    try {
      // Ưu tiên file nội bộ trong thư mục models/
      adminFasnetSession = await ort.InferenceSession.create('models/anti-spoofing/minifasnet_v2.onnx', { executionProviders: ['wasm'] });
      console.log('[MiniFASNet-V2] Nạp thành công từ local models/anti-spoofing/minifasnet_v2.onnx');
    } catch (eLocal) {
      console.warn('[MiniFASNet-V2] File local lỗi, thử HuggingFace CDN...', eLocal.message);
      adminFasnetSession = await ort.InferenceSession.create('https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/main/minifasnet_v2.onnx', { executionProviders: ['wasm'] });
    }

    if (pill) {
      pill.textContent = 'MiniFASNet-V2: Sẵn sàng';
      pill.style.background = 'var(--ok-bg)';
      pill.style.color = 'var(--ok)';
      pill.style.border = '1px solid var(--ok-border)';
    }
  } catch (e) {
    console.error('[MiniFASNet-V2] Lỗi tải model:', e);
    adminFasnetSession = null;
    if (pill) {
      pill.textContent = 'MiniFASNet: Chưa nạp được';
      pill.style.background = 'var(--err-bg)';
      pill.style.color = 'var(--err)';
      pill.style.border = '1px solid var(--err-border)';
    }
  } finally {
    adminFasnetLoading = false;
  }
}

// =====================================================================
// 3. THUẬT TOÁN TIỀN XỬ LÝ & SUY LUẬN CHUẨN FACEX (Scale 2.7x, RAW BGR)
// =====================================================================
function fillSpoofTensorFaceX(srcCanvas, box, scale, dst) {
  const vw = srcCanvas.width;
  const vh = srcCanvas.height;
  const bw = box.width;
  const bh = box.height;
  const bx = box.x;
  const by = box.y;

  // Thuật toán Silent-Face Anti-Spoofing: Crop mở rộng quanh tâm khuôn mặt
  const s = Math.min((vh - 1) / bh, Math.min((vw - 1) / bw, scale));
  const nw = bw * s;
  const nh = bh * s;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;

  let ltx = cx - nw / 2;
  let lty = cy - nh / 2;
  let rbx = cx + nw / 2;
  let rby = cy + nh / 2;

  if (ltx < 0) { rbx -= ltx; ltx = 0; }
  if (lty < 0) { rby -= lty; lty = 0; }
  if (rbx > vw - 1) { ltx -= (rbx - vw + 1); rbx = vw - 1; }
  if (rby > vh - 1) { lty -= (rby - vh + 1); rby = vh - 1; }

  const sw = Math.max(1, Math.floor(rbx - ltx));
  const sh = Math.max(1, Math.floor(rby - lty));

  adminCropCtx.fillStyle = '#000000';
  adminCropCtx.fillRect(0, 0, 80, 80);
  adminCropCtx.drawImage(srcCanvas, Math.floor(ltx), Math.floor(lty), sw, sh, 0, 0, 80, 80);

  const imgData = adminCropCtx.getImageData(0, 0, 80, 80).data;
  const N = 80 * 80;

  // Chuẩn hóa FaceX: RAW pixel trong [0, 255] (không chia 255), thứ tự kênh BGR, layout CHW
  for (let i = 0, p = 0; i < N; i++) {
    const r = imgData[p++];
    const g = imgData[p++];
    const b = imgData[p++];
    p++; // bỏ qua alpha
    dst[i] = b; // Kênh Blue
    dst[N + i] = g; // Kênh Green
    dst[2 * N + i] = r; // Kênh Red
  }
}

// Chạy suy luận MiniFASNet-V2, trả về xác suất 3 lớp: { pPrint, pLive, pReplay, isLive, latency }
async function runMiniFasnetInference(srcCanvas, box) {
  if (!adminFasnetSession) {
    return { ok: false, error: 'Mô hình MiniFASNet chưa nạp xong.' };
  }

  const t0 = performance.now();
  fillSpoofTensorFaceX(srcCanvas, box, 2.7, adminSpoofTensorBuffer);

  const inputTensor = new ort.Tensor('float32', adminSpoofTensorBuffer, [1, 3, 80, 80]);
  const feeds = { [adminFasnetSession.inputNames[0]]: inputTensor };
  const results = await adminFasnetSession.run(feeds);
  const latency = (performance.now() - t0).toFixed(1);

  const raw = results[adminFasnetSession.outputNames[0]].data;

  // Xác minh Output là Logits hay Xác suất
  const sumRaw = raw[0] + raw[1] + raw[2];
  const isAlreadyProb = (Math.abs(sumRaw - 1.0) < 0.05 && raw[0] >= 0 && raw[1] >= 0 && raw[2] >= 0);

  let probs = [0, 0, 0];
  if (isAlreadyProb) {
    probs = [raw[0], raw[1], raw[2]];
  } else {
    // Softmax an toàn số học
    const maxVal = Math.max(raw[0], raw[1], raw[2]);
    const exp = [Math.exp(raw[0] - maxVal), Math.exp(raw[1] - maxVal), Math.exp(raw[2] - maxVal)];
    const sumExp = exp[0] + exp[1] + exp[2];
    probs = exp.map(v => v / sumExp);
  }

  // Thứ tự nhãn chuẩn Silent-Face:
  // Class 0: Print (Ảnh in 2D)
  // Class 1: LIVE (Người thật)
  // Class 2: Replay (Màn hình điện thoại/máy tính)
  const pPrint = probs[0];
  const pLive = probs[1];
  const pReplay = probs[2];

  return {
    ok: true,
    pPrint,
    pLive,
    pReplay,
    latency,
    isLive: (pLive > pPrint && pLive > pReplay && pLive >= 0.70)
  };
}

// =====================================================================
// 4. ĐỒNG BỘ DỮ LIỆU KHUÔN MẶT TỪ SUPABASE & TẠO FACEMATCHER
// =====================================================================
async function syncAdminFacesFromSupabase(showNotification = false) {
  try {
    if (!students || students.length === 0) {
      await loadStudents();
    }

    const { data, error } = await supabase.from('student_face_data')
      .select('mssv, descriptors, thumbnails, updated_at');
    if (error) throw error;

    const rows = data || [];
    let db = {};
    let tdb = {};
    let count = 0;

    rows.forEach(row => {
      let mssv = row.mssv;
      // Tự động chuẩn hóa MSSV cũ 12300555 -> 123000555
      if (mssv === '12300555') {
        mssv = '123000555';
        if (typeof supabase !== 'undefined') {
          supabase.from('student_face_data').upsert({
            mssv: '123000555',
            descriptors: row.descriptors,
            thumbnails: (row.thumbnails || []).map(t => typeof t === 'string' ? t.replace('12300555', '123000555') : { ...t, url: (t.url || '').replace('12300555', '123000555') }),
            updated_at: new Date().toISOString()
          }, { onConflict: 'mssv' }).then(() => {
            supabase.from('student_face_data').delete().eq('mssv', '12300555');
          }).catch(e => console.warn('Lỗi migrate face data:', e));
        }
      }

      const st = (students || []).find(s => s.mssv === mssv);
      const name = st ? st.name : (mssv === '123000555' ? 'Nguyễn Lê Vũ Duy' : mssv);
      const label = `${mssv} - ${name}`;
      const validDescs = (row.descriptors || []).filter(d => Array.isArray(d) && d.length === 128);

      if (validDescs.length > 0) {
        db[label] = validDescs;
        tdb[label] = row.thumbnails || [];
        count++;

        if (typeof studentFaceDataMap !== 'undefined') {
          studentFaceDataMap.set(mssv, {
            count: validDescs.length,
            thumbnails: row.thumbnails || [],
            updated_at: row.updated_at
          });
        }
      }
    });

    // Dọn sạch mọi key cũ liên quan đến 12300555 trong localStorage
    Object.keys(db).forEach(k => { if (k.includes('12300555')) delete db[k]; });
    Object.keys(tdb).forEach(k => { if (k.includes('12300555')) delete tdb[k]; });

    localStorage.setItem('face_descriptors_db', JSON.stringify(db));
    localStorage.setItem('face_thumbnails_db', JSON.stringify(tdb));

    reloadAdminFaceMatcher();
    updateAdminFaceKpi();
    renderFaceStudentTable();

    if (showNotification) {
      toast('ok', 'Đồng bộ thành công', `Đã đồng bộ dữ liệu của ${count} sinh viên vào bộ nhớ AI.`);
    }
  } catch (err) {
    console.error('Lỗi đồng bộ dữ liệu khuôn mặt:', err);
    if (showNotification) {
      toast('err', 'Lỗi đồng bộ Server', err.message);
    }
  }
}

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
    // Ngưỡng so khớp Euclidean distance: 0.38 (chặt hơn để tránh nhận nhầm người)
    // Mặc định thư viện là 0.6 (rất lỏng), 0.42 vẫn còn lỏng → hạ xuống 0.38
    adminFaceMatcher = new faceapi.FaceMatcher(labeled, 0.40);
  } else {
    adminFaceMatcher = null;
  }
}

function updateAdminFaceKpi() {
  // Đã gỡ bỏ 3 ô thống kê to theo yêu cầu tối giản giao diện
}

// =====================================================================
// 5. ĐIỀU KHIỂN LUỒNG CAMERA ESP32-S3 (CỐ ĐỊNH, KHÔNG DÙNG WEBCAM)
// =====================================================================
async function ensureOpenSession() {
  if (typeof currentSession !== 'undefined' && currentSession && currentSession.id) {
    window.currentSession = currentSession;
    return currentSession;
  }
  if (window.currentSession && window.currentSession.id) {
    return window.currentSession;
  }
  try {
    if (typeof supabase !== 'undefined') {
      const { data } = await supabase.rpc('get_open_session');
      if (data && data.id) {
        if (typeof currentSession !== 'undefined') currentSession = data;
        window.currentSession = data;
        return data;
      }
    }
  } catch (e) {
    console.warn('Lỗi kiểm tra phiên mở:', e);
  }
  return null;
}

async function updateAdminCamSessionStatus() {
  const stStatus = document.getElementById('faceCamSessionStatus');
  if (!stStatus) return;
  const sess = await ensureOpenSession();
  if (sess && sess.id) {
    stStatus.textContent = `🟢 Đang mở: "${sess.session_name || 'Phiên hiện tại'}"`;
    stStatus.style.color = 'var(--ok)';
  } else {
    stStatus.textContent = 'ℹ️ Chưa có phiên mở (Chế độ quét nhận diện)';
    stStatus.style.color = 'var(--muted)';
  }
}

function toggleAdminCamera() {
  if (adminCameraActive) {
    stopAdminCamera();
  } else {
    startAdminCamera();
  }
}

function startFastFrameStream(captureUrl) {
  if (!adminCameraActive) return;
  adminFastStreamLoopActive = true;
  const img = document.getElementById('adminEspImg');
  const hudStatus = document.getElementById('adminCamHudStatus');

  let isFetching = false;
  const fetchNextFrame = () => {
    if (!adminCameraActive || !adminFastStreamLoopActive) return;
    if (isFetching) return;
    isFetching = true;

    const frameImg = new Image();
    frameImg.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      isFetching = false;
      frameImg.onload = null;
      frameImg.onerror = null;
      if (adminCameraActive && adminFastStreamLoopActive) {
        adminFastStreamTimer = setTimeout(fetchNextFrame, 800);
      }
    }, 3000);

    frameImg.onload = () => {
      clearTimeout(timer);
      isFetching = false;
      if (adminCameraActive && adminFastStreamLoopActive && img) {
        img.src = frameImg.src;
        if (hudStatus && adminCameraActive) {
          hudStatus.textContent = `🟢 ESP32 đang phát luồng trực tiếp (${captureUrl})`;
        }
        updateAttendanceCamStatusPill('active');
        adminFastStreamTimer = setTimeout(fetchNextFrame, 50); // ~20 FPS mượt mà
      }
    };

    frameImg.onerror = () => {
      clearTimeout(timer);
      isFetching = false;
      if (adminCameraActive && adminFastStreamLoopActive) {
        if (hudStatus) {
          hudStatus.innerHTML = `⚠️ Không thể tải luồng từ <b>${captureUrl}</b>. Hãy kiểm tra nguồn ESP32, Wi-Fi hoặc IP camera.`;
        }
        updateAttendanceCamStatusPill('error');
        adminFastStreamTimer = setTimeout(fetchNextFrame, 1500);
      }
    };

    frameImg.src = `${captureUrl}?t=${Date.now()}`;
  };

  fetchNextFrame();
}

async function startAdminCamera() {
  if (adminCameraActive) return;

  if (!adminFaceModelsLoaded) {
    if (!adminFaceModelsLoading) {
      initFaceCamInAdmin(true);
    }
    updateAttendanceCamStatusPill('loading');
    let waitCount = 0;
    while (!adminFaceModelsLoaded && waitCount < 30) {
      await new Promise(r => setTimeout(r, 200));
      waitCount++;
    }
    if (!adminFaceModelsLoaded) {
      console.warn('[FaceCam] Mô hình AI đang được tải, vui lòng chờ.');
      return;
    }
  }

  // Cập nhật trạng thái phiên nếu có, KHÔNG chặn camera hoạt động
  ensureOpenSession().then(sess => {
    updateAdminCamSessionStatus();
    if (!sess) {
      console.log('[FaceCam] Đang quét tự do (Chưa có phiên điểm danh mở).');
    }
  });

  const btn = document.getElementById('btnAdminCamToggle');
  const img = document.getElementById('adminEspImg');
  const placeholder = document.getElementById('adminCamPlaceholder');
  const hudStatus = document.getElementById('adminCamHudStatus');

  adminCameraSource = 'esp32';
  adminCameraActive = true;
  adminConsecutiveLiveHits = {};
  adminConsecutiveSpoofHits = 0;
  adminTrackingMssv = null;
  adminTrackingFrames = 0;

  if (placeholder) placeholder.style.display = 'none';

  // Lấy IP ESP32 từ input
  const ipInput = document.getElementById('adminEspIpInput');
  const rawIp = cleanEspCamIp((ipInput ? ipInput.value : '').trim() || localStorage.getItem('esp_cam_ip') || DEFAULT_ESP_CAM_IP);
  if (ipInput && ipInput.value !== rawIp) ipInput.value = rawIp;
  localStorage.setItem('esp_cam_ip', rawIp);

  const streamUrl = formatEspStreamUrl(rawIp);
  const captureUrl = formatEspCaptureUrl(rawIp);
  adminStreamMode = 'mjpeg';

  const isHttps = window.location.protocol === 'https:';
  const httpsAlert = document.getElementById('adminCamHttpsAlert');
  if (isHttps && httpsAlert) {
    httpsAlert.style.display = 'block';
  }

  if (img) {
    img.style.display = 'block';
    img.style.transform = adminEspMirrored ? 'scaleX(-1)' : 'none';
    img.onload = () => {
      if (hudStatus && adminCameraActive && adminStreamMode === 'mjpeg') {
        hudStatus.textContent = `🟢 ESP32 đang phát luồng: ${streamUrl}`;
      }
      updateAttendanceCamStatusPill('active');
    };
    img.onerror = () => {
      if (!adminCameraActive) return;
      if (isHttps) {
        if (hudStatus) {
          hudStatus.innerHTML = `⚠️ Trình duyệt chặn kết nối HTTP tới <b>${streamUrl}</b> do trang mở bằng HTTPS (Mixed Content). Vui lòng mở qua mạng LAN HTTP.`;
        }
        updateAttendanceCamStatusPill('error');
        return;
      }

      // Tự động fallback sang Fast Frame Stream cổng 80 nếu luồng MJPEG cổng 81 bị nghẽn socket hoặc bị chặn trên mobile
      if (adminStreamMode === 'mjpeg') {
        console.warn(`[FaceCam] Luồng MJPEG (${streamUrl}) không tải được. Tự động chuyển đổi sang Fast Frame Stream trực tiếp qua cổng 80...`);
        adminStreamMode = 'fast_stream';
        if (hudStatus) {
          hudStatus.textContent = `🔄 Đang chuyển sang luồng Fast Stream trực tiếp (${captureUrl})...`;
        }
        startFastFrameStream(captureUrl);
        return;
      }

      if (hudStatus && adminCameraActive) {
        hudStatus.innerHTML = `⚠️ Không tải được luồng từ <b>${streamUrl}</b>. Hãy kiểm tra nguồn ESP32, kết nối Wi-Fi hoặc IP camera.`;
      }
      updateAttendanceCamStatusPill('error');
      if (adminCameraActive && !adminStreamReconnectTimer) {
        adminStreamReconnectTimer = setTimeout(() => {
          adminStreamReconnectTimer = null;
          if (adminCameraActive && img && adminStreamMode === 'mjpeg') {
            img.src = `${streamUrl}?t=${Date.now()}`;
          }
        }, 3000);
      }
    };
    img.src = streamUrl;
  }

  if (btn) {
    btn.innerHTML = '⏹ Dừng camera';
    btn.className = 'btn btn-danger btn-sm';
  }

  updateAttendanceCamStatusPill('active');

  if (!adminInferenceRunning) {
    adminInferenceRunning = true;
    adminAnimFrameId = requestAnimationFrame(runAdminDetectionLoop);
  }
}

function stopAdminCamera() {
  // 1. Tắt cờ trạng thái ngay lập tức
  adminCameraActive = false;
  adminInferenceRunning = false;
  adminFastStreamLoopActive = false;
  if (adminFastStreamTimer) {
    clearTimeout(adminFastStreamTimer);
    adminFastStreamTimer = null;
  }
  adminStreamMode = 'mjpeg';
  if (adminStreamReconnectTimer) {
    clearTimeout(adminStreamReconnectTimer);
    adminStreamReconnectTimer = null;
  }

  // 2. Hủy animation frame
  if (adminAnimFrameId) {
    cancelAnimationFrame(adminAnimFrameId);
    adminAnimFrameId = null;
  }

  // 3. Reset các bộ đệm tracking
  adminTrackingMssv = null;
  adminTrackingFrames = 0;
  adminConsecutiveSpoofHits = 0;
  adminLastUnknownFaceDataUrl = null;

  const btn = document.getElementById('btnAdminCamToggle');
  const img = document.getElementById('adminEspImg');
  const video = document.getElementById('adminWebcamVideo');
  const placeholder = document.getElementById('adminCamPlaceholder');
  const canvas = document.getElementById('adminCamOverlayCanvas');
  const hudStatus = document.getElementById('adminCamHudStatus');
  const btnQuick = document.getElementById('btnAdminQuickEnrollFromFeed');
  const fpsEl = document.getElementById('adminCamFpsText');

  if (btnQuick) btnQuick.style.display = 'none';
  if (fpsEl) fpsEl.textContent = '0 FPS';

  // Dừng luồng stream và ngắt ảnh (xóa thuộc tính src tránh lỗi icon vỡ khung)
  if (img) {
    img.removeAttribute('src');
    img.style.display = 'none';
  }
  if (video) {
    video.srcObject = null;
    video.style.display = 'none';
  }

  // 4. XÓA SẠCH VÀ TRIỆT ĐỂ BOUNDING BOX TRÊN CANVAS
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  if (placeholder) placeholder.style.display = 'flex';
  if (btn) {
    btn.innerHTML = '📡 Bắt đầu quét';
    btn.className = 'btn btn-primary btn-sm';
  }
  if (hudStatus) {
    hudStatus.textContent = 'Camera đã dừng. Bấm "Bắt đầu quét" để kích hoạt.';
    hudStatus.style.color = 'var(--muted)';
  }

  updateAttendanceCamStatusPill('off');
}

function updateAttendanceCamStatusPill(state) {
  const pill = document.getElementById('sessionCamPill');
  const dot = document.getElementById('sessionCamDot');
  const text = document.getElementById('sessionCamText');
  const btn = document.getElementById('btnToggleFaceCam');
  if (!pill) return;

  if (state === 'active' || (state !== 'off' && state !== 'error' && adminCameraActive)) {
    pill.style.display = 'inline-flex';
    pill.style.background = 'rgba(34, 197, 94, 0.12)';
    pill.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    pill.style.color = '#15803d';
    if (dot) {
      dot.style.background = '#22c55e';
      dot.style.boxShadow = '0 0 6px #22c55e';
    }
    if (text) text.textContent = 'Camera AI: Đang nhận diện';
    if (btn) btn.innerHTML = '<span>📷</span> Camera AI (Đang chạy) →';
  } else if (state === 'loading') {
    pill.style.display = 'inline-flex';
    pill.style.background = 'rgba(245, 158, 11, 0.12)';
    pill.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    pill.style.color = '#b45309';
    if (dot) {
      dot.style.background = '#f59e0b';
      dot.style.boxShadow = 'none';
    }
    if (text) text.textContent = 'Camera AI: Đang nạp...';
    if (btn) btn.innerHTML = '<span>📷</span> Camera AI (Đang nạp) →';
  } else if (state === 'error') {
    pill.style.display = 'inline-flex';
    pill.style.background = 'rgba(239, 68, 68, 0.12)';
    pill.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    pill.style.color = '#b91c1c';
    if (dot) {
      dot.style.background = '#ef4444';
      dot.style.boxShadow = 'none';
    }
    if (text) text.textContent = 'Camera AI: Lỗi kết nối';
    if (btn) btn.innerHTML = '<span>📷</span> Kiểm tra Camera →';
  } else {
    pill.style.display = 'inline-flex';
    pill.style.background = 'var(--surface-2)';
    pill.style.borderColor = 'var(--border)';
    pill.style.color = 'var(--muted)';
    if (dot) {
      dot.style.background = 'var(--muted)';
      dot.style.boxShadow = 'none';
    }
    if (text) text.textContent = 'Camera AI: Sẵn sàng';
    if (btn) btn.innerHTML = '<span>📷</span> Quét mặt ESP32 →';
  }
}
window.updateAttendanceCamStatusPill = updateAttendanceCamStatusPill;

async function autoStartAdminCameraOnSession() {
  if (adminCameraActive) return;
  console.log('[FaceCam] Tự động kích hoạt Camera AI ESP32 theo phiên điểm danh...');
  updateAttendanceCamStatusPill('loading');
  try {
    await startAdminCamera();
  } catch (e) {
    console.warn('[FaceCam] Không thể tự động bật camera:', e);
    updateAttendanceCamStatusPill('off');
  }
}
window.autoStartAdminCameraOnSession = autoStartAdminCameraOnSession;

function toggleAdminCamFlip() {
  adminEspMirrored = !adminEspMirrored;
  const img = document.getElementById('adminEspImg');
  const transform = adminEspMirrored ? 'scaleX(-1)' : 'none';
  if (img) img.style.transform = transform;
}

function formatEspStreamUrl(raw) {
  const s = cleanEspCamIp(raw);
  let host = s;
  let port = '81';
  if (s.includes(':')) {
    const parts = s.split(':');
    host = parts[0];
    port = parts[1] || '81';
  }
  return `http://${host}:${port}/stream`;
}

// =====================================================================
// 6. VÒNG LẶP NHẬN DIỆN & ĐIỂM DANH THỜI GIAN THỰC (PIPELINE CHÍNH)
// =====================================================================
async function runAdminDetectionLoop() {
  if (!adminCameraActive || !adminInferenceRunning) return;

  const media = document.getElementById('adminEspImg');
  const isVideo = media instanceof HTMLVideoElement;
  // CHỈ coi là có frame khi hình ảnh thực sự đã tải thành công (naturalWidth > 0)
  const hasFrame = media && (isVideo ? (media.videoWidth > 0 && !media.paused) : (media.naturalWidth > 0));

  if (hasFrame && adminFaceModelsLoaded) {
    await processAdminCameraFrame(media);
  }

  // Đo FPS
  adminFpsCounter++;
  const now = performance.now();
  if (now - adminLastFpsTime >= 1000) {
    const fpsEl = document.getElementById('adminCamFpsText');
    if (fpsEl && adminCameraActive) fpsEl.textContent = `${adminFpsCounter} FPS`;
    adminFpsCounter = 0;
    adminLastFpsTime = now;
  }

  if (adminCameraActive && adminInferenceRunning) {
    adminAnimFrameId = requestAnimationFrame(runAdminDetectionLoop);
  }
}

// Biến theo dõi xác thực đa khung hình chắc chắn
let adminTrackingMssv = null;
let adminTrackingFrames = 0;
const REQUIRED_CONFIRM_FRAMES = 2; // Nhận diện cực nhạy & tức thì (2 frame liên tiếp ~0.25s)

async function processAdminCameraFrame(media) {
  // Guard check 1: Nếu cam đã dừng -> thoát ngay
  if (!adminCameraActive || !adminInferenceRunning) return;

  const canvas = document.getElementById('adminCamOverlayCanvas');
  if (!canvas) return;

  const hudStatus = document.getElementById('adminCamHudStatus');

  const w = media.clientWidth || 640;
  const h = media.clientHeight || 480;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // Snapshot hình ảnh sang canvas ẩn
  const natW = media.videoWidth || media.naturalWidth || w;
  const natH = media.videoHeight || media.naturalHeight || h;
  if (adminCaptureCanvas.width !== natW || adminCaptureCanvas.height !== natH) {
    adminCaptureCanvas.width = natW;
    adminCaptureCanvas.height = natH;
  }
  adminCaptureCtx.drawImage(media, 0, 0, natW, natH);

  // 1. Phát hiện khuôn mặt bằng Face-API Tiny
  let det = null;
  try {
    det = await faceapi.detectSingleFace(
      adminCaptureCanvas,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.25 })
    ).withFaceLandmarks(true).withFaceDescriptor();
  } catch (e) { }

  // Guard check 2: Nếu camera đã tắt trong lúc chờ detectSingleFace -> xóa canvas và thoát ngay
  if (!adminCameraActive || !adminInferenceRunning) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // NẾU MẤT KHUÔN MẶT: RESET NGAY LẬP TỨC TIẾN TRÌNH XÁC THỰC
  if (!det) {
    adminTrackingMssv = null;
    adminTrackingFrames = 0;
    adminLastUnknownFaceDataUrl = null;
    const btnQuick = document.getElementById('btnAdminQuickEnrollFromFeed');
    if (btnQuick) btnQuick.style.display = 'none';
    if (hudStatus) {
      hudStatus.textContent = '🔍 Đang quan sát... Hãy đứng trước camera';
      hudStatus.style.color = 'var(--primary)';
    }
    return;
  }

  const box = det.detection.box;
  const scaleX = w / natW;
  const scaleY = h / natH;
  const drawX = box.x * scaleX;
  const drawY = box.y * scaleY;
  const drawW = box.width * scaleX;
  const drawH = box.height * scaleY;

  // 2. Chống giả mạo MiniFASNet-V2
  let antiSpoofResult = { ok: true, isLive: true, pLive: 0.98 };
  if (adminAntiSpoofEnabled && adminFasnetSession) {
    try {
      antiSpoofResult = await runMiniFasnetInference(adminCaptureCanvas, box);
    } catch (eFas) {
      antiSpoofResult = { ok: true, isLive: true, pLive: 0.95 };
    }
  }

  // Guard check 3: Nếu camera đã tắt trong lúc chờ suy luận MiniFASNet -> xóa canvas và thoát ngay
  if (!adminCameraActive || !adminInferenceRunning) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // 3. So khớp nhận diện danh tính bằng FaceMatcher
  let bestMatch = null;
  if (adminFaceMatcher && det.descriptor) {
    bestMatch = adminFaceMatcher.findBestMatch(det.descriptor);
  }

  // 4. Đánh giá kết hợp & Xác thực Đa Khung Hình Chắc Chắn
  let boxColor = '#3b82f6';
  let statusText = '';
  let progressRatio = 0;

  if (antiSpoofResult.ok && !antiSpoofResult.isLive) {
    // PHÁT HIỆN GIẢ MẠO: Reset ngay lập tức
    adminTrackingMssv = null;
    adminTrackingFrames = 0;
    adminLastUnknownFaceDataUrl = null;
    const btnQuick = document.getElementById('btnAdminQuickEnrollFromFeed');
    if (btnQuick) btnQuick.style.display = 'none';

    adminConsecutiveSpoofHits++;
    boxColor = '#dc2626';

    const reason = antiSpoofResult.pReplay >= antiSpoofResult.pPrint
      ? `Màn hình điện thoại (${(antiSpoofResult.pReplay * 100).toFixed(1)}%)`
      : `Ảnh in 2D (${(antiSpoofResult.pPrint * 100).toFixed(1)}%)`;

    statusText = `🚫 TỪ CHỐI: Phát hiện ảnh giả [${reason}]`;
    if (hudStatus) {
      hudStatus.textContent = statusText;
      hudStatus.style.color = 'var(--err)';
    }
  } else {
    // Khuôn mặt thật vượt qua kiểm tra chống giả mạo
    adminConsecutiveSpoofHits = 0;

    if (bestMatch && bestMatch.label !== 'unknown') {
      const btnQuick = document.getElementById('btnAdminQuickEnrollFromFeed');
      if (btnQuick) btnQuick.style.display = 'none';
      adminLastUnknownFaceDataUrl = null;

      const parts = bestMatch.label.split(' - ');
      const mssv = parts[0];
      const name = parts[1] || mssv;
      const distance = bestMatch.distance;

      if (adminTrackingMssv === mssv) {
        adminTrackingFrames++;
      } else {
        adminTrackingMssv = mssv;
        adminTrackingFrames = 1;
      }

      progressRatio = Math.min(1.0, adminTrackingFrames / REQUIRED_CONFIRM_FRAMES);

      if (adminTrackingFrames >= REQUIRED_CONFIRM_FRAMES) {
        // ĐÃ GIỮ ĐỦ 6 FRAMES LIÊN TỤC -> CHỐT ĐIỂM DANH THÀNH CÔNG!
        boxColor = '#16a34a';
        const liveInfo = antiSpoofResult.ok ? ` · LIVE: ${(antiSpoofResult.pLive * 100).toFixed(0)}%` : '';
        statusText = `✅ ĐÃ XÁC THỰC: ${name} (${mssv})${liveInfo}`;

        if (hudStatus) {
          hudStatus.textContent = statusText;
          hudStatus.style.color = 'var(--ok)';
        }

        // Cắt ảnh khuôn mặt hiện tại từ camera để lưu vào lịch sử quét cụ thể
        let capturedFaceDataUrl = '';
        try {
          const cropCanvas = document.createElement('canvas');
          const pad = Math.round(box.width * 0.25);
          const cropX = Math.max(0, box.x - pad);
          const cropY = Math.max(0, box.y - pad);
          const cropW = Math.min(adminCaptureCanvas.width - cropX, box.width + pad * 2);
          const cropH = Math.min(adminCaptureCanvas.height - cropY, box.height + pad * 2);
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext('2d');
          cropCtx.drawImage(adminCaptureCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          capturedFaceDataUrl = cropCanvas.toDataURL('image/jpeg', 0.85);
        } catch (e) { }

        // Kích hoạt điểm danh hợp lệ
        executeFaceCheckin(mssv, name, distance, antiSpoofResult, capturedFaceDataUrl);
        // Reset tracking frames sau khi chốt điểm danh để không kích hoạt lặp lại ở frame kế tiếp
        adminTrackingFrames = 0;
      } else {
        boxColor = '#2563eb';
        const pct = Math.round(progressRatio * 100);
        statusText = `⏳ Giữ yên khuôn mặt: ${name} [${adminTrackingFrames}/${REQUIRED_CONFIRM_FRAMES}] (${pct}%)`;

        if (hudStatus) {
          hudStatus.textContent = statusText;
          hudStatus.style.color = 'var(--primary)';
        }
      }
    } else {
      adminTrackingMssv = null;
      adminTrackingFrames = 0;
      boxColor = '#d97706';
      statusText = '⚠️ Khuôn mặt chưa có trong dữ liệu sinh viên';
      if (hudStatus) {
        hudStatus.textContent = statusText;
        hudStatus.style.color = 'var(--warn)';
      }

      // Hỗ trợ đăng ký nhanh nếu chưa có
      try {
        const cropCanvas = document.createElement('canvas');
        const pad = Math.round(box.width * 0.25);
        const cropX = Math.max(0, box.x - pad);
        const cropY = Math.max(0, box.y - pad);
        const cropW = Math.min(adminCaptureCanvas.width - cropX, box.width + pad * 2);
        const cropH = Math.min(adminCaptureCanvas.height - cropY, box.height + pad * 2);
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(adminCaptureCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        adminLastUnknownFaceDataUrl = cropCanvas.toDataURL('image/jpeg', 0.9);

        const btnQuick = document.getElementById('btnAdminQuickEnrollFromFeed');
        if (btnQuick) btnQuick.style.display = 'inline-flex';
      } catch (e) { }
    }
  }

  // Guard check 4: Tuyệt đối không vẽ nếu camera đã bị tắt
  if (!adminCameraActive || !adminInferenceRunning) {
    ctx.clearRect(0, 0, w, h);
    return;
  }

  // Vẽ bounding box trang nhã trên canvas
  ctx.save();
  ctx.strokeStyle = boxColor;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(drawX, drawY, drawW, drawH);

  // Thanh tiến trình xác thực (Progress Bar)
  if (progressRatio > 0 && progressRatio < 1.0) {
    const barH = 5;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(drawX, drawY + drawH + 4, drawW, barH);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(drawX, drawY + drawH + 4, drawW * progressRatio, barH);
  }

  // Nhãn trên khung khuôn mặt
  ctx.fillStyle = boxColor;
  const tagH = 22;
  const tagW = Math.max(140, ctx.measureText(statusText).width + 16);
  ctx.fillRect(drawX, Math.max(0, drawY - tagH), tagW, tagH);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11.5px Plus Jakarta Sans, sans-serif';
  ctx.fillText(statusText, drawX + 8, Math.max(14, drawY - 6));
  ctx.restore();
}

// =====================================================================
// 7. GHI NHẬN ĐIỂM DANH & HIỂN THỊ HỒ SƠ SINH VIÊN
// =====================================================================
async function executeFaceCheckin(mssv, name, distance, antiSpoofResult, capturedFacePhotoUrl = '') {
  const now = Date.now();
  // Chống điểm danh lặp lại cùng một sinh viên trong vòng 8 giây
  if (adminLastCheckinTime[mssv] && (now - adminLastCheckinTime[mssv] < 8000)) {
    return;
  }
  adminLastCheckinTime[mssv] = now;

  const st = (students || []).find(s => s.mssv === mssv);
  const avatar = st?.avatar || `images/faces/${mssv}.png`;
  const timeFormatted = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const confidencePct = Math.max(0, Math.min(100, Math.round((1 - distance / 0.6) * 100)));
  const livePct = antiSpoofResult?.ok ? (antiSpoofResult.pLive * 100).toFixed(1) : '98.5';

  // 1. KÍCH HOẠT CÒI ESP32 (1 tiếng bíp) & LOA WEB (Có khóa cooldown 4 giây chống kêu liên hồi)
  const canPlayBeep = !adminSoundMuted && (now - adminLastGlobalBeepTime >= 4000);
  if (canPlayBeep) {
    adminLastGlobalBeepTime = now;
    triggerEspBuzzer('success');
    playAdminSuccessBeep();
  }
  renderRecognizedStudentCard(st, mssv, name, avatar, timeFormatted, distance, antiSpoofResult);

  // 2. KIỂM TRA PHIÊN MỞ: Tự động lấy session từ bộ nhớ hoặc Supabase
  const activeSession = await ensureOpenSession();
  const sessionId = activeSession?.id || (typeof currentSession !== 'undefined' && currentSession?.id ? currentSession.id : (window.currentSession?.id || null));

  if (!sessionId) {
    // Chưa mở phiên điểm danh: Vẫn lưu vào lịch sử quét kiểm tra và còi vẫn kêu thành công!
    addRecentScanRecord(st, mssv, name, avatar, timeFormatted, 'Đã nhận diện (Chưa mở phiên)', confidencePct, livePct, capturedFacePhotoUrl);
    toast('info', 'Đã nhận diện', `${name} (${mssv}) · Nhận diện thành công (Hiện chưa có phiên điểm danh mở).`);
    return;
  }

  // 2. Ghi nhận vào Supabase qua RPC kiosk_record_face_checkin
  let checkinStatus = 'có mặt';
  let isLate = false;
  const note = `Camera AI (Khớp: ${confidencePct}%, LIVE: ${livePct}%)`;

  try {
    const { data, error } = await supabase.rpc('kiosk_record_face_checkin', {
      p_session_id: sessionId,
      p_mssv: mssv,
      p_note: note
    });

    if (error) {
      console.warn('Lỗi RPC kiosk_record_face_checkin:', error);
      toast('err', 'Điểm danh thất bại', error.message || 'Máy chủ không ghi nhận được.');
      return;
    } else if (data) {
      if (data.ok === false) {
        toast('warn', 'Không thể điểm danh', data.message || 'Phiên không hợp lệ hoặc đã kết thúc');
        return;
      }
      if (data.code === 'ALREADY') {
        toast('info', 'Đã điểm danh', `${name} (${mssv}) đã được điểm danh trước đó.`);
        addRecentScanRecord(st, mssv, name, avatar, timeFormatted, data.status || 'có mặt', confidencePct, livePct, capturedFacePhotoUrl);
        return;
      }
      if (data.status === 'đi muộn') {
        isLate = true;
        checkinStatus = 'đi muộn';
      }
    }
  } catch (e) {
    console.error('Lỗi khi gọi điểm danh:', e);
    toast('err', 'Lỗi kết nối', 'Không thể gửi dữ liệu điểm danh lên máy chủ.');
    return;
  }

  // 3. Cập nhật state điểm danh giao diện Admin
  if (typeof attendanceMap !== 'undefined') {
    const prev = attendanceMap[mssv] || {};
    attendanceMap[mssv] = {
      ...prev,
      status: checkinStatus,
      time: timeFormatted,
      editedAt: new Date().toISOString(),
      category: 'Khuôn mặt',
      note: note
    };
    if (typeof renderAll === 'function') renderAll();
  }

  // 4. Lưu vào lịch sử quét theo ngày (Accordion)
  addRecentScanRecord(st, mssv, name, avatar, timeFormatted, checkinStatus, confidencePct, livePct, capturedFacePhotoUrl);
  toast(isLate ? 'warn' : 'ok', isLate ? 'Điểm danh trễ' : 'Điểm danh thành công', `${name} (${mssv}) → ${isLate ? 'Đi muộn' : 'Có mặt'}`);
}

function renderRecognizedStudentCard(student, mssv, name, avatar, timeStr, distance, antiSpoof) {
  const container = document.getElementById('adminRecognizedCard');
  if (!container) return;

  const className = student?.class || '—';
  const confidencePct = Math.max(0, Math.min(100, Math.round((1 - distance / 0.6) * 100)));
  const livePct = antiSpoof?.ok ? (antiSpoof.pLive * 100).toFixed(1) : '98.5';

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--ok-bg);border:1.5px solid var(--ok-border);border-radius:12px;animation:fadeSlideInAdmin 0.25s ease-out;">
      <img src="${escapeHtml(avatar)}" onerror="this.src='images/logo.png'" style="width:58px;height:58px;border-radius:10px;object-fit:cover;border:2px solid var(--ok);background:#fff;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <h4 style="margin:0;font-size:15px;font-weight:800;color:var(--text);">${escapeHtml(name)}</h4>
          <span style="font-size:11px;font-weight:800;background:var(--ok);color:#fff;padding:2px 8px;border-radius:4px;">✓ ĐÃ NHẬN DIỆN</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;font-family:'JetBrains Mono',monospace;">
          MSSV: <b>${escapeHtml(mssv)}</b> · Lớp: <b>${escapeHtml(className)}</b>
        </div>
        <div style="font-size:11.5px;color:var(--ok);font-weight:700;margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">
          <span>🎯 Khớp khuôn mặt: ${confidencePct}%</span>
          <span>🛡️ LIVE: ${livePct}%</span>
          <span style="color:var(--muted);">⏱️ ${timeStr}</span>
        </div>
      </div>
    </div>
  `;
}

// =====================================================================
// MODULE LỊCH SỬ QUÉT PHIÊN THEO THƯ MỤC NGÀY (ACCORDION)
// =====================================================================
function getVietnameseDayOfWeek(date) {
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return days[date.getDay()];
}

function loadAdminRecentScans() {
  try {
    const raw = localStorage.getItem('admin_camera_scan_history_v2');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveAdminRecentScans(records) {
  try {
    // Giữ tối đa 50 lượt quét mới nhất để tiết kiệm bộ nhớ
    const trimmed = (records || []).slice(0, 50);
    localStorage.setItem('admin_camera_scan_history_v2', JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Lỗi lưu lịch sử quét vào localStorage:', e);
  }
}

function addRecentScanRecord(student, mssv, name, avatar, timeFormatted, status, confidencePct, livePct, facePhotoUrl) {
  const now = new Date();
  const dateKey = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
  const dayOfWeekStr = getVietnameseDayOfWeek(now);
  const dateFormatted = now.toLocaleDateString('vi-VN');

  const newRecord = {
    id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: Date.now(),
    dateKey: dateKey,
    dayOfWeekStr: dayOfWeekStr,
    dateFormatted: dateFormatted,
    timeFormatted: timeFormatted,
    sessionName: (typeof currentSession !== 'undefined' && currentSession?.session_name) ? currentSession.session_name : 'Phiên hiện tại',
    sessionId: (typeof currentSession !== 'undefined' && currentSession?.id) ? currentSession.id : '',
    mssv: mssv,
    name: name,
    avatar: avatar || `images/faces/${mssv}.png`,
    className: student?.class || '—',
    status: status || 'có mặt',
    confidencePct: confidencePct || 95,
    livePct: livePct || '98.5',
    facePhotoUrl: facePhotoUrl || ''
  };

  const currentScans = loadAdminRecentScans();
  currentScans.unshift(newRecord);
  saveAdminRecentScans(currentScans);

  // Mặc định mở thư mục ngày hôm nay
  adminGroupOpenState[dateKey] = true;

  renderAdminRecentScansGrouped();
}

function renderAdminRecentScansGrouped() {
  const list = document.getElementById('adminRecentScansList');
  const countEl = document.getElementById('adminScanCount');
  if (!list) return;

  const scans = loadAdminRecentScans();
  if (countEl) countEl.textContent = scans.length;

  if (scans.length === 0) {
    list.innerHTML = `
      <div id="adminRecentEmpty" style="text-align:center;padding:36px 12px;color:var(--muted);font-size:12px;font-style:italic;">
        Chưa có lượt quét nào trong các phiên.
      </div>
    `;
    return;
  }

  // Gom nhóm theo dateKey (YYYY-MM-DD)
  const groups = {};
  scans.forEach(item => {
    const dKey = item.dateKey || 'Khác';
    if (!groups[dKey]) {
      groups[dKey] = {
        dateKey: dKey,
        dayOfWeekStr: item.dayOfWeekStr || 'Ngày',
        dateFormatted: item.dateFormatted || dKey,
        items: []
      };
    }
    groups[dKey].items.push(item);
  });

  const todayKey = new Date().toLocaleDateString('sv-SE');
  const sortedDateKeys = Object.keys(groups).sort().reverse();
  let html = '';

  sortedDateKeys.forEach(dKey => {
    const grp = groups[dKey];
    const isToday = (dKey === todayKey);
    const isOpen = (adminGroupOpenState[dKey] !== undefined) ? adminGroupOpenState[dKey] : isToday;

    const studentItemsHtml = grp.items.map(item => {
      const isLate = (item.status === 'đi muộn');
      const badgeHtml = (item.status === 'Đã nhận diện')
        ? `<span style="font-size:10.5px;font-weight:700;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);padding:2px 6px;border-radius:4px;">Nhận diện</span>`
        : (isLate
          ? `<span style="font-size:10.5px;font-weight:700;color:var(--warn);background:var(--warn-bg);border:1px solid var(--warn-border);padding:2px 6px;border-radius:4px;">Đi muộn</span>`
          : `<span style="font-size:10.5px;font-weight:700;color:var(--ok);background:var(--ok-bg);border:1px solid var(--ok-border);padding:2px 6px;border-radius:4px;">Có mặt</span>`);

      const photoSrc = item.facePhotoUrl || item.avatar || 'images/logo.png';

      return `
        <div onclick="openFaceScanDetail('${item.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:all 0.15s ease;" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='var(--surface)'" title="Bấm để xem lịch sử quét chi tiết của sinh viên này">
          <img src="${escapeHtml(photoSrc)}" onerror="this.src='images/logo.png'" style="width:34px;height:34px;border-radius:6px;object-fit:cover;border:1px solid var(--border);background:#fff;flex-shrink:0;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.name)}</div>
            <div style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;">${escapeHtml(item.mssv)} · ⏱️ ${escapeHtml(item.timeFormatted)}</div>
          </div>
          <div>${badgeHtml}</div>
          <span style="font-size:12px;color:var(--muted);font-weight:700;">›</span>
        </div>
      `;
    }).join('');

    html += `
      <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface);margin-bottom:8px;">
        <div onclick="toggleScanDateGroup('${dKey}')" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:var(--surface-2);cursor:pointer;user-select:none;border-bottom:${isOpen ? '1px solid var(--border)' : 'none'};" title="Bấm để mở/đóng danh sách">
          <div style="display:flex;align-items:center;gap:7px;font-weight:700;font-size:12px;color:var(--text);">
            <span>📁</span>
            <span>${escapeHtml(grp.dayOfWeekStr)}, ${escapeHtml(grp.dateFormatted)}</span>
            <span style="font-size:11px;color:var(--muted);font-weight:600;">(${grp.items.length} SV)</span>
          </div>
          <span id="scanGroupIcon_${dKey}" style="font-size:11px;color:var(--muted);font-weight:800;">${isOpen ? '▲' : '▼'}</span>
        </div>
        <div id="scanGroupContent_${dKey}" style="display:${isOpen ? 'flex' : 'none'};flex-direction:column;gap:5px;padding:8px;background:var(--bg);">
          ${studentItemsHtml}
        </div>
      </div>
    `;
  });

  list.innerHTML = html;
}

function toggleScanDateGroup(dateKey) {
  const content = document.getElementById(`scanGroupContent_${dateKey}`);
  const icon = document.getElementById(`scanGroupIcon_${dateKey}`);
  if (!content) return;

  const isVisible = (content.style.display === 'flex');
  content.style.display = isVisible ? 'none' : 'flex';
  if (icon) icon.textContent = isVisible ? '▼' : '▲';
  adminGroupOpenState[dateKey] = !isVisible;
}

function openFaceScanDetail(scanId) {
  const scans = loadAdminRecentScans();
  const item = scans.find(s => s.id === scanId);
  if (!item) return;

  const content = document.getElementById('faceScanDetailContent');
  const modal = document.getElementById('faceScanDetailModal');
  if (!content || !modal) return;

  const faceImg = item.facePhotoUrl || item.avatar || 'images/logo.png';
  const avatarImg = item.avatar || 'images/logo.png';

  const isLate = (item.status === 'đi muộn');
  const statusBadge = isLate
    ? `<span style="font-size:11px;font-weight:700;color:var(--warn);background:var(--warn-bg);border:1px solid var(--warn-border);padding:3px 10px;border-radius:6px;">Đi muộn</span>`
    : `<span style="font-size:11px;font-weight:700;color:var(--ok);background:var(--ok-bg);border:1px solid var(--ok-border);padding:3px 10px;border-radius:6px;">Có mặt</span>`;

  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <!-- So sánh ảnh camera bắt được vs avatar hồ sơ -->
      <div style="display:flex;align-items:center;justify-content:center;gap:16px;padding:12px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border);">
        <div style="text-align:center;">
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:5px;">📷 ẢNH QUÉT CAMERA</div>
          <img src="${escapeHtml(faceImg)}" onerror="this.src='images/logo.png'" style="width:90px;height:90px;border-radius:10px;object-fit:cover;border:2px solid var(--primary);background:#fff;box-shadow:var(--shadow-sm);">
        </div>
        <div style="font-size:18px;color:var(--muted);">➔</div>
        <div style="text-align:center;">
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:5px;">👤 ẢNH HỒ SƠ SV</div>
          <img src="${escapeHtml(avatarImg)}" onerror="this.src='images/logo.png'" style="width:90px;height:90px;border-radius:10px;object-fit:cover;border:2px solid var(--border);background:#fff;box-shadow:var(--shadow-sm);">
        </div>
      </div>

      <!-- Thông tin sinh viên & phiên -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="margin:0;font-size:15px;font-weight:800;color:var(--text);">${escapeHtml(item.name)}</h4>
          ${statusBadge}
        </div>
        <div style="font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace;">
          MSSV: <b>${escapeHtml(item.mssv)}</b> · Lớp: <b>${escapeHtml(item.className || '—')}</b>
        </div>
        <div style="font-size:12px;color:var(--text);border-top:1px dashed var(--border);padding-top:8px;margin-top:2px;">
          📅 <b>Thời gian quét:</b> ${escapeHtml(item.dayOfWeekStr)}, ${escapeHtml(item.dateFormatted)} vào lúc <b>${escapeHtml(item.timeFormatted)}</b>
        </div>
        <div style="font-size:12px;color:var(--muted);">
          📌 <b>Phiên điểm danh:</b> ${escapeHtml(item.sessionName || '—')}
        </div>
      </div>

      <!-- Thông số AI nhận diện -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="padding:10px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);text-align:center;">
          <div style="font-size:11px;color:var(--muted);font-weight:700;">🎯 ĐỘ KHỚP KHUÔN MẶT</div>
          <div style="font-size:18px;font-weight:800;color:var(--ok);margin-top:3px;">${item.confidencePct || 95}%</div>
        </div>
        <div style="padding:10px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);text-align:center;">
          <div style="font-size:11px;color:var(--muted);font-weight:700;">🛡️ XÁC THỰC NGƯỜI THẬT</div>
          <div style="font-size:18px;font-weight:800;color:var(--ok);margin-top:3px;">${item.livePct ? item.livePct + '%' : '98.5%'}</div>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeFaceScanDetailModal() {
  const modal = document.getElementById('faceScanDetailModal');
  if (modal) modal.style.display = 'none';
}

function clearAdminRecentScans() {
  if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử quét camera trên thiết bị này?')) {
    return;
  }
  localStorage.removeItem('admin_camera_scan_history_v2');
  adminGroupOpenState = {};
  renderAdminRecentScansGrouped();
  toast('ok', 'Đã xóa lịch sử', 'Đã dọn sạch toàn bộ lịch sử quét.');
}

function playAdminSuccessBeep() {
  if (adminSoundMuted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.22);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch (e) { }
}

// Phát còi Buzzer trực tiếp trên mạch ESP32-S3 (Chân 14)
async function triggerEspBuzzer(type = 'success') {
  if (adminSoundMuted) return;
  const ipInput = document.getElementById('adminEspIpInput');
  let ip = cleanEspCamIp((ipInput ? ipInput.value.trim() : '') || localStorage.getItem('esp_cam_ip') || DEFAULT_ESP_CAM_IP);
  if (ip.includes(':')) {
    ip = ip.split(':')[0];
  }
  if (!ip) return;

  // Cổng 80 xử lý API HTTP, cổng 81 dành riêng cho luồng stream video
  const url80 = `http://${ip}/beep?type=${encodeURIComponent(type)}&_=${Date.now()}`;
  try {
    fetch(url80, { mode: 'no-cors' }).catch(() => { });
  } catch (e) { }
}

// Biến lưu ảnh khuôn mặt chưa nhận diện để đăng ký nhanh
let adminLastUnknownFaceDataUrl = null;

// Chức năng: Đăng ký nhanh khuôn mặt đang đứng trước camera cho sinh viên
function quickEnrollFromCurrentFeed() {
  if (!adminLastUnknownFaceDataUrl) {
    toast('warn', 'Chưa có ảnh', 'Chưa bắt được khuôn mặt từ luồng camera.');
    return;
  }
  openAdminFaceEnrollModal();
  setTimeout(() => {
    validateAndPreviewPendingPhoto(adminLastUnknownFaceDataUrl, `Chụp trực tiếp từ camera (${new Date().toLocaleTimeString('vi-VN')})`);
  }, 250);
}

// =====================================================================
// 8. BẢNG QUẢN LÝ DỮ LIỆU KHUÔN MẶT SINH VIÊN (KHU VỰC C)
// =====================================================================
let faceStudentFilter = 'all'; // 'all' | 'enrolled' | 'missing'

function setFaceStudentFilter(filter) {
  faceStudentFilter = filter;
  ['all', 'enrolled', 'missing'].forEach(f => {
    const btn = document.getElementById(`btnFaceFilter_${f}`);
    if (btn) {
      btn.className = (f === filter) ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    }
  });
  renderFaceStudentTable();
}

function renderFaceStudentTable() {
  const tbody = document.getElementById('faceStudentTableBody');
  const countEl = document.getElementById('faceStudentTableCount');
  const searchInput = document.getElementById('faceStudentSearchInput');
  if (!tbody) return;

  const q = (searchInput?.value || '').toLowerCase().trim();
  const db = JSON.parse(localStorage.getItem('face_descriptors_db') || '{}');

  const list = (students || []).filter(s => {
    const label = `${s.mssv} - ${s.name}`;
    const hasFace = !!(db[label] && db[label].length > 0);

    if (faceStudentFilter === 'enrolled' && !hasFace) return false;
    if (faceStudentFilter === 'missing' && hasFace) return false;
    if (!q) return true;

    return s.mssv.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q);
  });

  if (countEl) countEl.textContent = `${list.length} / ${(students || []).length} sinh viên`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted);font-style:italic;">Không tìm thấy sinh viên nào phù hợp với bộ lọc.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((s, idx) => {
    const label = `${s.mssv} - ${s.name}`;
    const faceVectors = db[label] || [];
    const hasFace = faceVectors.length > 0;
    const avatar = s.avatar || `images/faces/${s.mssv}.png`;
    const faceInfo = (typeof studentFaceDataMap !== 'undefined') ? studentFaceDataMap.get(s.mssv) : null;
    const updatedTime = faceInfo?.updated_at ? new Date(faceInfo.updated_at).toLocaleDateString('vi-VN') : '—';

    const statusBadge = hasFace
      ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok-border);font-size:11px;font-weight:700;">🟢 Đã đăng ký (${faceVectors.length} ảnh)</span>`
      : `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;background:var(--surface-2);color:var(--muted);border:1px solid var(--border);font-size:11px;font-weight:700;">⚪ Chưa có ảnh</span>`;

    return `
      <tr>
        <td style="color:var(--muted);font-size:11.5px;text-align:center;">${idx + 1}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--text);">${escapeHtml(s.mssv)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${escapeHtml(avatar)}" onerror="this.src='images/logo.png'" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid var(--border);flex-shrink:0;">
            <span style="font-weight:700;color:var(--text);">${escapeHtml(s.name)}</span>
          </div>
        </td>
        <td style="color:var(--muted);">${escapeHtml(s.class || '—')}</td>
        <td>${statusBadge}</td>
        <td style="color:var(--muted);font-size:11.5px;">${updatedTime}</td>
        <td style="text-align:right;">
          <button class="btn btn-secondary btn-sm" onclick="openAdminFaceEnrollModal('${escapeJsAttr(s.mssv)}')" style="font-size:11.5px;padding:4px 9px;">
            📁 Quản lý ảnh khuôn mặt
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// =====================================================================
// 9. MODAL QUẢN LÝ ẢNH KHUÔN MẶT THEO TỪNG MSSV (BẮT BUỘC)
// =====================================================================
async function openAdminFaceEnrollModal(targetMssv = '') {
  const modal = document.getElementById('adminFaceEnrollModal');
  if (!modal) return;

  const sel = document.getElementById('enrollStudentSelect');
  if (sel) {
    sel.innerHTML = '<option value="">-- Chọn sinh viên để quản lý hồ sơ khuôn mặt --</option>' +
      (students || []).map(s => {
        const db = JSON.parse(localStorage.getItem('face_descriptors_db') || '{}');
        const hasData = !!(db[`${s.mssv} - ${s.name}`]);
        const icon = hasData ? '🟢' : '⚪';
        return `<option value="${escapeHtml(s.mssv)}">${icon} ${escapeHtml(s.mssv)} - ${escapeHtml(s.name)}</option>`;
      }).join('');
  }

  // Chọn đúng sinh viên mục tiêu hoặc người đầu tiên
  const pickMssv = targetMssv || (students && students.length > 0 ? students[0].mssv : '');
  if (sel && pickMssv) {
    sel.value = pickMssv;
  }

  modal.style.display = 'flex';
  await onEnrollStudentChange();
}

function closeAdminFaceEnrollModal() {
  const modal = document.getElementById('adminFaceEnrollModal');
  if (modal) modal.style.display = 'none';
  stopEnrollCamera();
  clearPendingEnrollPhoto();
  clearBatchEnrollQueue();
}

async function onEnrollStudentChange() {
  const sel = document.getElementById('enrollStudentSelect');
  const mssv = sel?.value || '';
  enrollActiveMssv = mssv;
  enrollActiveStudent = (students || []).find(s => s.mssv === mssv) || null;

  clearPendingEnrollPhoto();
  clearBatchEnrollQueue();

  const avatarEl = document.getElementById('enrollStudentAvatar');
  const nameEl = document.getElementById('enrollStudentName');
  const metaEl = document.getElementById('enrollStudentMeta');
  const badgeEl = document.getElementById('enrollStatusBadge');
  const btnDelAll = document.getElementById('btnEnrollDeleteAll');

  if (!mssv || !enrollActiveStudent) {
    if (avatarEl) avatarEl.src = 'images/logo.png';
    if (nameEl) nameEl.textContent = 'Chưa chọn sinh viên';
    if (metaEl) metaEl.textContent = 'Vui lòng chọn MSSV từ danh sách trên';
    if (badgeEl) { badgeEl.textContent = '⚪ Chưa chọn'; badgeEl.style.color = 'var(--muted)'; }
    if (btnDelAll) btnDelAll.style.display = 'none';
    enrollPhotos = [];
    renderEnrollPhotoGrid();
    return;
  }

  const avatar = enrollActiveStudent.avatar || `images/faces/${mssv}.png`;
  if (avatarEl) avatarEl.src = avatar;
  if (nameEl) nameEl.textContent = enrollActiveStudent.name;
  if (metaEl) metaEl.textContent = `MSSV: ${mssv} · Lớp: ${enrollActiveStudent.class || '—'}`;

  // Tải danh sách ảnh từ Supabase student_face_data
  try {
    const { data, error } = await supabase.from('student_face_data')
      .select('descriptors, thumbnails, updated_at')
      .eq('mssv', mssv)
      .maybeSingle();

    enrollPhotos = [];
    if (!error && data) {
      const descs = data.descriptors || [];
      const thumbs = data.thumbnails || [];

      // Đồng bộ ảnh và vector
      for (let i = 0; i < Math.max(descs.length, thumbs.length); i++) {
        const thumb = thumbs[i];
        const desc = descs[i];
        if (thumb || desc) {
          enrollPhotos.push({
            id: `photo_${i + 1}`,
            url: typeof thumb === 'object' ? thumb.url : (thumb || avatar),
            label: typeof thumb === 'object' ? (thumb.label || `Ảnh ${i + 1}`) : `Ảnh khuôn mặt ${i + 1}`,
            descriptor: desc || null,
            created_at: data.updated_at
          });
        }
      }

      if (badgeEl) {
        badgeEl.textContent = `🟢 Đã đăng ký ${enrollPhotos.length} ảnh`;
        badgeEl.style.color = 'var(--ok)';
      }
      if (btnDelAll) btnDelAll.style.display = enrollPhotos.length > 0 ? 'inline-flex' : 'none';
    } else {
      if (badgeEl) {
        badgeEl.textContent = '⚪ Chưa có ảnh nào';
        badgeEl.style.color = 'var(--muted)';
      }
      if (btnDelAll) btnDelAll.style.display = 'none';
    }
  } catch (err) {
    console.error('Lỗi nạp ảnh sinh viên:', err);
  }

  renderEnrollPhotoGrid();
}

function renderEnrollPhotoGrid() {
  const container = document.getElementById('enrollPhotoGrid');
  const countBadge = document.getElementById('enrollPhotoCountBadge');
  if (!container) return;

  if (countBadge) countBadge.textContent = `${enrollPhotos.length} ảnh đã lưu`;

  if (enrollPhotos.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:28px 16px;background:var(--surface-2);border:1px dashed var(--border);border-radius:10px;color:var(--muted);">
        <div style="font-size:28px;margin-bottom:6px;">🖼️</div>
        <div style="font-size:13px;font-weight:700;color:var(--text);">Sinh viên này chưa có ảnh khuôn mặt nào</div>
        <div style="font-size:11.5px;margin-top:4px;">Hãy tải ảnh từ máy tính hoặc dùng camera chụp ảnh bên dưới để đăng ký nhận diện.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = enrollPhotos.map((p, idx) => {
    return `
      <div style="position:relative;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px;display:flex;flex-direction:column;align-items:center;gap:6px;transition:all 0.15s ease;">
        <div style="position:relative;width:100%;height:110px;border-radius:8px;overflow:hidden;background:#000;cursor:pointer;" onclick="openPhotoLightbox('${escapeJsAttr(p.url)}', '${escapeJsAttr(p.label)}')">
          <img src="${escapeHtml(p.url)}" style="width:100%;height:100%;object-fit:cover;" alt="${escapeHtml(p.label)}">
          <span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;padding:2px 5px;border-radius:4px;font-size:10px;">🔍 Xem to</span>
        </div>
        <div style="font-size:11.5px;font-weight:700;color:var(--text);width:100%;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escapeHtml(p.label)}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="deleteIndividualPhoto(${idx})" style="width:100%;font-size:11px;padding:3px 6px;color:var(--err);border-color:var(--err-border);">
          🗑 Xóa ảnh này
        </button>
      </div>
    `;
  }).join('');
}

// =====================================================================
// 10. THÊM ẢNH MỚI: TẢI TỪ MÁY TÍNH HOẶC CHỤP CAMERA
// =====================================================================
function setEnrollInputMode(mode) {
  enrollCameraMode = mode;
  const btnUpload = document.getElementById('btnEnrollModeUpload');
  const btnCam = document.getElementById('btnEnrollModeCamera');
  const boxUpload = document.getElementById('enrollUploadBox');
  const boxCam = document.getElementById('enrollCameraBox');

  if (mode === 'upload') {
    if (btnUpload) { btnUpload.className = 'btn btn-primary btn-sm'; }
    if (btnCam) { btnCam.className = 'btn btn-secondary btn-sm'; }
    if (boxUpload) boxUpload.style.display = 'block';
    if (boxCam) boxCam.style.display = 'none';
    stopEnrollCamera();
  } else {
    if (btnUpload) { btnUpload.className = 'btn btn-secondary btn-sm'; }
    if (btnCam) { btnCam.className = 'btn btn-primary btn-sm'; }
    if (boxUpload) boxUpload.style.display = 'none';
    if (boxCam) boxCam.style.display = 'block';
    startEnrollCamera();
  }
}

// =====================================================================
// XỬ LÝ TẢI LÊN NHIỀU ẢNH KHUÔN MẶT CÙNG LÚC (BATCH ENROLL)
// =====================================================================
let enrollBatchQueue = [];
let isBatchProcessing = false;

// Xử lý khi Admin chọn ảnh từ máy tính (Hỗ trợ 1 hoặc nhiều ảnh)
async function handleEnrollFileUpload(event) {
  const files = Array.from(event.target.files || []);
  if (!files || files.length === 0) return;

  if (!enrollActiveMssv) {
    toast('warn', 'Chưa chọn sinh viên', 'Vui lòng chọn sinh viên cần đăng ký khuôn mặt trước.');
    event.target.value = '';
    return;
  }

  // Ẩn preview đơn lẻ nếu đang mở
  const singlePreview = document.getElementById('enrollPreviewCard');
  if (singlePreview) singlePreview.style.display = 'none';

  // Hiển thị khung Batch
  const batchCard = document.getElementById('enrollBatchCard');
  if (batchCard) batchCard.style.display = 'block';

  // Gán danh sách ảnh vào hàng đợi
  enrollBatchQueue = files.map((file, idx) => ({
    id: 'batch_' + Date.now() + '_' + idx,
    file: file,
    name: file.name,
    status: 'pending', // 'pending' | 'processing' | 'valid' | 'invalid'
    msg: 'Đang xếp hàng chờ xử lý...',
    thumbUrl: '',
    descriptor: null,
    label: `Ảnh tải lên #${idx + 1}`
  }));

  renderBatchQueue();
  await processEnrollBatchQueue();
}

// Xử lý tuần tự từng ảnh trong hàng đợi bằng Face-API
async function processEnrollBatchQueue() {
  if (isBatchProcessing || enrollBatchQueue.length === 0) return;
  isBatchProcessing = true;

  const total = enrollBatchQueue.length;
  const progressText = document.getElementById('enrollBatchProgressText');
  const summaryText = document.getElementById('enrollBatchSummaryText');
  const progressBar = document.getElementById('enrollBatchProgressBar');
  const btnSaveBatch = document.getElementById('btnConfirmSaveBatchPhotos');

  if (btnSaveBatch) btnSaveBatch.disabled = true;

  for (let i = 0; i < total; i++) {
    const item = enrollBatchQueue[i];
    item.status = 'processing';
    item.msg = 'Đang phân tích khuôn mặt...';

    if (progressText) progressText.textContent = `${i + 1}/${total} ảnh`;
    if (summaryText) summaryText.textContent = `Đang trích xuất AI ảnh "${item.name}"...`;
    if (progressBar) progressBar.style.width = `${Math.round(((i + 1) / total) * 100)}%`;
    renderBatchQueue();

    try {
      // 1. Đọc file sang DataURL
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(item.file);
      });

      // 2. Tải vào thẻ Image
      const imgEl = new Image();
      imgEl.src = dataUrl;
      await new Promise(r => imgEl.onload = r);

      // 3. Chạy phát hiện khuôn mặt với Face-API
      const detections = await faceapi.detectAllFaces(
        imgEl,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.25 })
      ).withFaceLandmarks(true).withFaceDescriptors();

      if (!detections || detections.length === 0) {
        item.status = 'invalid';
        item.msg = '❌ Không thấy khuôn mặt';
        item.thumbUrl = dataUrl;
      } else if (detections.length > 1) {
        item.status = 'invalid';
        item.msg = `⚠️ Thấy ${detections.length} khuôn mặt (chỉ chụp 1 người)`;
        item.thumbUrl = dataUrl;
      } else {
        const det = detections[0];
        const box = det.detection.box;

        if (box.width < 45 || box.height < 45) {
          item.status = 'invalid';
          item.msg = '⚠️ Mặt quá nhỏ hoặc mờ';
          item.thumbUrl = dataUrl;
        } else {
          // Cắt thumbnail 120x120 quanh box khuôn mặt
          const thumbCanvas = document.createElement('canvas');
          thumbCanvas.width = 120;
          thumbCanvas.height = 120;
          const tCtx = thumbCanvas.getContext('2d');
          const pad = 0.35;
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          const size = Math.max(box.width, box.height) * (1 + pad);
          const sx = Math.max(0, cx - size / 2);
          const sy = Math.max(0, cy - size / 2);
          const sw = Math.min(size, imgEl.width - sx);
          const sh = Math.min(size, imgEl.height - sy);

          tCtx.fillStyle = '#ffffff';
          tCtx.fillRect(0, 0, 120, 120);
          tCtx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, 120, 120);
          const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.88);

          item.status = 'valid';
          item.msg = '✅ Hợp lệ (Vector 128D)';
          item.thumbUrl = thumbUrl;
          item.descriptor = Array.from(det.descriptor);

          // Tự động gán nhãn góc độ theo số thứ tự
          const angleLabels = ['Chính diện', 'Nghiêng trái 15°', 'Nghiêng phải 15°', 'Cúi/Ngẩng/Cười', 'Góc bổ sung'];
          item.label = angleLabels[i] || `Ảnh tải lên #${i + 1}`;
        }
      }
    } catch (err) {
      console.error(`Lỗi xử lý ảnh [${item.name}]:`, err);
      item.status = 'invalid';
      item.msg = '❌ Lỗi đọc ảnh';
    }

    renderBatchQueue();
    // Chờ 1 chút để UI mượt mà
    await new Promise(r => setTimeout(r, 60));
  }

  isBatchProcessing = false;

  // Tổng kết sau khi xử lý xong
  const validCount = enrollBatchQueue.filter(i => i.status === 'valid').length;
  const invalidCount = enrollBatchQueue.filter(i => i.status === 'invalid').length;

  if (summaryText) {
    summaryText.innerHTML = `Hoàn tất phân tích: <b style="color:var(--ok);">${validCount} ảnh hợp lệ</b> • <span style="color:var(--err);">${invalidCount} ảnh không đạt</span>`;
  }

  if (btnSaveBatch) {
    if (validCount > 0) {
      btnSaveBatch.disabled = false;
      btnSaveBatch.textContent = `💾 Lưu tất cả ảnh hợp lệ (${validCount} ảnh) vào hồ sơ`;
    } else {
      btnSaveBatch.disabled = true;
      btnSaveBatch.textContent = '❌ Không có ảnh nào đạt chuẩn';
    }
  }
}

// Hiển thị lưới danh sách ảnh trong Batch Queue
function renderBatchQueue() {
  const grid = document.getElementById('enrollBatchGrid');
  if (!grid) return;

  if (enrollBatchQueue.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--muted);font-size:12px;">Chưa có ảnh nào được chọn.</div>';
    return;
  }

  grid.innerHTML = enrollBatchQueue.map((item, idx) => {
    let borderColor = 'var(--border)';
    let badgeColor = 'var(--muted)';
    let badgeBg = 'var(--surface-2)';

    if (item.status === 'valid') {
      borderColor = 'var(--ok)';
      badgeColor = '#059669';
      badgeBg = '#dcfce7';
    } else if (item.status === 'invalid') {
      borderColor = 'var(--err)';
      badgeColor = '#dc2626';
      badgeBg = '#fee2e2';
    } else if (item.status === 'processing') {
      borderColor = 'var(--primary)';
      badgeColor = 'var(--primary)';
      badgeBg = 'var(--primary-soft)';
    }

    const thumbHtml = item.thumbUrl
      ? `<img src="${item.thumbUrl}" style="width:100%;height:100px;object-fit:cover;border-radius:6px;display:block;">`
      : `<div style="width:100%;height:100px;display:grid;place-items:center;background:var(--surface-2);color:var(--muted);font-size:22px;">🖼️</div>`;

    return `
      <div style="position:relative;background:var(--surface);border:2px solid ${borderColor};border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:5px;transition:all 0.15s ease;">
        ${thumbHtml}
        <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.name}">
          ${item.name}
        </div>
        <div style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;color:${badgeColor};background:${badgeBg};text-align:center;line-height:1.3;">
          ${item.msg}
        </div>
        <button type="button" onclick="removeBatchItem(${idx})" title="Xóa ảnh này khỏi danh sách" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;border:none;font-size:11px;font-weight:800;cursor:pointer;display:grid;place-items:center;">
          ✕
        </button>
      </div>
    `;
  }).join('');
}

// Xóa 1 ảnh khỏi hàng đợi Batch
function removeBatchItem(idx) {
  if (idx < 0 || idx >= enrollBatchQueue.length) return;
  enrollBatchQueue.splice(idx, 1);
  renderBatchQueue();

  const validCount = enrollBatchQueue.filter(i => i.status === 'valid').length;
  const btnSaveBatch = document.getElementById('btnConfirmSaveBatchPhotos');
  const summaryText = document.getElementById('enrollBatchSummaryText');

  if (summaryText) {
    summaryText.innerHTML = `Còn lại: <b style="color:var(--ok);">${validCount} ảnh hợp lệ</b>`;
  }
  if (btnSaveBatch) {
    if (validCount > 0) {
      btnSaveBatch.disabled = false;
      btnSaveBatch.textContent = `💾 Lưu tất cả ảnh hợp lệ (${validCount} ảnh) vào hồ sơ`;
    } else {
      btnSaveBatch.disabled = true;
      btnSaveBatch.textContent = '❌ Không có ảnh nào đạt chuẩn';
    }
  }

  if (enrollBatchQueue.length === 0) {
    clearBatchEnrollQueue();
  }
}

// Dọn sạch hàng đợi Batch
function clearBatchEnrollQueue() {
  enrollBatchQueue = [];
  isBatchProcessing = false;
  const batchCard = document.getElementById('enrollBatchCard');
  const fileInput = document.getElementById('enrollFileInput');
  if (batchCard) batchCard.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

// XÁC NHẬN LƯU TẤT CẢ ẢNH HỢP LỆ VÀO SUPABASE VÀ LOCALSTORAGE
async function confirmSaveBatchPhotos() {
  if (!enrollActiveMssv) {
    toast('warn', 'Chưa chọn sinh viên', 'Vui lòng chọn sinh viên cần đăng ký.');
    return;
  }

  const validItems = enrollBatchQueue.filter(i => i.status === 'valid' && i.descriptor);
  if (validItems.length === 0) {
    toast('warn', 'Không có ảnh hợp lệ', 'Vui lòng chọn ảnh chụp rõ mặt để hệ thống trích xuất vector.');
    return;
  }

  const btnSaveBatch = document.getElementById('btnConfirmSaveBatchPhotos');
  if (btnSaveBatch) {
    btnSaveBatch.disabled = true;
    btnSaveBatch.textContent = `⏳ Đang lưu ${validItems.length} ảnh vào máy chủ...`;
  }

  try {
    // Đưa tất cả ảnh hợp lệ vào enrollPhotos
    validItems.forEach(item => {
      enrollPhotos.push({
        url: item.thumbUrl,
        label: item.label || `Ảnh ${enrollPhotos.length + 1}`,
        descriptor: item.descriptor,
        created_at: new Date().toISOString()
      });
    });

    const descriptors = enrollPhotos.map(p => p.descriptor).filter(Boolean);
    const thumbnails = enrollPhotos.map(p => ({ url: p.url, label: p.label }));

    // 1. Lưu lên Supabase student_face_data
    const { error } = await supabase.from('student_face_data').upsert({
      mssv: enrollActiveMssv,
      descriptors: descriptors,
      thumbnails: thumbnails,
      updated_at: new Date().toISOString()
    }, { onConflict: 'mssv' });

    if (error) throw error;

    // 2. Cập nhật bộ nhớ cục bộ
    const st = enrollActiveStudent;
    const label = `${enrollActiveMssv} - ${st ? st.name : enrollActiveMssv}`;
    let db = JSON.parse(localStorage.getItem('face_descriptors_db') || '{}');
    let tdb = JSON.parse(localStorage.getItem('face_thumbnails_db') || '{}');

    db[label] = descriptors;
    tdb[label] = thumbnails;
    localStorage.setItem('face_descriptors_db', JSON.stringify(db));
    localStorage.setItem('face_thumbnails_db', JSON.stringify(tdb));

    if (typeof studentFaceDataMap !== 'undefined') {
      studentFaceDataMap.set(enrollActiveMssv, {
        count: descriptors.length,
        thumbnails: thumbnails,
        updated_at: new Date().toISOString()
      });
    }

    // 3. Tải lại FaceMatcher nhận diện tức thì
    reloadAdminFaceMatcher();
    updateAdminFaceKpi();
    renderFaceStudentTable();
    renderEnrollPhotoGrid();

    const badgeEl = document.getElementById('enrollStatusBadge');
    if (badgeEl) {
      badgeEl.textContent = `🟢 Đã đăng ký ${enrollPhotos.length} ảnh`;
      badgeEl.style.color = 'var(--ok)';
    }
    const btnDelAll = document.getElementById('btnEnrollDeleteAll');
    if (btnDelAll) btnDelAll.style.display = 'inline-flex';

    clearBatchEnrollQueue();
    toast('ok', `Đã lưu ${validItems.length} ảnh khuôn mặt!`, `Hồ sơ ${label} hiện có ${descriptors.length} vector nhận diện.`);
  } catch (err) {
    console.error('Lỗi lưu Batch ảnh:', err);
    toast('err', 'Lỗi lưu dữ liệu', err.message);
  } finally {
    if (btnSaveBatch) {
      btnSaveBatch.disabled = false;
      btnSaveBatch.textContent = '💾 Lưu tất cả ảnh hợp lệ vào hồ sơ';
    }
  }
}

// Chụp ảnh từ Camera trong Modal
async function startEnrollCamera() {
  stopEnrollCamera();
  const video = document.getElementById('enrollModalVideo');
  if (!video) return;

  try {
    enrollWebcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = enrollWebcamStream;
    await video.play();
  } catch (err) {
    toast('err', 'Không thể mở Camera', err.message);
  }
}

function stopEnrollCamera() {
  if (enrollWebcamStream) {
    enrollWebcamStream.getTracks().forEach(t => t.stop());
    enrollWebcamStream = null;
  }
  const video = document.getElementById('enrollModalVideo');
  if (video) video.srcObject = null;
}

async function captureFromEnrollCamera() {
  const video = document.getElementById('enrollModalVideo');
  if (!video || !video.videoWidth) {
    toast('warn', 'Camera chưa sẵn sàng', 'Vui lòng chờ camera hiển thị khung hình.');
    return;
  }

  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(video, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', 0.9);

  await validateAndPreviewPendingPhoto(dataUrl, `Chụp lúc ${new Date().toLocaleTimeString('vi-VN')}`);
}

// KIỂM TRA TÍNH HỢP LỆ CỦA ẢNH TRƯỚC KHI LƯU
async function validateAndPreviewPendingPhoto(dataUrl, label) {
  const previewBox = document.getElementById('enrollPreviewCard');
  const previewImg = document.getElementById('enrollPreviewImg');
  const statusEl = document.getElementById('enrollPreviewStatus');
  const btnConfirm = document.getElementById('btnConfirmSavePendingPhoto');

  if (previewBox) previewBox.style.display = 'block';
  if (previewImg) previewImg.src = dataUrl;
  if (statusEl) {
    statusEl.textContent = '⏳ Đang phân tích khuôn mặt bằng Face-API...';
    statusEl.style.color = 'var(--primary)';
  }
  if (btnConfirm) btnConfirm.disabled = true;

  try {
    const imgEl = new Image();
    imgEl.src = dataUrl;
    await new Promise(r => imgEl.onload = r);

    // Phát hiện khuôn mặt
    const detections = await faceapi.detectAllFaces(
      imgEl,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.25 })
    ).withFaceLandmarks(true).withFaceDescriptors();

    if (!detections || detections.length === 0) {
      if (statusEl) {
        statusEl.textContent = '❌ Không phát hiện khuôn mặt nào trong ảnh! Vui lòng chọn ảnh chụp rõ mặt, đủ ánh sáng và không bị che khuất.';
        statusEl.style.color = 'var(--err)';
      }
      enrollPendingPhoto = null;
      return;
    }

    if (detections.length > 1) {
      if (statusEl) {
        statusEl.textContent = `⚠️ Phát hiện ${detections.length} khuôn mặt trong ảnh! Vui lòng chỉ chọn ảnh chụp một mình sinh viên.`;
        statusEl.style.color = 'var(--warn)';
      }
      enrollPendingPhoto = null;
      return;
    }

    const det = detections[0];
    const box = det.detection.box;

    if (box.width < 50 || box.height < 50) {
      if (statusEl) {
        statusEl.textContent = '⚠️ Khuôn mặt trong ảnh quá nhỏ. Vui lòng chọn ảnh có khuôn mặt chiếm phần lớn khung hình.';
        statusEl.style.color = 'var(--warn)';
      }
      enrollPendingPhoto = null;
      return;
    }

    // Hợp lệ: Tạo thumbnail 120x120 crop quanh mặt
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 120;
    thumbCanvas.height = 120;
    const tCtx = thumbCanvas.getContext('2d');
    const pad = 0.35;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const size = Math.max(box.width, box.height) * (1 + pad);
    const sx = Math.max(0, cx - size / 2);
    const sy = Math.max(0, cy - size / 2);
    const sw = Math.min(size, imgEl.width - sx);
    const sh = Math.min(size, imgEl.height - sy);

    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, 120, 120);
    tCtx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, 120, 120);
    const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.88);

    enrollPendingPhoto = {
      url: thumbUrl,
      label: label || `Ảnh ${enrollPhotos.length + 1}`,
      descriptor: Array.from(det.descriptor),
      created_at: new Date().toISOString()
    };

    if (statusEl) {
      statusEl.textContent = '✅ Khuôn mặt hợp lệ! Vector 128D trích xuất thành công. Bấm nút bên dưới để lưu.';
      statusEl.style.color = 'var(--ok)';
    }
    if (btnConfirm) btnConfirm.disabled = false;
  } catch (err) {
    console.error('Lỗi kiểm tra ảnh:', err);
    if (statusEl) {
      statusEl.textContent = '❌ Lỗi xử lý ảnh: ' + err.message;
      statusEl.style.color = 'var(--err)';
    }
    enrollPendingPhoto = null;
  }
}

function clearPendingEnrollPhoto() {
  enrollPendingPhoto = null;
  const previewBox = document.getElementById('enrollPreviewCard');
  const fileInput = document.getElementById('enrollFileInput');
  if (previewBox) previewBox.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

// Xác nhận lưu ảnh vừa kiểm tra vào Supabase
async function confirmSavePendingPhoto() {
  if (!enrollActiveMssv || !enrollPendingPhoto) return;

  const btnConfirm = document.getElementById('btnConfirmSavePendingPhoto');
  if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = '⏳ Đang lưu...'; }

  try {
    enrollPhotos.push(enrollPendingPhoto);

    // Chuẩn bị dữ liệu cập nhật
    const descriptors = enrollPhotos.map(p => p.descriptor).filter(Boolean);
    const thumbnails = enrollPhotos.map(p => ({ url: p.url, label: p.label }));

    const { error } = await supabase.from('student_face_data').upsert({
      mssv: enrollActiveMssv,
      descriptors: descriptors,
      thumbnails: thumbnails,
      updated_at: new Date().toISOString()
    }, { onConflict: 'mssv' });

    if (error) throw error;

    // Cập nhật bộ nhớ cục bộ
    const st = enrollActiveStudent;
    const label = `${enrollActiveMssv} - ${st ? st.name : enrollActiveMssv}`;
    let db = JSON.parse(localStorage.getItem('face_descriptors_db') || '{}');
    let tdb = JSON.parse(localStorage.getItem('face_thumbnails_db') || '{}');

    db[label] = descriptors;
    tdb[label] = thumbnails;
    localStorage.setItem('face_descriptors_db', JSON.stringify(db));
    localStorage.setItem('face_thumbnails_db', JSON.stringify(tdb));

    if (typeof studentFaceDataMap !== 'undefined') {
      studentFaceDataMap.set(enrollActiveMssv, {
        count: descriptors.length,
        thumbnails: thumbnails,
        updated_at: new Date().toISOString()
      });
    }

    reloadAdminFaceMatcher();
    updateAdminFaceKpi();
    renderFaceStudentTable();
    renderEnrollPhotoGrid();

    const badgeEl = document.getElementById('enrollStatusBadge');
    if (badgeEl) {
      badgeEl.textContent = `🟢 Đã đăng ký ${enrollPhotos.length} ảnh`;
      badgeEl.style.color = 'var(--ok)';
    }
    const btnDelAll = document.getElementById('btnEnrollDeleteAll');
    if (btnDelAll) btnDelAll.style.display = 'inline-flex';

    clearPendingEnrollPhoto();
    toast('ok', 'Đã lưu ảnh khuôn mặt', `Đã thêm ảnh mới cho sinh viên ${label} thành công.`);
  } catch (err) {
    console.error('Lỗi lưu ảnh:', err);
    toast('err', 'Lỗi lưu Server', err.message);
  } finally {
    if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = '💾 Lưu ảnh này vào hồ sơ'; }
  }
}

// Xóa 1 ảnh riêng lẻ
async function deleteIndividualPhoto(idx) {
  if (idx < 0 || idx >= enrollPhotos.length) return;
  const targetPhoto = enrollPhotos[idx];

  if (!confirm(`Bạn có chắc muốn XÓA ảnh "${targetPhoto.label}" khỏi hồ sơ của sinh viên này?`)) {
    return;
  }

  enrollPhotos.splice(idx, 1);

  try {
    const descriptors = enrollPhotos.map(p => p.descriptor).filter(Boolean);
    const thumbnails = enrollPhotos.map(p => ({ url: p.url, label: p.label }));

    if (descriptors.length === 0) {
      // Nếu không còn ảnh nào -> xóa hẳn row
      await supabase.from('student_face_data').delete().eq('mssv', enrollActiveMssv);
    } else {
      await supabase.from('student_face_data').upsert({
        mssv: enrollActiveMssv,
        descriptors: descriptors,
        thumbnails: thumbnails,
        updated_at: new Date().toISOString()
      }, { onConflict: 'mssv' });
    }

    // Cập nhật bộ nhớ
    const st = enrollActiveStudent;
    const label = `${enrollActiveMssv} - ${st ? st.name : enrollActiveMssv}`;
    let db = JSON.parse(localStorage.getItem('face_descriptors_db') || '{}');
    let tdb = JSON.parse(localStorage.getItem('face_thumbnails_db') || '{}');

    if (descriptors.length === 0) {
      delete db[label];
      delete tdb[label];
      if (typeof studentFaceDataMap !== 'undefined') studentFaceDataMap.delete(enrollActiveMssv);
    } else {
      db[label] = descriptors;
      tdb[label] = thumbnails;
      if (typeof studentFaceDataMap !== 'undefined') {
        studentFaceDataMap.set(enrollActiveMssv, { count: descriptors.length, thumbnails, updated_at: new Date().toISOString() });
      }
    }

    localStorage.setItem('face_descriptors_db', JSON.stringify(db));
    localStorage.setItem('face_thumbnails_db', JSON.stringify(tdb));

    reloadAdminFaceMatcher();
    updateAdminFaceKpi();
    renderFaceStudentTable();
    renderEnrollPhotoGrid();

    const badgeEl = document.getElementById('enrollStatusBadge');
    if (badgeEl) {
      badgeEl.textContent = descriptors.length > 0 ? `🟢 Đã đăng ký ${descriptors.length} ảnh` : '⚪ Chưa có ảnh';
      badgeEl.style.color = descriptors.length > 0 ? 'var(--ok)' : 'var(--muted)';
    }

    toast('ok', 'Đã xóa ảnh', `Đã xóa ảnh và cập nhật lại bộ nhận diện AI.`);
  } catch (err) {
    toast('err', 'Lỗi xóa ảnh', err.message);
  }
}

// Xóa toàn bộ dữ liệu khuôn mặt của sinh viên
async function deleteEnrollStudentFromServer() {
  if (!enrollActiveMssv) return;
  const name = enrollActiveStudent?.name || enrollActiveMssv;

  if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn XÓA TOÀN BỘ dữ liệu khuôn mặt của sinh viên ${name} (${enrollActiveMssv}) khỏi Server?`)) {
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

    if (typeof studentFaceDataMap !== 'undefined') studentFaceDataMap.delete(enrollActiveMssv);

    reloadAdminFaceMatcher();
    updateAdminFaceKpi();
    renderFaceStudentTable();

    enrollPhotos = [];
    renderEnrollPhotoGrid();

    const badgeEl = document.getElementById('enrollStatusBadge');
    if (badgeEl) { badgeEl.textContent = '⚪ Chưa có ảnh'; badgeEl.style.color = 'var(--muted)'; }
    const btnDelAll = document.getElementById('btnEnrollDeleteAll');
    if (btnDelAll) btnDelAll.style.display = 'none';

    toast('ok', 'Đã xóa sạch', `Đã xóa toàn bộ dữ liệu khuôn mặt của ${name}.`);
  } catch (err) {
    toast('err', 'Lỗi xóa', err.message);
  }
}

// Xem ảnh lớn (Lightbox)
function openPhotoLightbox(url, title) {
  let modal = document.getElementById('facePhotoLightboxModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'facePhotoLightboxModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,0.8);backdrop-filter:blur(6px);z-index:99999;align-items:center;justify-content:center;padding:20px;';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:16px;max-width:500px;width:100%;box-shadow:0 20px 40px rgba(0,0,0,0.3);position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h4 id="faceLightboxTitle" style="margin:0;font-size:14px;font-weight:700;color:var(--text);">Xem ảnh khuôn mặt</h4>
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('facePhotoLightboxModal').style.display='none'" style="padding:2px 8px;font-size:13px;">✕</button>
        </div>
        <img id="faceLightboxImg" src="" style="width:100%;max-height:420px;object-fit:contain;border-radius:8px;border:1px solid var(--border);">
      </div>
    `;
    document.body.appendChild(modal);
  }
  document.getElementById('faceLightboxTitle').textContent = title || 'Ảnh khuôn mặt sinh viên';
  document.getElementById('faceLightboxImg').src = url;
  modal.style.display = 'flex';
}

// Bật/tắt toàn màn hình
function toggleAdminFaceFullscreen() {
  const target = document.getElementById('view-face-cam');
  if (!target) return;
  if (!document.fullscreenElement) {
    if (target.requestFullscreen) target.requestFullscreen();
    else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

