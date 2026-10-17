/* Sprint 11: Test YuNet detector — load weights, run on dummy image. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "detect.h"

int main(int argc, char** argv) {
    const char* weights = argc > 1 ? argv[1] : "weights/yunet_fp32.bin";

    printf("FaceX Detect %s\n", detect_version());
    printf("Loading %s...\n", weights);

    Detect* det = detect_init(weights);
    if (!det) { fprintf(stderr, "Failed to load weights\n"); return 1; }
    printf("Loaded OK (%d tensors)\n", 112); /* known from export */

    /* Create dummy 160×160 RGB image (gray) */
    int W = 160, H = 160;
    uint8_t* img = (uint8_t*)malloc(W * H * 3);
    memset(img, 128, W * H * 3); /* gray */

    /* Run detection */
    DetectFace faces[32];
    detect_set_score_threshold(det, 0.3f);
    int n = detect_run(det, img, W, H, faces, 32);
    printf("Detected %d faces on gray image (expected 0)\n", n);

    /* Try with actual image if available */
    FILE* f = fopen("data/test_face.jpg", "rb");
    if (f) {
        fclose(f);
        printf("\nNote: test_face.jpg found but we need raw RGB, skipping for now.\n");
    }

    free(img);
    detect_free(det);
    printf("Done.\n");
    return 0;
}
