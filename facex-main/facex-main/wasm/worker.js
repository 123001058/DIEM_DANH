/*
 * worker.js — FaceX inference in a Web Worker.
 * Keeps main thread responsive while running detection + embedding.
 *
 * Messages:
 *   {type: 'init'} → loads engines and weights
 *   {type: 'detect', pixels: Float32Array, W, H} → returns faces
 *   {type: 'embed', pixels: Float32Array} → returns embedding Float32Array
 */

importScripts('detect.js', 'facex.js');

let DetMod = null, FxMod = null;
let detHandle = 0, fxHandle = 0;

async function init() {
  DetMod = await FaceDetModule();
  FxMod = await FaceXModule();

  // Fetch weights
  const [detW, fxW] = await Promise.all([
    fetch('det_500m_int8.bin').then(r => r.arrayBuffer()),
    fetch('edgeface_xs_fp32.bin').then(r => r.arrayBuffer())
  ]);

  DetMod.FS.writeFile('/det.bin', new Uint8Array(detW));
  FxMod.FS.writeFile('/emb.bin', new Uint8Array(fxW));

  const di = DetMod.cwrap('detect_init', 'number', ['string']);
  detHandle = di('/det.bin');

  const fi = FxMod.cwrap('facex_init', 'number', ['string', 'string']);
  fxHandle = fi('/emb.bin', null);

  postMessage({ type: 'ready' });
}

function detect(pixels, W, H) {
  const nPx = W * H * 3;
  const inPtr = DetMod._malloc(nPx * 4);
  for (let i = 0; i < nPx; i++)
    DetMod.HEAPF32[(inPtr >> 2) + i] = pixels[i];

  const faceSize = 15 * 4;
  const maxFaces = 10;
  const outPtr = DetMod._malloc(faceSize * maxFaces);

  const df = DetMod.cwrap('detect_faces', 'number',
    ['number', 'number', 'number', 'number', 'number', 'number']);
  const nFaces = df(detHandle, inPtr, W, H, outPtr, maxFaces);

  const faces = [];
  for (let i = 0; i < nFaces; i++) {
    const base = (outPtr >> 2) + i * 15;
    faces.push({
      x1: DetMod.HEAPF32[base], y1: DetMod.HEAPF32[base+1],
      x2: DetMod.HEAPF32[base+2], y2: DetMod.HEAPF32[base+3],
      score: DetMod.HEAPF32[base+4],
      kps: Array.from(DetMod.HEAPF32.subarray(base+5, base+15))
    });
  }

  DetMod._free(inPtr);
  DetMod._free(outPtr);
  return faces;
}

function embed(pixels) {
  const N = 112 * 112 * 3;
  const inPtr = FxMod._malloc(N * 4);
  const outPtr = FxMod._malloc(512 * 4);

  for (let i = 0; i < N; i++)
    FxMod.HEAPF32[(inPtr >> 2) + i] = pixels[i];

  const fe = FxMod.cwrap('facex_embed', 'number', ['number', 'number', 'number']);
  fe(fxHandle, inPtr, outPtr);

  const emb = new Float32Array(512);
  emb.set(FxMod.HEAPF32.subarray(outPtr >> 2, (outPtr >> 2) + 512));

  FxMod._free(inPtr);
  FxMod._free(outPtr);
  return emb;
}

onmessage = async function(e) {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      await init();
      break;
    case 'detect':
      const faces = detect(msg.pixels, msg.W, msg.H);
      postMessage({ type: 'detect', faces });
      break;
    case 'embed':
      const emb = embed(msg.pixels);
      postMessage({ type: 'embed', emb }, [emb.buffer]);
      break;
    case 'pipeline': {
      const t0 = performance.now();
      const f = detect(msg.detPixels, msg.detW, msg.detH);
      const detMs = performance.now() - t0;
      let emb = null, embMs = 0;
      if (msg.embPixels) {
        const t1 = performance.now();
        emb = embed(msg.embPixels);
        embMs = performance.now() - t1;
      }
      postMessage({ type: 'pipeline', faces: f, emb, detMs, embMs }, emb ? [emb.buffer] : []);
      break;
    }
  }
};
