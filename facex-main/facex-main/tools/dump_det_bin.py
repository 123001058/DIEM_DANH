"""
Dump partial structure of det_500m_int8.bin (Sprint 3).

What we've confirmed so far (from header inspection + WAT dump of detect.wasm):
  bytes 0-3   : "DET8" magic
  byte  4     : version = 2
  byte  5     : n_layers = 0x3c = 60   (matches console banner "60 layers loaded")
  bytes 6-7   : padding (zero)
  byte  8+    : per-layer records

Layer-record shape is not yet fully nailed; the script tries several hypotheses
and reports which one's first record looks plausible (layer 0 of SCRFD-500M
should be a 3x3 stride-2 conv from 3 RGB channels to ~12-16 output channels,
i.e. 3*3*3*out_c bytes of INT8 weights plus per-channel FP32 scales).
"""
import argparse
import struct
import sys


MAGIC = b"DET8"


def looks_like_int8_block(buf, off, n):
    """Heuristic: a block of INT8 weights has roughly uniform distribution
    over [-128, 127] (no big runs of zeros, no all-FP32-like patterns)."""
    if off + n > len(buf):
        return False
    sample = buf[off:off + n]
    zeros = sample.count(0)
    return zeros < 0.25 * n


def looks_like_fp32_scales(buf, off, n_channels):
    """Per-channel scales are small positive FP32s, typically 1e-3..1e-1."""
    n_bytes = n_channels * 4
    if off + n_bytes > len(buf):
        return False
    floats = struct.unpack_from(f"<{n_channels}f", buf, off)
    ok = sum(1 for f in floats if 1e-7 < abs(f) < 1.0)
    return ok >= n_channels * 0.7


def try_layer0_layout(buf, hdr_size, desc_size, in_c, out_c, kh, kw):
    """Check whether layer 0 starting at hdr_size with given descriptor size
    leaves a plausible INT8 weight block followed by FP32 scales."""
    weight_off = hdr_size + desc_size
    weight_bytes = kh * kw * in_c * out_c
    scales_off = weight_off + weight_bytes
    return (looks_like_int8_block(buf, weight_off, weight_bytes)
            and looks_like_fp32_scales(buf, scales_off, out_c))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    args = ap.parse_args()
    with open(args.path, "rb") as f:
        buf = f.read()
    print(f"File: {args.path}  size={len(buf)} bytes")
    print(f"Bytes 0-31: {buf[:32].hex(' ')}")

    if buf[:4] != MAGIC:
        print("ERROR: missing DET8 magic")
        sys.exit(1)
    ver = buf[4]
    n_layers = buf[5]
    print(f"Magic=DET8  version={ver}  n_layers={n_layers}")

    print()
    print("Layer-0 layout probe (first conv = 3x3 s=2, in=3, out=?):")
    print("  for various (header_size, descriptor_size, out_c) check whether")
    print("  the next 3*3*3*out_c bytes look INT8 and the next out_c*4 look FP32...")
    candidates = []
    for hdr in (8, 12, 16, 20):
        for desc in (0, 4, 8, 12, 16, 20):
            for out_c in (8, 12, 16, 24, 32):
                if try_layer0_layout(buf, hdr, desc, 3, out_c, 3, 3):
                    candidates.append((hdr, desc, out_c))
    if not candidates:
        print("  no plausible layout found")
    else:
        for c in candidates[:10]:
            hdr, desc, out_c = c
            woff = hdr + desc
            soff = woff + 3 * 3 * 3 * out_c
            print(f"  HIT: header={hdr}B desc={desc}B out_c={out_c} "
                  f"-> weights@0x{woff:x}..0x{soff:x} ({3*3*3*out_c}B), "
                  f"scales@0x{soff:x}..0x{soff + out_c*4:x} ({out_c*4}B)")
    print()
    print("Note: full layer-by-layer parser deferred to Sprint 7 (when we")
    print("decide reuse-vs-retrain). For now we have enough info to commit")
    print("to the SCRFD-500M architecture in the new C engine.")


if __name__ == "__main__":
    main()
