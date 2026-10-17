/*
 * detect_api.c — WASM API for face detection.
 * Wraps retinaface_forward_int8 into clean C functions exportable to JS.
 *
 * API:
 *   detect_init(weights_path) → handle
 *   detect_faces(handle, rgb_hwc, W, H, out_faces, max_faces) → n_faces
 *   detect_free(handle)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Include detect.c but skip its main() */
#define DETECT_NO_MAIN
#include "detect.c"

/* ============ WASM API ============ */

typedef struct {
    Model model;
    int ready;
} DetectCtx;

DetectCtx* detect_init(const char* weights_path) {
    DetectCtx* ctx = (DetectCtx*)calloc(1, sizeof(DetectCtx));
    if (!ctx) return NULL;

    if (load_model(weights_path, &ctx->model) != 0) {
        free(ctx);
        return NULL;
    }
    ctx->ready = 1;
    return ctx;
}

/* Output face struct for JS — flat floats for easy reading */
typedef struct {
    float x1, y1, x2, y2; /* bounding box */
    float score;
    float kps[10];         /* 5 keypoints × (x,y) */
} DetectFace;

int detect_faces(DetectCtx* ctx, const float* rgb_hwc, int W, int H,
                 DetectFace* out_faces, int max_faces) {
    if (!ctx || !ctx->ready) return 0;

    /* Run forward pass */
    HeadOutput h8, h16, h32;
    forward(&ctx->model, rgb_hwc, H, W, &h8, &h16, &h32);

    /* Postprocess — NMS + decode */
    Face faces[256];
    int det_size = W > H ? W : H;
    int n = postprocess_retinaface(
        h8.cls, h8.bbox, h8.kps,
        h16.cls, h16.bbox, h16.kps,
        h32.cls, h32.bbox, h32.kps,
        det_size, W, H,
        0.30f, 0.4f,
        faces, 256);

    /* Copy to output */
    if (n > max_faces) n = max_faces;
    for (int i = 0; i < n; i++) {
        out_faces[i].x1 = faces[i].x1;
        out_faces[i].y1 = faces[i].y1;
        out_faces[i].x2 = faces[i].x2;
        out_faces[i].y2 = faces[i].y2;
        out_faces[i].score = faces[i].score;
        for (int j = 0; j < 5; j++) {
            out_faces[i].kps[j*2]   = faces[i].kps[j][0];
            out_faces[i].kps[j*2+1] = faces[i].kps[j][1];
        }
    }

    /* Cleanup head outputs */
    free(h8.cls); free(h8.bbox); free(h8.kps);
    free(h16.cls); free(h16.bbox); free(h16.kps);
    free(h32.cls); free(h32.bbox); free(h32.kps);

    return n;
}

void detect_free(DetectCtx* ctx) {
    if (!ctx) return;
    for (int i = 0; i < ctx->model.n_layers; i++) {
        free(ctx->model.layers[i].w);
        free(ctx->model.layers[i].w_scale);
        if (ctx->model.layers[i].bias) free(ctx->model.layers[i].bias);
        free(ctx->model.layers[i].act_scale);
        if (ctx->model.layers[i].packed_w) free(ctx->model.layers[i].packed_w);
        if (ctx->model.layers[i].col_sums) free(ctx->model.layers[i].col_sums);
    }
    free(ctx);
}
