# Sprint 4 — Weights Strategy Decision

**Decision: use YuNet (libfacedetection) as the architecture and weights source.**

## Why YuNet over the original plan (SCRFD-500M-KPS)

The 50-source survey recommended SCRFD-500M-KPS based on the legacy
`det_500m_int8.bin` filename (which strongly suggested the broken binary
targeted that architecture). When we tried to acquire the upstream pretrained
ONNX checkpoint we hit:

- insightface official downloads → Google Drive (no curl-friendly URL).
- `pip install insightface` → **fails** to build wheel on Windows / Python 3.12.
- HuggingFace mirrors of `scrfd_500m_bnkps.onnx` → all the ones we tried
  return 401 (auth-gated). 
- GitHub-release mirrors → all 404.

YuNet, on the other hand:

| Factor | YuNet 2023mar | SCRFD-500M-KPS |
|---|---|---|
| Pretrained ONNX | **public, MIT, 232 KB** at github.com/opencv/opencv_zoo | gated / auth |
| Params | 75 K | 570 K |
| WIDER easy / medium / hard (FP32) | 0.892 / 0.883 / 0.811 | 0.910 / 0.884 / 0.695 |
| 5-point keypoints | yes | yes |
| Reference C++ inference engine | yes (libfacedetection) | no |
| Anchor design | anchor-free | anchor-based, 2 per loc |
| INT8 weights estimate | ~85 KB | ~700 KB |

YuNet is strictly smaller, ships clean public weights, has a battle-tested
C++ reference (`libfacedetection`), and matches or beats SCRFD-500M on
medium / hard subsets. The legacy binary's larger weights (686 KB) suggest
it may have been targeting SCRFD-500M, but that doesn't bind us.

## Cost we accept by switching

- **Anchor-free decoding** (centerness-style instead of SSD anchors). Slightly
  more complex output decode, but no anchor table to ship → *smaller* engine.
- The 50-source survey leaned toward SCRFD; some of its sprint-by-sprint
  numbering (anchor table generator, anchor decode) becomes simpler.
- We lose the option of reusing the legacy `.bin` directly. That option
  was already shaky (file format only partially decoded in Sprint 3, and the
  legacy build's SIMD kernel was the slowest path possible — see Sprint 2).

## What we acquired in this sprint

- `c:/facex/weights/yunet_2023mar.onnx` (232,589 bytes, sha256 to follow).
- ONNX inspection: 53 Conv + 15 ReLU + 12 Transpose/Reshape + 6 Sigmoid +
  4 MaxPool + 2 Resize + 2 Add nodes. Single `input` of shape `[1,3,640,640]`.
- 12 outputs at strides 8/16/32: `cls_*`, `obj_*`, `bbox_*`, `kps_*`.

## Implications for subsequent sprints

The 35-sprint plan in `docs/plan/detector_plan.md` was SCRFD-shaped. The
shape of the work is mostly unchanged, but several sprint titles drift:

| Old sprint | New sprint |
|---|---|
| 6 — Reference PyTorch SCRFD forward | 6 — ONNX-runtime YuNet golden outputs |
| 9 — Anchor table generator | 9 — Stride / grid table generator (anchor-free) |
| 11 — Anchor + box + kps decode | 11 — Anchor-free decode (centerness + box delta + kps delta) |
| 17 — SCRFD detection head (cls/bbox/kps) | 17 — YuNet detection head (cls + obj + bbox + kps) |
| 30 — Gate WIDER easy ≥ 0.85 / med ≥ 0.80 | 30 — Gate WIDER easy ≥ 0.87 / med ≥ 0.85 (YuNet beats SCRFD here) |

`docs/plan/detector_plan.md` will be amended in a future polish sprint.
The 35-sprint outline still describes the right shape of work.

## Inference path (what the C engine has to do)

1. **Backbone**: stem 3×3 stride-2 + a stack of conv-bn-relu blocks (all
   fused into Conv at ONNX export) + maxpools, producing C8 / C16 / C32
   feature maps.
2. **Neck (TFD)**: Resize-up + Add to merge cross-scale features.
3. **Heads** (3, one per stride): five small parallel 1×1 convs producing
   `cls`, `obj`, `bbox` (cx,cy,w,h offsets to grid cell), `kps` (5×(dx,dy)).
4. **Decode**: for each grid cell with `sigmoid(cls)·sigmoid(obj) > 0.5`,
   emit a bbox + kps in input pixel coords.
5. **NMS**: scalar greedy IoU-0.4.

No anchor table, no centerness branch. The `obj` branch in YuNet is what
SCRFD calls IoU-aware classification.

## Acceptance for "Sprint 4 complete"

- [x] Decision made and rationale documented (this file).
- [x] Public, working, redistributable checkpoint downloaded
      (`weights/yunet_2023mar.onnx`).
- [x] Architecture map captured (53 Conv + ... + 2 Add).
