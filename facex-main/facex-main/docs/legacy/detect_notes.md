# Legacy `detect.wasm` — Reverse-Engineering Notes (Sprint 2)

Disassembled from `c:/facex/docs/demo/detect.wasm` (28,342 bytes) using
`emsdk/upstream/bin/wasm-dis.exe`. Output: `detect.wat` (19,678 lines).

## Module summary
- 47 functions total. 12 exports (memory + 6 detector funcs + emscripten/malloc plumbing).
- Memory: `(memory $0 2048 32768)` — 128 MB initial, growable to 2 GB. Way overspec — could shrink.
- Imports: standard emscripten + WASI shims (`fd_read`, `fd_write`, `__syscall_openat`, `_abort_js`, etc). No GPU, no thread imports.

## Public ABI (exports)
| Export | Sig (Wasm) | Notes |
|---|---|---|
| `detect_init` | `(i32) -> i32` | param: weights path C-string ptr; returns handle ptr or 0 |
| `detect_faces` | `(i32, i32, i32, i32, i32, i32) -> i32` | (handle, in_ptr, W, H, out_ptr, max) -> n_faces |
| `detect_free` | `(i32) -> ()` | |
| `malloc`, `free`, etc | (emscripten) | |

Matches what `docs/demo/detect.js` already calls.

## SIMD usage — major finding

Top opcodes in function bodies:

| Opcode | Count |
|---|---|
| `v128.load` | 93 |
| `v128.store` | 77 |
| `i8x16.extract_lane_s` | 64 |
| `f32x4.replace_lane` | 58 |
| `f32x4.extract_lane` | 54 |
| `v128.const` | 49 |
| `f32x4.mul` | 38 |
| `f32x4.splat` | 34 |
| `i32x4.replace_lane` | 27 |
| `i16x8.extend_low_i*` | 23 |
| `i32x4.add` | 21 |
| `i32x4.mul` | 12 |

**Critical absences:**
- `i32x4.dot_i16x8_s` — **0 occurrences**. This is the canonical SIMD INT8 dot-product opcode. Its absence explains the **2,500 ms / frame** latency observed in the browser: the binary multiplies and accumulates element-by-element via 64 `i8x16.extract_lane_s` calls and 58 lane-replace ops. It uses SIMD as a wide-register file, not as actual vector math.
- `i16x8.relaxed_dot_i8x16_i7x16` — 0 occurrences. So the binary does NOT depend on relaxed-simd; it should run on Safari 16.4+ in principle.

**Conclusion:** The legacy build's slowness is a kernel-implementation bug, not a SIMD-feature mismatch. Our new implementation using `i32x4.dot_i16x8_s` should be ≥5× faster trivially. Even before that, the **0-faces-detected** issue is independent and likely a calibration / threshold / decoding bug — see follow-up sprints.

## Embedded constants in data segments

### `data $0` at offset 1030 (FP32 lookup table, 256 entries × 8 bytes)
Begins `\f0?` (= float `1.97...`-ish? actually `0xbf3ff0` little-endian = sigmoid LUT region). Likely a precomputed sigmoid table for cls-head decoding.

### Format strings observed
- `(null)` — emscripten libc.
- `Cannot open %s\n` — file open error in `detect_init`.
- `[DW_fast] H=%d W=%d C=%d pad=%d stride=%d -> OH=%d OW=%d out_bytes=%d\n` — debug log of a "fast depthwise" kernel. Confirms presence of dedicated 3×3-depthwise INT8 path.
- `DET8: %d layers loaded (c8-packed GEMM)\n` — load banner. **"c8-packed"** matches the existing `src/gemm_int8_4x8c8.c` packing exactly. The legacy detector reuses (a copy of) the same INT8 GEMM. Number 60 (from console) = 60 layers stored in the weight blob.

### Anchor stride table (offset ~1410)
Bytes `\08 00 00 00 10 00 00 00 20 00 00 00` = 32-bit ints `[8, 16, 32]` — the FPN strides. Matches SCRFD-500M-KPS exactly.

### Layer-config table (immediately after strides)
Sequence of int32s: `[0, 5, 5, 6, 6, 6, 6, 6, 6, 5, 5, 6, 5, 5, 5, 5, 6, 6, 5, 5, 0, 5, 0, 6]` (24 entries observed). Hypothesis: per-layer kernel/op-type code (0 = pointwise 1×1, 5 = 3×3 depthwise stride-1, 6 = 3×3 depthwise stride-2 — to be verified in Sprint 3 by cross-checking against the SCRFD-500M-KPS layer count).

## What this gives Sprint 3
- Confirmed architecture is SCRFD-style with strides 8/16/32 and a c8-packed INT8 GEMM.
- Confirmed depthwise conv exists as separate kernel (`DW_fast`).
- Layer count: 60 (matches console banner).
- Bin-format hint: header likely contains `[n_layers, …per-layer config…, weight blob…]`. Sprint 3 will attempt to decode `det_500m_int8.bin` accordingly.

## What this gives Sprint 13 (DW SIMD kernel)
- Whatever we write must be drop-in faster than 64 lane-extracts per output. Use `i16x8.extend_low/high_i8x16_s` + `i32x4.dot_i16x8_s` + `i32x4.add` accumulators. Target ≥4× scalar.

## Open questions
- Why does `detect_faces` return 0 every call? Could be: (a) score-threshold sigmoid LUT misindexed, (b) anchor decode using strides-shape mismatch with current 160×160 input (legacy may have been compiled for 320×240 or 640×480), (c) NMS bug.
- Why 2.5 sec / frame on a tight 28 KB binary? Per-pixel scalar accumulation per the lane-extract pattern.
