/*
 * gemm_int8_rsimd.c — INT8 GEMM for WASM with Relaxed SIMD dot product.
 *
 * Matches exact signatures expected by detect.c (retinaface_forward_int8).
 * Uses wasm_i32x4_relaxed_dot_i8x16_i7x16_add() → VPDPBUSD on x86, SDOT on ARM.
 */

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <wasm_simd128.h>

/* ============ Weight packing ============ */

void pack_weights_4x8c8(const int8_t* weights, const float* bias, int K, int Cout,
                        void* packed_w, int32_t* col_sums) {
    (void)bias;
    int K16 = (K + 15) & ~15;
    int8_t* dst = (int8_t*)packed_w;
    memset(dst, 0, (size_t)Cout * K16);

    for (int n = 0; n < Cout; n++)
        for (int k = 0; k < K; k++)
            dst[n * K16 + k] = weights[n * K + k];

    if (col_sums) {
        int Cout8 = (Cout + 7) & ~7;
        memset(col_sums, 0, Cout8 * sizeof(int32_t));
        for (int n = 0; n < Cout; n++) {
            int32_t s = 0;
            for (int k = 0; k < K; k++) s += (int32_t)weights[n * K + k];
            col_sums[n] = s;
        }
    }
}

int packed_weights_size_4x8c8(int K, int Cout) {
    return Cout * ((K + 15) & ~15);
}

/* ============ Core GEMM ============ */
/* C_i32[M,N] = A_s8[M,K] @ B_s8[N,K]^T
 * Note: relaxed dot treats first arg as unsigned, second as signed.
 * Our A is signed int8 — we offset by 128 to make it unsigned,
 * then compensate via col_sums. */

void int8_gemm_4x8c8(const int8_t* A, int M, int K, int N,
                     const void* B_packed, int32_t* C, const int32_t* col_sums) {
    const int8_t* B = (const int8_t*)B_packed;
    int K16 = (K + 15) & ~15;

    for (int m = 0; m < M; m++) {
        for (int n = 0; n < N; n++) {
            v128_t acc = wasm_i32x4_splat(0);
            int k = 0;

            for (; k + 16 <= K; k += 16) {
                /* Convert A from signed to unsigned: a_u8 = a_s8 + 128 */
                v128_t va_s8 = wasm_v128_load(A + m * K + k);
                v128_t offset = wasm_i8x16_splat(-128); /* 0x80 */
                v128_t va_u8 = wasm_i8x16_sub(va_s8, offset); /* a + 128 = unsigned */

                v128_t vb = wasm_v128_load(B + n * K16 + k);
                acc = wasm_i32x4_relaxed_dot_i8x16_i7x16_add(va_u8, vb, acc);
            }

            int32_t sum = wasm_i32x4_extract_lane(acc, 0)
                        + wasm_i32x4_extract_lane(acc, 1)
                        + wasm_i32x4_extract_lane(acc, 2)
                        + wasm_i32x4_extract_lane(acc, 3);

            /* Scalar remainder */
            for (; k < K; k++)
                sum += (int32_t)A[m * K + k] * (int32_t)B[n * K16 + k];

            /* Compensate for unsigned offset: subtract 128 * col_sum */
            if (col_sums)
                sum -= 128 * col_sums[n];

            C[m * N + n] = sum;
        }
    }
}

/* ============ Fused GEMM + dequant + bias + relu + requant ============ */

void int8_gemm_4x8c8_fused(
    const int8_t* A, int M, int K, int N,
    const void* B_packed, int8_t* out, const int32_t* col_sums,
    const float* w_scales, const float* bias, const float* act_scale, int do_relu) {

    const int8_t* B = (const int8_t*)B_packed;
    int K16 = (K + 15) & ~15;

    for (int m = 0; m < M; m++) {
        for (int n = 0; n < N; n++) {
            v128_t acc = wasm_i32x4_splat(0);
            int k = 0;

            for (; k + 16 <= K; k += 16) {
                v128_t va_s8 = wasm_v128_load(A + m * K + k);
                v128_t offset = wasm_i8x16_splat(-128);
                v128_t va_u8 = wasm_i8x16_sub(va_s8, offset);
                v128_t vb = wasm_v128_load(B + n * K16 + k);
                acc = wasm_i32x4_relaxed_dot_i8x16_i7x16_add(va_u8, vb, acc);
            }

            int32_t isum = wasm_i32x4_extract_lane(acc, 0)
                         + wasm_i32x4_extract_lane(acc, 1)
                         + wasm_i32x4_extract_lane(acc, 2)
                         + wasm_i32x4_extract_lane(acc, 3);

            for (; k < K; k++)
                isum += (int32_t)A[m * K + k] * (int32_t)B[n * K16 + k];

            if (col_sums)
                isum -= 128 * col_sums[n];

            /* Dequant to float */
            float val = (float)isum * w_scales[n];
            if (bias) val += bias[n];
            if (do_relu && val < 0) val = 0;

            /* Requant to INT8 */
            float scale = act_scale ? act_scale[n] : 1.0f;
            int q = (int)(val / scale + (val >= 0 ? 0.5f : -0.5f));
            if (q > 127) q = 127;
            if (q < -128) q = -128;
            out[m * N + n] = (int8_t)q;
        }
    }
}
