/*
 * gemm_int8_scalar.c — Scalar INT8 GEMM for WASM builds.
 * Replaces AVX2 gemm_int8_4x8c8 with portable scalar implementation.
 * Used by detector (retinaface_forward_int8).
 */

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* Pack weights into c8 format — for WASM we store as-is since no SIMD packing needed */
void pack_weights_4x8c8(const int8_t* w, const float* scales, int K, int N,
                        void* packed, int32_t* col_sums) {
    /* Simple copy — WASM scalar GEMM reads weights linearly */
    int N8 = (N + 7) & ~7;
    memset(packed, 0, (size_t)N8 * K);
    int8_t* dst = (int8_t*)packed;
    for (int n = 0; n < N; n++) {
        for (int k = 0; k < K; k++) {
            dst[n * K + k] = w[n * K + k];
        }
    }
    /* Compute column sums for zero-point compensation */
    if (col_sums) {
        memset(col_sums, 0, N8 * sizeof(int32_t));
        for (int n = 0; n < N; n++) {
            int32_t sum = 0;
            for (int k = 0; k < K; k++)
                sum += (int32_t)w[n * K + k];
            col_sums[n] = sum;
        }
    }
}

int packed_weights_size_4x8c8(int K, int N) {
    int N8 = (N + 7) & ~7;
    return N8 * K;
}

/* Scalar INT8 GEMM: C[M,N] = A_u8[M,K] @ B_s8[N,K]^T
 * A is unsigned (uint8_t), B is signed (int8_t in packed format).
 * Output is int32 accumulators. */
void int8_gemm_4x8c8(int M, int N, int K,
                     const uint8_t* A, int lda,
                     const void* B_packed,
                     const int32_t* col_sums,
                     int32_t* C, int ldc) {
    const int8_t* B = (const int8_t*)B_packed;
    for (int m = 0; m < M; m++) {
        for (int n = 0; n < N; n++) {
            int32_t acc = 0;
            for (int k = 0; k < K; k++) {
                acc += (int32_t)A[m * lda + k] * (int32_t)B[n * K + k];
            }
            C[m * ldc + n] = acc;
        }
    }
}

/* Fused version with dequant + bias + requant */
void int8_gemm_4x8c8_fused(
    int M, int N, int K,
    const uint8_t* A, int lda,
    const void* B_packed,
    const int32_t* col_sums,
    const float* w_scales, const float* act_scale,
    const float* bias,
    float a_scale, uint8_t a_zero,
    int8_t* out, int out_stride,
    float out_scale) {
    const int8_t* B = (const int8_t*)B_packed;
    for (int m = 0; m < M; m++) {
        for (int n = 0; n < N; n++) {
            int32_t acc = 0;
            for (int k = 0; k < K; k++)
                acc += (int32_t)A[m * lda + k] * (int32_t)B[n * K + k];
            /* Dequant: acc * a_scale * w_scale - col_sum * a_zero * w_scale + bias */
            float val = (float)acc * a_scale * w_scales[n];
            if (col_sums)
                val -= (float)col_sums[n] * (float)a_zero * w_scales[n];
            if (bias)
                val += bias[n];
            /* Requant to INT8 */
            if (out_scale > 0) {
                int q = (int)(val / out_scale + 0.5f);
                if (q > 127) q = 127;
                if (q < -128) q = -128;
                out[m * out_stride + n] = (int8_t)q;
            }
        }
    }
}
