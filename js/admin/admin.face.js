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
let adminWebcamStream = null;
let adminInferenceRunning = false;
let adminAntiSpoofEnabled = true; // Luôn bật sẵn khi quét, không cần nút bật tắt thủ công
let adminAnimFrameId = null; // Quản lý requestAnimationFrame để hủy dứt khoát khi tắt cam
let adminGroupOpenState = {}; // Trạng thái mở/đóng các folder accordion ngày

// Bộ đệm hiệu năng & Temporal Smoothing chống giả mạo
let adminFpsCounter = 0;
let adminLastFpsTime = performance.now();
let adminConsecutiveLiveHits = {}; // mssv/trackId -> số frame liên tiếp đạt LIVE
let adminConsecutiveSpoofHits = 0;
let adminRecentScans = []; // Lịch sử quét trong phiên
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
let enrollCameraDetecting = false;

// =====================================================================
// 2. KHỞI TẠO MÔ HÌNH AI (ONNX MiniFASNet-V2 & Face-API)
// =====================================================================
async function initFaceCamInAdmin() {
  const ipInput = document.getElementById('adminEspIpInput');
  let savedIp = localStorage.getItem('esp_cam_ip');
  if (!savedIp) {
    savedIp = '192.168.2.168';
  }
  if (ipInput) {
    ipInput.value = savedIp;
    ipInput.oninput = () => localStorage.setItem('esp_cam_ip', ipInput.value.trim());
  }
  localStorage.setItem('esp_cam_ip', savedIp);

  // Khởi tạo Lịch sử quét gom nhóm theo ngày từ bộ nhớ
  renderAdminRecentScansGrouped();
  updateAdminCamSessionStatus();

  // Nạp song song MiniFASNet và Face-API
  loadAdminFasnetModel();

  if (adminFaceModelsLoaded) {
    reloadAdminFaceMatcher();
    renderFaceStudentTable();
    return;
  }

  const hudStatus = document.getElementById('adminCamHudStatus');
  if (hudStatus) hudStatus.textContent = '⏳ Đang nạp mô hình Face-API & MiniFASNet...';

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
      hudStatus.textContent = '🟢 AI sẵn sàng — Nhấn "Bắt đầu quét"';
      hudStatus.style.color = 'var(--ok)';
    }
  } catch (err) {
    console.error('Lỗi khởi tạo mô hình Face-API:', err);
    if (hudStatus) {
      hudStatus.textContent = '❌ Lỗi tải mô hình AI. Vui lòng kiểm tra kết nối mạng.';
      hudStatus.style.color = 'var(--err)';
    }
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
    dst[i]         = b; // Kênh Blue
    dst[N + i]     = g; // Kênh Green
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
      const mssv = row.mssv;
      const st = (students || []).find(s => s.mssv === mssv);
      const name = st ? st.name : mssv;
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
    // Ngưỡng so khớp Euclidean distance: 0.42 (khoảng cách càng nhỏ càng chính xác)
    adminFaceMatcher = new faceapi.FaceMatcher(labeled, 0.42);
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
function updateAdminCamSessionStatus() {
  const stStatus = document.getElementById('faceCamSessionStatus');
  if (!stStatus) return;
  const hasOpenSession = (typeof currentSession !== 'undefined' && currentSession && currentSession.id && currentSession.is_open);
  if (hasOpenSession) {
    stStatus.textContent = `Đang mở: "${currentSession.session_name || 'Phiên hiện tại'}"`;
    stStatus.style.color = 'var(--ok)';
  } else {
    stStatus.textContent = '⚠️ Chưa có phiên mở';
    stStatus.style.color = 'var(--err)';
  }
}

function setAdminCameraSource(src) {
  adminCameraSource = 'esp32';
}

function toggleAdminCamera() {
  if (adminCameraActive) {
    stopAdminCamera();
  } else {
    startAdminCamera();
  }
}

async function startAdminCamera() {
  if (!adminFaceModelsLoaded) {
    toast('warn', 'AI đang nạp', 'Vui lòng chờ mô hình AI hoàn tất tải trong vài giây.');
    return;
  }

  // 1. KIỂM TRA PHIÊN MỞ: Bắt buộc mở phiên mới cho phép quét điểm danh
  const hasOpenSession = (typeof currentSession !== 'undefined' && currentSession && currentSession.id && currentSession.is_open);
  updateAdminCamSessionStatus();
  if (!hasOpenSession) {
    toast('warn', 'Chưa có phiên mở', 'Bạn cần mở một phiên điểm danh trước khi bắt đầu quét khuôn mặt.');
    const hudStatus = document.getElementById('adminCamHudStatus');
    if (hudStatus) {
      hudStatus.textContent = '⚠️ Hãy mở một phiên điểm danh để bắt đầu quét!';
      hudStatus.style.color = 'var(--warn)';
    }
    return;
  }

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
  const rawIp = (ipInput ? ipInput.value : '').trim() || localStorage.getItem('esp_cam_ip') || '192.168.2.168';
  localStorage.setItem('esp_cam_ip', rawIp);

  const streamUrl = formatEspStreamUrl(rawIp);
  if (img) {
    img.style.display = 'block';
    img.style.transform = adminEspMirrored ? 'scaleX(-1)' : 'none';
    img.onload = () => {
      if (hudStatus && adminCameraActive) hudStatus.textContent = `🟢 ESP32 đang phát luồng: ${streamUrl}`;
    };
    img.onerror = () => {
      if (hudStatus && adminCameraActive) {
        hudStatus.innerHTML = `❌ Không tải được luồng từ <b>${streamUrl}</b>. Kiểm tra nguồn ESP32 hoặc cờ Insecure Content trên trình duyệt.`;
      }
    };
    img.src = streamUrl;
  }

  if (btn) {
    btn.innerHTML = '⏹ Dừng camera';
    btn.className = 'btn btn-danger btn-sm';
  }

  if (!adminInferenceRunning) {
    adminInferenceRunning = true;
    adminAnimFrameId = requestAnimationFrame(runAdminDetectionLoop);
  }
}

function stopAdminCamera() {
  // 1. Tắt cờ trạng thái ngay lập tức
  adminCameraActive = false;
  adminInferenceRunning = false;

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

  // Dừng luồng stream và ngắt ảnh
  if (img) {
    img.src = '';
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
}

function toggleAdminCamFlip() {
  adminEspMirrored = !adminEspMirrored;
  const img = document.getElementById('adminEspImg');
  const transform = adminEspMirrored ? 'scaleX(-1)' : 'none';
  if (img) img.style.transform = transform;
}

function toggleAdminAntiSpoof() {
  // Tính năng chống ảnh 2D luôn bật mặc định
  adminAntiSpoofEnabled = true;
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

// =====================================================================
// 6. VÒNG LẶP NHẬN DIỆN & ĐIỂM DANH THỜI GIAN THỰC (PIPELINE CHÍNH)
// =====================================================================
async function runAdminDetectionLoop() {
  if (!adminCameraActive || !adminInferenceRunning) return;

  const media = document.getElementById('adminEspImg');
  const hasFrame = media && (media.naturalWidth > 0 || media.width > 0);

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
const REQUIRED_CONFIRM_FRAMES = 6; // Giữ mặt liên tục 6 frames (~0.8s - 1.2s) để chốt điểm danh

async function processAdminCameraFrame(media) {
  // Guard check 1: Nếu cam đã dừng -> thoát ngay
  if (!adminCameraActive || !adminInferenceRunning) return;

  const canvas = document.getElementById('adminCamOverlayCanvas');
  if (!canvas) return;

  // Kiểm tra phiên mở: BẮT BUỘC CÓ PHIÊN ĐANG MỞ MỚI QUÉT
  const hasOpenSession = (typeof currentSession !== 'undefined' && currentSession && currentSession.id && currentSession.is_open);
  const hudStatus = document.getElementById('adminCamHudStatus');

  if (!hasOpenSession) {
    adminTrackingMssv = null;
    adminTrackingFrames = 0;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (hudStatus) {
      hudStatus.textContent = '⚠️ Phiên điểm danh đã kết thúc hoặc chưa mở. Vui lòng mở phiên!';
      hudStatus.style.color = 'var(--warn)';
    }
    return;
  }

  const w = media.clientWidth || 640;
  const h = media.clientHeight || 480;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // Snapshot hình ảnh sang canvas ẩn
  const natW = media.naturalWidth || w;
  const natH = media.naturalHeight || h;
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
  } catch (e) {}

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

  // 2. Chống giả mạo MiniFASNet-V2 luôn sẵn sàng
  let antiSpoofResult = { ok: false, isLive: false };
  if (adminFasnetSession) {
    antiSpoofResult = await runMiniFasnetInference(adminCaptureCanvas, box);
  } else {
    if (hudStatus) {
      hudStatus.textContent = '⏳ Đang nạp AI chống giả mạo MiniFASNet... Tạm dừng xác thực';
      hudStatus.style.color = 'var(--warn)';
    }
    adminTrackingMssv = null;
    adminTrackingFrames = 0;
    return;
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
        } catch (e) {}

        // Kích hoạt điểm danh hợp lệ
        executeFaceCheckin(mssv, name, distance, antiSpoofResult, capturedFaceDataUrl);
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
      } catch (e) {}
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

  // KIỂM TRA PHIÊN: Bắt buộc có phiên mở mới xử lý điểm danh
  const sessionId = (typeof currentSession !== 'undefined' && currentSession?.id && currentSession?.is_open) ? currentSession.id : null;
  if (!sessionId) {
    toast('warn', 'Chưa có phiên mở', 'Không thể điểm danh do phiên điểm danh chưa được mở!');
    return;
  }

  // 1. KÍCH HOẠT CÒI ESP32 (1 tiếng bíp) & LOA WEB & HIỂN THỊ THẺ NỔI BẬT
  triggerEspBuzzer('success');
  playAdminSuccessBeep();
  renderRecognizedStudentCard(st, mssv, name, avatar, timeFormatted, distance, antiSpoofResult);

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
  } catch (e) {}
}

// Âm thanh cảnh báo lỗi / giả mạo trên máy tính (2 tiếng tít-tít ngắt quãng)
function playAdminWarningBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.15].forEach(delay => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + delay + 0.1);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.1);
    });
  } catch (e) {}
}

// Phát còi Buzzer trực tiếp trên mạch ESP32-S3 (Chân 14)
async function triggerEspBuzzer(type = 'success') {
  const ipInput = document.getElementById('adminEspIpInput');
  const ip = (ipInput ? ipInput.value.trim() : '') || localStorage.getItem('esp_cam_ip') || '192.168.2.168';
  if (!ip) return;

  // Gửi lệnh đồng thời tới port 80 và port 81 của ESP32
  const url80 = `http://${ip}/beep?type=${encodeURIComponent(type)}&_=${Date.now()}`;
  const url81 = `http://${ip}:81/beep?type=${encodeURIComponent(type)}&_=${Date.now()}`;

  try {
    fetch(url80, { mode: 'no-cors' }).catch(() => {});
    fetch(url81, { mode: 'no-cors' }).catch(() => {});
  } catch (e) {}
}

// Nút kiểm tra còi Buzzer trên giao diện Admin
async function testAdminEspBuzzer() {
  const btn = document.getElementById('btnAdminTestBuzzer');
  if (btn) btn.textContent = '🔊 Đang kêu...';
  toast('info', 'Thử còi ESP32', 'Đang gửi lệnh kích hoạt còi Buzzer tới ESP32...');

  await triggerEspBuzzer('success');
  playAdminSuccessBeep();

  setTimeout(() => {
    if (btn) btn.textContent = '🔔 Thử còi';
  }, 1000);
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
          <button class="btn btn-secondary btn-sm" onclick="openAdminFaceEnrollModal('${escapeHtml(s.mssv)}')" style="font-size:11.5px;padding:4px 9px;">
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
}

async function onEnrollStudentChange() {
  const sel = document.getElementById('enrollStudentSelect');
  const mssv = sel?.value || '';
  enrollActiveMssv = mssv;
  enrollActiveStudent = (students || []).find(s => s.mssv === mssv) || null;

  clearPendingEnrollPhoto();

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
        <div style="position:relative;width:100%;height:110px;border-radius:8px;overflow:hidden;background:#000;cursor:pointer;" onclick="openPhotoLightbox('${escapeHtml(p.url)}', '${escapeHtml(p.label)}')">
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

// Xử lý khi Admin chọn ảnh từ máy tính
async function handleEnrollFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!enrollActiveMssv) {
    toast('warn', 'Chưa chọn sinh viên', 'Vui lòng chọn sinh viên cần đăng ký khuôn mặt trước.');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    await validateAndPreviewPendingPhoto(dataUrl, `Ảnh tải lên (${file.name})`);
  };
  reader.readAsDataURL(file);
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

// Xuất dữ liệu khuôn mặt
async function exportAllFaceData() {
  try {
    const { data, error } = await supabase.rpc('admin_export_face_data');
    if (error) throw error;
    if (!data || data.ok === false) throw new Error((data && data.message) || 'Không xuất được dữ liệu.');

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `LH-NaviX_face-data_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('ok', 'Đã xuất dữ liệu', `${data.count || 0} sinh viên có dữ liệu nhận diện.`);
  } catch (err) {
    toast('err', 'Lỗi xuất dữ liệu', err.message);
  }
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

function saveAdminLateMinutes(val) {
  const v = Math.max(1, parseInt(val, 10) || 15);
  localStorage.setItem('admin_late_minutes', v);
}
