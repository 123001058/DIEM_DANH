/* Test detector with raw RGB file */
#include <stdio.h>
#include <stdlib.h>
#include "detect.h"

int main(int argc, char** argv) {
    const char* weights = argc > 1 ? argv[1] : "weights/yunet_fp32.bin";
    const char* raw_img = argc > 2 ? argv[2] : "tests/test_face_160.raw";
    int W = 160, H = 160;

    Detect* det = detect_init(weights);
    if (!det) { fprintf(stderr, "Failed to load\n"); return 1; }

    FILE* f = fopen(raw_img, "rb");
    if (!f) { fprintf(stderr, "No image\n"); return 1; }
    uint8_t* img = (uint8_t*)malloc(W*H*3);
    fread(img, 1, W*H*3, f); fclose(f);

    DetectFace faces[32];
    detect_set_score_threshold(det, 0.1f); /* low threshold to see any output */
    int n = detect_run(det, img, W, H, faces, 32);
    printf("Detected %d faces (threshold=0.1)\n", n);
    for (int i = 0; i < n && i < 5; i++) {
        printf("  face %d: [%.1f, %.1f, %.1f, %.1f] score=%.4f\n",
               i, faces[i].x1, faces[i].y1, faces[i].x2, faces[i].y2, faces[i].score);
        printf("    kps: ");
        for (int k = 0; k < 5; k++) printf("(%.1f,%.1f) ", faces[i].kps[k*2], faces[i].kps[k*2+1]);
        printf("\n");
    }

    free(img); detect_free(det);
    return 0;
}
