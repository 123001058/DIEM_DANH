/* Sprint 13: Benchmark detector latency */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifdef _WIN32
#include <windows.h>
static double now_ms(void) {
    LARGE_INTEGER f, c;
    QueryPerformanceFrequency(&f);
    QueryPerformanceCounter(&c);
    return (double)c.QuadPart / f.QuadPart * 1000.0;
}
#else
static double now_ms(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec * 1000.0 + t.tv_nsec / 1e6;
}
#endif
#include "detect.h"

int main(int argc, char** argv) {
    const char* weights = argc > 1 ? argv[1] : "weights/yunet_fp32.bin";
    int W = 160, H = 160;

    Detect* det = detect_init(weights);
    if (!det) { fprintf(stderr, "Failed\n"); return 1; }

    /* Load test image or generate dummy */
    uint8_t* img = (uint8_t*)malloc(W*H*3);
    FILE* f = fopen("tests/test_face_160.raw", "rb");
    if (f) { fread(img, 1, W*H*3, f); fclose(f); }
    else memset(img, 128, W*H*3);

    DetectFace faces[32];
    detect_set_score_threshold(det, 0.5f);

    /* Warmup */
    for (int i = 0; i < 5; i++) detect_run(det, img, W, H, faces, 32);

    /* Benchmark */
    int N = 200;
    double times[200];
    for (int i = 0; i < N; i++) {
        double t0 = now_ms();
        detect_run(det, img, W, H, faces, 32);
        times[i] = now_ms() - t0;
    }

    /* Sort */
    for (int i = 1; i < N; i++) { double t = times[i]; int j = i; while(j>0&&times[j-1]>t){times[j]=times[j-1];j--;} times[j]=t; }

    double sum = 0; for (int i = 0; i < N; i++) sum += times[i];

    printf("=== YuNet Detect Benchmark (N=%d, %dx%d) ===\n", N, W, H);
    printf("  min:    %.2f ms\n", times[0]);
    printf("  p5:     %.2f ms\n", times[N/20]);
    printf("  median: %.2f ms\n", times[N/2]);
    printf("  mean:   %.2f ms\n", sum/N);
    printf("  p95:    %.2f ms\n", times[N*19/20]);
    printf("  max:    %.2f ms\n", times[N-1]);

    free(img); detect_free(det);
    return 0;
}
