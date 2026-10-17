/*
 * Depthwise 3x3 convolution for INT8 inference.
 *
 * NHWC layout: input[H, W, C], output[OH, OW, C]
 * Each channel has its own 3x3 kernel (groups == C).
 *
 * Supports stride 1 and stride 2, padding 1.
 * INT8 input × INT8 weight → INT32 accumulator.
 *
 * The caller applies dequant + bias + activation via fused_epilogue_int8().
 */

#include <stdint.h>
#include <string.h>
#include <stdio.h>
#ifdef _OPENMP
#include <omp.h>
#endif

#ifdef __AVX2__
#include <immintrin.h>
#ifdef __wasm_simd128__
#include "../../include/wasm_compat.h"
#endif
#endif

/*
 * depthwise_conv3x3_int8:
 *   in:      [H, W, C] int8, NHWC layout
 *   weights: [C, 9] int8, per-channel 3x3 filter (row-major)
 *   out:     [OH, OW, C] int32, NHWC layout (accumulator before dequant)
 *
 *   H, W:    input spatial dims
 *   C:       number of channels (= groups)
 *   stride:  1 or 2
 *   pad:     1 (standard 3x3 same padding)
 *
 *   OH = (H + 2*pad - 3) / stride + 1
 *   OW = (W + 2*pad - 3) / stride + 1
 */
void depthwise_conv3x3_int8(
    const int8_t* in, int H, int W, int C,
    const int8_t* weights, /* [C, 9] */
    int32_t* out,
    int stride, int pad)
{
    int OH = (H + 2 * pad - 3) / stride + 1;
    int OW = (W + 2 * pad - 3) / stride + 1;

    #pragma omp parallel for schedule(static) collapse(2)
    for (int oy = 0; oy < OH; oy++) {
        for (int ox = 0; ox < OW; ox++) {
            int32_t* out_ptr = out + ((size_t)oy * OW + ox) * C;

            /* Zero the output for this position */
            memset(out_ptr, 0, C * sizeof(int32_t));

            /* 3x3 kernel loop */
            for (int ky = 0; ky < 3; ky++) {
                int iy = oy * stride - pad + ky;
                if (iy < 0 || iy >= H) continue;

                for (int kx = 0; kx < 3; kx++) {
                    int ix = ox * stride - pad + kx;
                    if (ix < 0 || ix >= W) continue;

                    const int8_t* in_ptr = in + ((size_t)iy * W + ix) * C;
                    int ki = ky * 3 + kx; /* kernel index 0..8 */

                    int c = 0;

#ifdef __AVX2__
                    /* Process 32 channels at a time */
                    for (; c + 32 <= C; c += 32) {
                        __m256i vi = _mm256_loadu_si256((const __m256i*)(in_ptr + c));
                        /* Load 32 weight bytes for this kernel position */
                        /* weights layout: [C, 9], stride = 9 per channel */
                        /* We need weights[c+0..c+31][ki] — scattered! */
                        /* Gather would be slow, so use scalar for now */
                        /* TODO: repack weights to [9, C] layout for vectorization */

                        /* Scalar fallback for scattered weights */
                        for (int cc = 0; cc < 32; cc++) {
                            out_ptr[c + cc] += (int32_t)in_ptr[c + cc] * (int32_t)weights[(c + cc) * 9 + ki];
                        }
                    }
#endif
                    /* Scalar remainder */
                    for (; c < C; c++) {
                        out_ptr[c] += (int32_t)in_ptr[c] * (int32_t)weights[c * 9 + ki];
                    }
                }
            }
        }
    }
}


/*
 * Optimized version with repacked weights: [9, C] layout instead of [C, 9].
 * This allows vectorized loads for all channels at each kernel position.
 */
void depthwise_conv3x3_int8_fast(
    const int8_t* in, int H, int W, int C,
    const int8_t* weights_9xC, /* [9, C] layout — repacked */
    int32_t* out,
    int stride, int pad)
{
    int OH = (H + 2 * pad - 3) / stride + 1;
    int OW = (W + 2 * pad - 3) / stride + 1;
    fprintf(stderr, "    [DW_fast] H=%d W=%d C=%d pad=%d stride=%d -> OH=%d OW=%d out_bytes=%d\n",
            H, W, C, pad, stride, OH, OW, (int)((size_t)OH*OW*C*4)); fflush(stderr);

    #pragma omp parallel for schedule(static) collapse(2)
    for (int oy = 0; oy < OH; oy++) {
        for (int ox = 0; ox < OW; ox++) {
            int32_t* out_ptr = out + ((size_t)oy * OW + ox) * C;
            memset(out_ptr, 0, C * sizeof(int32_t));

            for (int ky = 0; ky < 3; ky++) {
                int iy = oy * stride - pad + ky;
                if (iy < 0 || iy >= H) continue;

                for (int kx = 0; kx < 3; kx++) {
                    int ix = ox * stride - pad + kx;
                    if (ix < 0 || ix >= W) continue;

                    const int8_t* in_ptr = in + ((size_t)iy * W + ix) * C;
                    int ki = ky * 3 + kx;
                    const int8_t* w_ptr = weights_9xC + (size_t)ki * C;

                    int c = 0;

#ifdef __AVX2__
                    /* Process 32 channels at a time with vectorized loads */
                    for (; c + 32 <= C; c += 32) {
                        __m256i vi = _mm256_loadu_si256((const __m256i*)(in_ptr + c));
                        __m256i vw = _mm256_loadu_si256((const __m256i*)(w_ptr + c));

                        /* Multiply int8 × int8 → int16, then accumulate to int32 */
                        /* Split into low and high 128-bit halves */
                        __m128i vi_lo = _mm256_castsi256_si128(vi);
                        __m128i vi_hi = _mm256_extracti128_si256(vi, 1);
                        __m128i vw_lo = _mm256_castsi256_si128(vw);
                        __m128i vw_hi = _mm256_extracti128_si256(vw, 1);

                        /* Extend to int16 and multiply */
                        /* Process 8 elements at a time → int32 */
                        /* Low quarter: elements 0..7 */
                        __m256i vi16_0 = _mm256_cvtepi8_epi16(vi_lo);
                        __m256i vw16_0 = _mm256_cvtepi8_epi16(vw_lo);
                        __m256i prod_0 = _mm256_mullo_epi16(vi16_0, vw16_0);

                        /* Extend int16 products to int32 and accumulate */
                        __m256i prod_lo = _mm256_cvtepi16_epi32(_mm256_castsi256_si128(prod_0));
                        __m256i prod_hi = _mm256_cvtepi16_epi32(_mm256_extracti128_si256(prod_0, 1));

                        __m256i acc_0 = _mm256_loadu_si256((__m256i*)(out_ptr + c));
                        __m256i acc_1 = _mm256_loadu_si256((__m256i*)(out_ptr + c + 8));
                        acc_0 = _mm256_add_epi32(acc_0, prod_lo);
                        acc_1 = _mm256_add_epi32(acc_1, prod_hi);
                        _mm256_storeu_si256((__m256i*)(out_ptr + c), acc_0);
                        _mm256_storeu_si256((__m256i*)(out_ptr + c + 8), acc_1);

                        /* High quarter: elements 8..15 already handled, now 16..23 */
                        __m256i vi16_1 = _mm256_cvtepi8_epi16(vi_hi);
                        __m256i vw16_1 = _mm256_cvtepi8_epi16(vw_hi);
                        __m256i prod_1 = _mm256_mullo_epi16(vi16_1, vw16_1);

                        __m256i prod_lo2 = _mm256_cvtepi16_epi32(_mm256_castsi256_si128(prod_1));
                        __m256i prod_hi2 = _mm256_cvtepi16_epi32(_mm256_extracti128_si256(prod_1, 1));

                        __m256i acc_2 = _mm256_loadu_si256((__m256i*)(out_ptr + c + 16));
                        __m256i acc_3 = _mm256_loadu_si256((__m256i*)(out_ptr + c + 24));
                        acc_2 = _mm256_add_epi32(acc_2, prod_lo2);
                        acc_3 = _mm256_add_epi32(acc_3, prod_hi2);
                        _mm256_storeu_si256((__m256i*)(out_ptr + c + 16), acc_2);
                        _mm256_storeu_si256((__m256i*)(out_ptr + c + 24), acc_3);
                    }

                    /* Process 16 channels */
                    for (; c + 16 <= C; c += 16) {
                        __m128i vi8 = _mm_loadu_si128((const __m128i*)(in_ptr + c));
                        __m128i vw8 = _mm_loadu_si128((const __m128i*)(w_ptr + c));

                        __m256i vi16 = _mm256_cvtepi8_epi16(vi8);
                        __m256i vw16 = _mm256_cvtepi8_epi16(vw8);
                        __m256i prod = _mm256_mullo_epi16(vi16, vw16);

                        __m256i prod_lo3 = _mm256_cvtepi16_epi32(_mm256_castsi256_si128(prod));
                        __m256i prod_hi3 = _mm256_cvtepi16_epi32(_mm256_extracti128_si256(prod, 1));

                        __m256i a0 = _mm256_loadu_si256((__m256i*)(out_ptr + c));
                        __m256i a1 = _mm256_loadu_si256((__m256i*)(out_ptr + c + 8));
                        a0 = _mm256_add_epi32(a0, prod_lo3);
                        a1 = _mm256_add_epi32(a1, prod_hi3);
                        _mm256_storeu_si256((__m256i*)(out_ptr + c), a0);
                        _mm256_storeu_si256((__m256i*)(out_ptr + c + 8), a1);
                    }
#endif
                    for (; c < C; c++) {
                        out_ptr[c] += (int32_t)in_ptr[c] * (int32_t)w_ptr[c];
                    }
                }
            }
        }
    }
}


/*
 * Repack weights from [C, 9] to [9, C] layout.
 * Call once at model load time.
 */
void repack_dw_weights(const int8_t* src_Cx9, int8_t* dst_9xC, int C)
{
    for (int c = 0; c < C; c++) {
        for (int ki = 0; ki < 9; ki++) {
            dst_9xC[ki * C + c] = src_Cx9[c * 9 + ki];
        }
    }
}
