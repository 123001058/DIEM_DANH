/* Sprint 25: End-to-end test — detect faces, align, embed, compare */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "facex.h"

int main(int argc, char** argv) {
    const char* embed_w = argc > 1 ? argv[1] : "data/edgeface_xs_fp32.bin";
    const char* detect_w = argc > 2 ? argv[2] : "weights/yunet_fp32.bin";

    printf("FaceX %s — End-to-End Test\n", facex_version());

    FaceX* fx = facex_init(embed_w, detect_w, NULL);
    if (!fx) { fprintf(stderr, "Init failed\n"); return 1; }
    printf("Engine ready (detect + embed)\n");

    /* Load test image */
    int W = 160, H = 160;
    uint8_t* img = (uint8_t*)malloc(W*H*3);
    FILE* f = fopen("tests/test_face_160.raw", "rb");
    if (!f) { fprintf(stderr, "No test image\n"); return 1; }
    fread(img, 1, W*H*3, f); fclose(f);

    /* Detect + align + embed */
    FaceXResult results[10];
    facex_set_score_threshold(fx, 0.5f);
    int n = facex_detect(fx, img, W, H, results, 10);
    printf("\nDetected %d faces\n", n);

    for (int i = 0; i < n; i++) {
        printf("\nFace %d:\n", i);
        printf("  bbox: [%.1f, %.1f, %.1f, %.1f]\n",
               results[i].x1, results[i].y1, results[i].x2, results[i].y2);
        printf("  score: %.4f\n", results[i].score);
        printf("  emb[0..4]: %.4f %.4f %.4f %.4f %.4f\n",
               results[i].embedding[0], results[i].embedding[1],
               results[i].embedding[2], results[i].embedding[3],
               results[i].embedding[4]);

        /* Self-similarity should be 1.0 */
        float self_sim = facex_similarity(results[i].embedding, results[i].embedding);
        printf("  self-sim: %.6f\n", self_sim);
    }

    /* Compare face 0 with face 0 from second run (should be identical) */
    if (n >= 1) {
        FaceXResult results2[10];
        int n2 = facex_detect(fx, img, W, H, results2, 10);
        if (n2 >= 1) {
            float sim = facex_similarity(results[0].embedding, results2[0].embedding);
            printf("\nConsistency: same image, run1 vs run2 = %.6f (should be 1.0)\n", sim);
        }
    }

    free(img);
    facex_free(fx);
    printf("\nDone.\n");
    return 0;
}
