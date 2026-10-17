# `det_500m_int8.bin` — Format (Sprint 3, partial)

Source: `c:/facex/docs/demo/det_500m_int8.bin`, 686,289 bytes.

## Confirmed (high confidence)

| Offset | Bytes | Field | Value |
|---:|---|---|---|
| 0x00 | `44 45 54 38` | Magic | `"DET8"` |
| 0x04 | `02` | Format version | 2 |
| 0x05 | `3c` | Layer count | 60 (matches `DET8: %d layers loaded` banner) |
| 0x06–0x07 | `00 00` | Padding | 0 |

After offset 8, the file transitions into per-layer records. The first
~16 bytes (`00 00 03 00 10 00 03 03 02 02 01 b0 01 00 00 14`) appear to
encode a layer-0 descriptor consistent with the SCRFD-500M stem:
- `03 00` (LE u16) = 3 input channels (RGB) ✓
- `10 00` (LE u16) = 16 output channels (SCRFD-500M stem width) ✓
- `03 03` = kernel 3×3 ✓
- `02 02` = stride 2 / stride 2 ✓
The trailing bytes (`01 b0 01 00 00 14`) are not yet decoded — possibly
pad, dilation, op type, weight-blob offset, or quantization-scheme flags.

## Layer-record body shape (probable)

For each layer:
1. **Descriptor** (~12-20 bytes, exact size TBD).
2. **INT8 weights**: `kh × kw × in_c × out_c` bytes for pointwise/general
   conv, or `kh × kw × in_c` bytes for depthwise.
3. **FP32 per-output-channel scales**: `out_c × 4` bytes.
4. (Optional) **FP32 bias**: `out_c × 4` bytes.

Evidence: in the bytes immediately after the first 432 plausible weight bytes
(at file offset ~0x1c0) we find values such as `e8 92 29 36` whose IEEE-754
LE interpretation (~2.4 × 10⁻⁶) is the right magnitude for an INT8 quantization
scale. There are 4–8 unaccounted bytes between the weight blob and the
recognizable scales; these are the next-layer descriptor or alignment padding.

## Why the heuristic probe couldn't pin it down

`tools/dump_det_bin.py` tries a grid of (header-size, descriptor-size, out_c)
to find an offset where the next `3×3×3×out_c` bytes look INT8 and the next
`out_c×4` bytes look FP32. None of the grid combos hit, which means either
(a) descriptor + weights are interleaved with extra fields, (b) scales are
stored elsewhere (e.g., a global scales table at the end), or (c) the
heuristic is too strict (e.g., a layer with many zero weights, or scales
outside the [1e-7, 1.0] window).

A definitive parse requires either:
1. Reading the WAT body of `func $13` (`detect_init`) line-by-line to
   reconstruct the parser, or
2. Reading the relevant WAT body of `func $13` and the helpers it invokes,
   which run hundreds of lines.

Both are tractable but not 1–2 hour work. We therefore defer the full
parser to **Sprint 7** (the calibration / quantization step), where it
becomes load-bearing only if we choose to **reuse** legacy weights.

## What we have enough of (for sprints 4 onward)

- Confirmed model is SCRFD-500M-class (60 layers, FPN strides 8/16/32, c8-packed
  GEMM, 3-channel RGB input, 16-channel stem).
- Confirmed weights file size (686 KB) matches the parameter count of
  SCRFD-500M-KPS within ~5–10 % overhead (scales, bias, alignment).

That is sufficient to design the **new** C engine targeting SCRFD-500M-KPS.
We do not need the legacy weight blob to be decoded before writing the engine,
and we may end up retraining anyway (Sprint 4 decides).

## Suggested follow-up sprints

- **Sprint 3.1 (later):** Full WAT-body translation of `detect_init` (func $13)
  → exact descriptor field map.
- **Sprint 3.2 (later):** Side-by-side parse of the legacy `.bin` against the
  insightface SCRFD-500M-KPS ONNX checkpoint to confirm shape order.
- **Sprint 7:** PTQ → emit our **new** `.bin` with a clearly versioned header
  (`DETX` magic, explicit field list, no ambiguity).
