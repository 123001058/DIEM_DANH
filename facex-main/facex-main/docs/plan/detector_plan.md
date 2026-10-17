# FaceX Native Detector — Plan

## Goal
Replace the broken `detect.wasm` with a native, from-scratch face detector in pure C, compiled to WASM with hand-written SIMD kernels. Bbox + 5-point keypoints (ArcFace ordering) for stable alignment across head poses.

## Hard constraints
- WASM target with fixed-width SIMD (no relaxed-SIMD; must work on Safari 16.4+ / iOS).
- Pure C11, zero deps; native (Linux/macOS/Windows) + Emscripten builds.
- Engine ≤ 50 KB WASM (target 28–35 KB; matches existing broken binary).
- Weights ≤ 1 MB (target ~700 KB).
- Latency: ≤ 30 ms / 160² on desktop Chrome, ≤ 100 ms on iOS Safari.
- Output: bbox + score + 5 keypoints (left eye, right eye, nose, left mouth, right mouth) in ArcFace order.

## Architecture choice — SCRFD-500M-KPS
- Paper: https://arxiv.org/abs/2105.04714 (Guo et al., ICLR 2022).
- Repo: https://github.com/deepinsight/insightface/tree/master/detection/scrfd
- 0.57 M params / ~32 MFLOPs at 160×160 / WIDER easy 90.97 / medium 88.44.
- License: Apache-2.0 (insightface).
- Backbone: 11 stages of depthwise-separable bottlenecks (3×3 stride-2 stem + DWS, ReLU, no SE, no swish).
- Neck: 3-level FPN at strides 8/16/32 (1×1 lateral + nearest 2× upsample).
- Heads: shared 2× (3×3 conv + ReLU) trunk, then parallel 1×1 cls (1) / bbox (4) / kps (10) per anchor.
- Anchors: 2 per location, scales=[1,2], strides=[8,16,32], base_sizes=[16,64,256].

**Why SCRFD-500M:** the broken `det_500m_int8.bin` filename + 686 KB size is almost certainly this exact architecture. We can likely reverse-engineer and reuse its weights, skipping training.

## Reuse / new code split

**Reuse from c:/facex:**
- `src/gemm_int8_4x8c8.c` — INT8 GEMM (1×1 pointwise + im2col-3×3). ~70% of compute.
- `src/threadpool.c`, `src/threadpool_stub.c` — optional native parallelism.
- `src/weight_crypto.c` — if we ship encrypted weights.
- `include/wasm_compat.h`, `include/compat.h` — cross-platform shims.

**New code:**
- `include/detect.h` (~70 LOC) — public API.
- `src/detect.c` (~600 LOC) — engine: loader, dispatcher, anchor decoder, NMS.
- `src/depthwise_int8.c` (~250 LOC) — hand-written 3×3 DW INT8 with `i32x4.dot_i16x8_s`.
- `src/anchor_decode.c` (~100 LOC) — sigmoid + box/kps delta decoding.
- `src/nms.c` (~80 LOC) — scalar greedy NMS.

## Size budget
| Component | Native | WASM |
|---|---|---|
| `detect.c` | ~12 KB | ~10 KB |
| `gemm_int8_4x8c8.o` (reused) | ~8 KB | ~6 KB |
| `depthwise_int8.c` | ~6 KB | ~4 KB |
| `anchor_decode.c` + `nms.c` | ~3 KB | ~2 KB |
| Anchor table (constant) | ~6 KB | ~6 KB |
| **Engine total** | ~35 KB | **~28 KB** |
| Weights (INT8, 0.57 M params) | — | **~700 KB** |

## 35-sprint breakdown

| # | Title | Deliverable | Deps |
|---|---|---|---|
| 1 | Scaffold `include/detect.h` | Public C API; compiles standalone | — |
| 2 | Reverse-engineer `detect.wasm` | wasm2wat dump, ops/weights notes | — |
| 3 | Recover legacy `det_500m_int8.bin` topology | Parsed header, layer shapes, scale table | 2 |
| 4 | Decision: reuse vs retrain weights | Either dequantized .npz or training start | 3 |
| 5 | Set up WIDER FACE dataset | `tools/widerface_loader.py` | — |
| 6 | Reference PyTorch SCRFD forward | `golden_outputs.npz` for 16 test images | 4 |
| 7 | PTQ calibration script | `tools/quantize_int8.py` → new `.bin` | 6 |
| 8 | Native FP32 reference engine | Pure C float32 forward, matches golden ±1e-4 | 1, 6 |
| 9 | Anchor table generator | Constant `anchors[N][4]` table | 1 |
| 10 | `nms.c` scalar | Class-agnostic greedy NMS | 1 |
| 11 | `anchor_decode.c` | Sigmoid + box/kps decoding | 9 |
| 12 | DW INT8 kernel — scalar | 3×3 s=1 / s=2, ±1 quantization unit vs FP32 | 8 |
| 13 | DW INT8 — WASM SIMD | Vectorized, ≥ 4× scalar | 12 |
| 14 | Pointwise INT8 — wire `gemm_int8_4x8c8` | Pack legacy weights into 4x8c8 | 7, 8 |
| 15 | im2col 3×3 stride-2 stem | Single conv layer test | 14 |
| 16 | FPN top-down path | 1×1 lateral + nearest-2× + add | 14 |
| 17 | Detection head | cls/bbox/kps parallel 1×1 convs | 14 |
| 18 | Engine glue: `detect_run` end-to-end | Returns `DetectFace[]`, CLI test passes | 8, 11, 13–17 |
| 19 | Native correctness gate | mAP within 0.5% of FP32 reference on 16 imgs | 18 |
| 20 | Emscripten build target | `wasm/detect.wasm` builds | 18 |
| 21 | WASM size audit | Engine ≤ 50 KB | 20 |
| 22 | Browser harness page | Works in Chrome desktop | 20 |
| 23 | Safari iOS smoke test | Real iPhone runs without errors | 22 |
| 24 | Performance bench harness | p50/p95 latency baseline | 22 |
| 25 | Optimize hottest layer | -20% on top hotspot | 24 |
| 26 | Optimize second hotspot | -20% on second hotspot | 25 |
| 27 | Memory layout audit | Peak buffer ≤ 1 MB | 18 |
| 28 | NMS tuning + soft-NMS option | Optional `DETECT_SOFT_NMS` flag | 19 |
| 29 | Quantization sweep | PTQ vs QAT-4ep, per-tensor vs per-channel | 7, 19 |
| 30 | **Gate: WIDER easy/medium** | easy ≥ 0.85, medium ≥ 0.80 | 19, 29 |
| 31 | ArcFace alignment regression | LFW pair AUC drop < 0.5% | 18 |
| 32 | Yaw-±30° spot test | NME < 5% at yaw 30° | 31 |
| 33 | **Gate: final WASM size** | Engine ≤ 50 KB, weights ≤ 1 MB | 20, 21, 25, 26 |
| 34 | **Gate: mobile latency** | iPhone 12 p95 ≤ 100 ms; desktop p95 ≤ 30 ms | 24, 33 |
| 35 | Plan-B: legacy binary | If 7/30 fail, ship reverse-engineered weights | 2, 3, 18 |

Ship-blocking: 19, 30, 33, 34.

## Open risks
1. Insightface license fine-print on checkpoint redistribution.
2. INT8 keypoint accuracy (1–2 px drift breaks ArcFace alignment).
3. Single-thread iOS Safari budget (no SharedArrayBuffer in many contexts).
4. WIDER hard subset out of scope at 160² input.
