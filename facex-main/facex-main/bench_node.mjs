import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const FaceXModule = require('./docs/demo/facex.js');

const ROOT = path.resolve('.');
const PAIRS = path.join(ROOT, 'lfw_pairs.txt');
const LFW = path.join(ROOT, 'lfw');
const WEIGHTS = path.join(ROOT, 'docs', 'demo', 'edgeface_xs_fp32.bin');

console.log('Loading facex.wasm...');
const Mod = await FaceXModule();
const fw = fs.readFileSync(WEIGHTS);
Mod.FS.writeFile('/e.bin', fw);
const fxH = Mod.cwrap('facex_init', 'number', ['string', 'string'])('/e.bin', null);
if (!fxH) throw new Error('facex_init failed');
console.log('Engine ready.');

const txt = fs.readFileSync(PAIRS, 'utf8');
const lines = txt.split('\n').slice(1).filter(l => l.trim().length);
const samePairs = [], diffPairs = [];
for (const line of lines) {
  const f = line.split(/\s+/);
  if (f.length === 3) samePairs.push([f[0], +f[1], f[0], +f[2]]);
  else if (f.length === 4) diffPairs.push([f[0], +f[1], f[2], +f[3]]);
}
console.log(`Loaded ${samePairs.length} same-pairs, ${diffPairs.length} diff-pairs.`);

function l2norm(v) {
  let n = 0; for (let i = 0; i < 512; i++) n += v[i] * v[i];
  n = 1 / Math.sqrt(n);
  for (let i = 0; i < 512; i++) v[i] *= n;
  return v;
}
function cosSim(a, b) {
  let d = 0; for (let i = 0; i < 512; i++) d += a[i] * b[i];
  return d;
}

async function loadCrop(name, idx) {
  const file = path.join(LFW, name, `${name}_${String(idx).padStart(4, '0')}.jpg`);
  // LFW 250x250 → center crop x=68 y=68 w=114 h=114, resize to 112x112
  const buf = await sharp(file).extract({ left: 68, top: 68, width: 114, height: 114 }).resize(112, 112).removeAlpha().raw().toBuffer();
  return buf; // 112*112*3 RGB bytes
}

const embCache = new Map();
async function getEmb(name, idx) {
  const key = `${name}|${idx}`;
  if (embCache.has(key)) return embCache.get(key);
  const px = await loadCrop(name, idx);
  const N = 112 * 112 * 3;
  const inP = Mod._malloc(N * 4), outP = Mod._malloc(512 * 4);
  const heap = Mod.HEAPF32, base = inP >> 2;
  for (let i = 0; i < 112 * 112; i++) {
    heap[base + i * 3]     = px[i * 3]     / 127.5 - 1;
    heap[base + i * 3 + 1] = px[i * 3 + 1] / 127.5 - 1;
    heap[base + i * 3 + 2] = px[i * 3 + 2] / 127.5 - 1;
  }
  Mod.cwrap('facex_embed', 'number', ['number', 'number', 'number'])(fxH, inP, outP);
  const emb = new Float32Array(512);
  emb.set(heap.subarray(outP >> 2, (outP >> 2) + 512));
  Mod._free(inP); Mod._free(outP);
  l2norm(emb);
  embCache.set(key, emb);
  return emb;
}

const N_PAIRS = parseInt(process.env.N || '300', 10);
const same = samePairs.slice(0, N_PAIRS);
const diff = diffPairs.slice(0, N_PAIRS);
console.log(`Running ${same.length} same + ${diff.length} diff pairs...`);

const sameSims = [], diffSims = [];
let errors = 0;
const t0 = Date.now();

async function runOne(p, arr) {
  try {
    const ea = await getEmb(p[0], p[1]);
    const eb = await getEmb(p[2], p[3]);
    arr.push(cosSim(ea, eb));
  } catch (e) {
    errors++;
  }
}

let done = 0;
for (const p of same) { await runOne(p, sameSims); if (++done % 50 === 0) process.stdout.write(`.`); }
for (const p of diff) { await runOne(p, diffSims); if (++done % 50 === 0) process.stdout.write(`.`); }
process.stdout.write('\n');

const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Done: ${sameSims.length} same, ${diffSims.length} diff (${errors} errors) in ${dt}s`);

function stats(arr) {
  let mn = Infinity, mx = -Infinity, s = 0;
  for (const v of arr) { if (v < mn) mn = v; if (v > mx) mx = v; s += v; }
  const m = s / arr.length;
  let v = 0; for (const x of arr) v += (x - m) * (x - m);
  return { mn, mx, mean: m, std: Math.sqrt(v / arr.length) };
}
function eer(sameA, diffA) {
  let best = 1, bestT = 0;
  for (let t = -0.2; t <= 1.0; t += 0.002) {
    let fr = 0; for (const s of sameA) if (s < t) fr++;
    let fa = 0; for (const s of diffA) if (s >= t) fa++;
    const m = Math.max(fr / sameA.length, fa / diffA.length);
    if (m < best) { best = m; bestT = t; }
  }
  return { eer: best, threshold: bestT };
}
function auc(sameA, diffA) {
  let wins = 0, total = 0;
  for (const s of sameA) for (const d of diffA) {
    if (s > d) wins += 1;
    else if (s === d) wins += 0.5;
    total += 1;
  }
  return wins / total;
}

const sS = stats(sameSims), dS = stats(diffSims);
const e = eer(sameSims, diffSims);
const a = auc(sameSims, diffSims);

console.log('');
console.log(`Same  pairs: mean=${sS.mean.toFixed(3)} std=${sS.std.toFixed(3)} min=${sS.mn.toFixed(3)} max=${sS.mx.toFixed(3)}`);
console.log(`Diff  pairs: mean=${dS.mean.toFixed(3)} std=${dS.std.toFixed(3)} min=${dS.mn.toFixed(3)} max=${dS.mx.toFixed(3)}`);
console.log(`EER: ${(e.eer*100).toFixed(2)}%  at threshold ${e.threshold.toFixed(3)}`);
console.log(`AUC: ${a.toFixed(4)}  (1.0=perfect, 0.5=random)`);

if (a > 0.95 && e.eer < 0.10) console.log('\n=> FaceX WORKS');
else if (a > 0.80) console.log('\n=> FaceX discriminates but weakly (likely alignment/preproc issue)');
else console.log('\n=> FaceX BROKEN — looks like random');
