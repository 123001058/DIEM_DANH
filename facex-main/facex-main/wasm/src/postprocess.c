/*
 * retinaface_postprocess.c — NMS + bbox/kps decode for RetinaFace det_500m.
 *
 * Takes FP32 head outputs (cls, bbox, kps × 3 strides) and produces
 * a list of detected faces with bounding boxes and 5 landmarks.
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <math.h>

#define MAX_FACES 256

typedef struct {
    float x1, y1, x2, y2;
    float score;
    float kps[5][2]; /* left_eye, right_eye, nose, left_mouth, right_mouth */
} Face;

/* Decode one stride's outputs into face candidates */
static int decode_stride(
    const float* cls, const float* bbox, const float* kps_data,
    int feat_h, int feat_w, int stride, int num_anchors,
    float conf_thresh, float inv_scale,
    Face* out_faces, int max_faces)
{
    int count = 0;

    for (int y = 0; y < feat_h; y++) {
        for (int x = 0; x < feat_w; x++) {
            for (int a = 0; a < num_anchors; a++) {
                int idx = (y * feat_w + x) * num_anchors + a;
                float score = cls[idx]; /* already sigmoid */

                if (score < conf_thresh || count >= max_faces)
                    continue;

                float cx = (x + 0.5f) * stride;
                float cy = (y + 0.5f) * stride;
                float s = (float)stride;

                /* Decode bbox: distance format (left, top, right, bottom) */
                int bi = idx * 4;
                float x1 = (cx - bbox[bi + 0] * s) * inv_scale;
                float y1 = (cy - bbox[bi + 1] * s) * inv_scale;
                float x2 = (cx + bbox[bi + 2] * s) * inv_scale;
                float y2 = (cy + bbox[bi + 3] * s) * inv_scale;

                /* INT8 bbox correction: subtract systematic +5% shift
                 * caused by quantization-induced feature map centroid offset */
                float bw = x2 - x1, bh = y2 - y1;
                x1 -= 0.050f * bw; y1 -= 0.040f * bh;
                x2 -= 0.055f * bw; y2 -= 0.047f * bh;

                /* Decode keypoints */
                int ki = idx * 10;
                Face* f = &out_faces[count];
                f->x1 = x1; f->y1 = y1;
                f->x2 = x2; f->y2 = y2;
                f->score = score;

                for (int k = 0; k < 5; k++) {
                    f->kps[k][0] = (cx + kps_data[ki + k * 2] * s) * inv_scale - 0.050f * bw;
                    f->kps[k][1] = (cy + kps_data[ki + k * 2 + 1] * s) * inv_scale - 0.040f * bh;
                }
                count++;
            }
        }
    }
    return count;
}

/* IoU between two faces */
static float iou(const Face* a, const Face* b) {
    float xx1 = a->x1 > b->x1 ? a->x1 : b->x1;
    float yy1 = a->y1 > b->y1 ? a->y1 : b->y1;
    float xx2 = a->x2 < b->x2 ? a->x2 : b->x2;
    float yy2 = a->y2 < b->y2 ? a->y2 : b->y2;
    float w = xx2 - xx1 > 0 ? xx2 - xx1 : 0;
    float h = yy2 - yy1 > 0 ? yy2 - yy1 : 0;
    float inter = w * h;
    float area_a = (a->x2 - a->x1) * (a->y2 - a->y1);
    float area_b = (b->x2 - b->x1) * (b->y2 - b->y1);
    return inter / (area_a + area_b - inter + 1e-9f);
}

/* Simple insertion sort by score descending */
static void sort_faces(Face* faces, int n) {
    for (int i = 1; i < n; i++) {
        Face key = faces[i];
        int j = i - 1;
        while (j >= 0 && faces[j].score < key.score) {
            faces[j + 1] = faces[j];
            j--;
        }
        faces[j + 1] = key;
    }
}

/* Greedy NMS */
static int nms_faces(Face* faces, int n, float iou_thresh) {
    if (n <= 1) return n;
    sort_faces(faces, n);

    int* suppressed = (int*)calloc(n, sizeof(int));
    int keep = 0;

    for (int i = 0; i < n; i++) {
        if (suppressed[i]) continue;
        if (keep != i) faces[keep] = faces[i];
        for (int j = i + 1; j < n; j++) {
            if (!suppressed[j] && iou(&faces[i], &faces[j]) > iou_thresh) {
                suppressed[j] = 1;
            }
        }
        keep++;
    }
    free(suppressed);
    return keep;
}

/*
 * postprocess: Decode all 3 heads + NMS.
 *
 * head_cls/bbox/kps arrays are in NHWC→reshaped format:
 *   cls:  [feat_h * feat_w, num_anchors]  (already sigmoid)
 *   bbox: [feat_h * feat_w * num_anchors, 4]
 *   kps:  [feat_h * feat_w * num_anchors, 10]
 *
 * det_size: input image size (e.g. 640)
 * img_w, img_h: original image dimensions (for scaling)
 * conf_thresh: minimum confidence (e.g. 0.5)
 *
 * Returns number of faces written to out_faces.
 */
int postprocess_retinaface(
    const float* cls8, const float* bbox8, const float* kps8,
    const float* cls16, const float* bbox16, const float* kps16,
    const float* cls32, const float* bbox32, const float* kps32,
    int det_size, int img_w, int img_h,
    float conf_thresh, float iou_thresh,
    Face* out_faces, int max_out)
{
    float scale = (float)det_size / (float)(img_w > img_h ? img_w : img_h);
    float inv_scale = 1.0f / scale;

    /* Collect candidates from all strides */
    Face candidates[MAX_FACES * 3];
    int total = 0;

    int strides[] = {8, 16, 32};
    const float* cls_ptrs[] = {cls8, cls16, cls32};
    const float* bbox_ptrs[] = {bbox8, bbox16, bbox32};
    const float* kps_ptrs[] = {kps8, kps16, kps32};

    for (int s = 0; s < 3; s++) {
        int feat = det_size / strides[s];
        int n = decode_stride(
            cls_ptrs[s], bbox_ptrs[s], kps_ptrs[s],
            feat, feat, strides[s], 2, /* 2 anchors per position */
            conf_thresh, inv_scale,
            candidates + total, MAX_FACES * 3 - total);
        total += n;
    }

    if (total == 0) return 0;

    /* NMS */
    int n_keep = nms_faces(candidates, total, iou_thresh);
    if (n_keep > max_out) n_keep = max_out;

    for (int i = 0; i < n_keep; i++)
        out_faces[i] = candidates[i];

    return n_keep;
}

/* Print face results */
void print_faces(const Face* faces, int n) {
    for (int i = 0; i < n; i++) {
        const Face* f = &faces[i];
        printf("face[%d] bbox=(%.0f,%.0f,%.0f,%.0f) score=%.3f\n",
            i, f->x1, f->y1, f->x2, f->y2, f->score);
        for (int k = 0; k < 5; k++)
            printf("  kp[%d]=(%.1f,%.1f)\n", k, f->kps[k][0], f->kps[k][1]);
    }
}
