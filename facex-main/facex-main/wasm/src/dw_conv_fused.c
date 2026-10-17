/*
 * depthwise_conv3x3_int8_fused.c — Fused DW conv + epilogue.
 *
 * Combines depthwise 3x3 INT8 convolution with dequant+bias+ReLU+requant
 * in a single pass, eliminating the intermediate INT32 buffer.
 *
 * For each output position: accumulate 9 kernel positions in registers,
 * then apply epilogue inline → write int8 directly.
 *
 * This saves one full read+write of the INT32 buffer (~6.4MB for 320x320x16).
 */

#include <stdint.h>
#include <string.h>
#include <math.h>

#ifdef __AVX2__
#include <immintrin.h>
#ifdef __wasm_simd128__
#include "../../include/wasm_compat.h"
#endif
#endif

void depthwise_conv3x3_int8_fused(
    const int8_t* in, int H, int W, int C,
    const int8_t* weights_9xC, /* [9, C] layout */
    int8_t* out,               /* [OH, OW, C] int8 output (fused) */
    int stride, int pad,
    const float* w_scale,      /* [C] weight scale per channel */
    const float* bias,         /* [C] bias or NULL */
    const float* act_scale,    /* [C] output activation scale (per-tensor: all same) */
    float in_scale,            /* input activation scale (1.0 with fold) */
    int do_relu)
{
    int OH = (H + 2 * pad - 3) / stride + 1;
    int OW = (W + 2 * pad - 3) / stride + 1;

    /* Precompute combined scale and inv_out per channel */
    float cs_buf[320], inv_buf[320];
    for (int c = 0; c < C; c++) {
        cs_buf[c] = in_scale * w_scale[c];
        inv_buf[c] = 1.0f / (act_scale[c] + 1e-9f);
    }

#ifdef __AVX2__
    /* Preload scale vectors for channels (process 8 at a time) */
    #pragma omp parallel for schedule(static)
    for (int oy = 0; oy < OH; oy++) {
        for (int ox = 0; ox < OW; ox++) {
            int8_t* out_ptr = out + ((size_t)oy * OW + ox) * C;
            int c = 0;

            for (; c + 8 <= C; c += 8) {
                /* Accumulate 9 kernel positions in int32 registers */
                __m256i vacc = _mm256_setzero_si256();

                for (int ky = 0; ky < 3; ky++) {
                    int iy = oy * stride - pad + ky;
                    if (iy < 0 || iy >= H) continue;

                    for (int kx = 0; kx < 3; kx++) {
                        int ix = ox * stride - pad + kx;
                        if (ix < 0 || ix >= W) continue;

                        const int8_t* in_ptr = in + ((size_t)iy * W + ix) * C + c;
                        int ki = ky * 3 + kx;
                        const int8_t* w_ptr = weights_9xC + (size_t)ki * C + c;

                        /* Load 8 int8 input and weight values */
                        __m128i vi8 = _mm_loadl_epi64((const __m128i*)in_ptr);
                        __m128i vw8 = _mm_loadl_epi64((const __m128i*)w_ptr);

                        /* Sign-extend to int16 */
                        __m256i vi16 = _mm256_cvtepi8_epi16(vi8);
                        __m256i vw16 = _mm256_cvtepi8_epi16(vw8);

                        /* Multiply pairs and add adjacent → int32 (8 results) */
                        /* Actually mullo_epi16 gives 16 int16 products, need extend */
                        __m256i prod16 = _mm256_mullo_epi16(vi16, vw16);

                        /* Extend int16 products to int32 */
                        __m128i prod_lo = _mm256_castsi256_si128(prod16);
                        __m128i prod_hi = _mm256_extracti128_si256(prod16, 1);
                        __m256i prod32_lo = _mm256_cvtepi16_epi32(prod_lo);
                        __m256i prod32_hi = _mm256_cvtepi16_epi32(prod_hi);

                        /* We have 16 int32 products but only need 8 channels */
                        /* cvtepi8_epi16 on 8 bytes gives 8 int16 in low 128 bits + 0 in high */
                        /* Wait: _mm_loadl_epi64 loads 8 bytes into low 64 bits of 128-bit */
                        /* _mm256_cvtepi8_epi16 extends 16 bytes from 128-bit to 16 int16 in 256-bit */
                        /* But we only loaded 8 bytes! The high 8 bytes are garbage. */
                        /* Fix: only use the low 8 products */
                        vacc = _mm256_add_epi32(vacc, prod32_lo);
                    }
                }

                /* Epilogue: dequant + bias + relu + requant (8 channels at once) */
                __m256 vfp = _mm256_cvtepi32_ps(vacc);
                __m256 vcs = _mm256_loadu_ps(cs_buf + c);
                vfp = _mm256_mul_ps(vfp, vcs);

                if (bias) vfp = _mm256_add_ps(vfp, _mm256_loadu_ps(bias + c));
                if (do_relu) vfp = _mm256_max_ps(vfp, _mm256_setzero_ps());

                __m256 vinv = _mm256_loadu_ps(inv_buf + c);
                vfp = _mm256_mul_ps(vfp, vinv);

                /* Round to nearest */
                __m256i vi32 = _mm256_cvtps_epi32(vfp);

                /* Clamp [-128, 127] */
                vi32 = _mm256_max_epi32(vi32, _mm256_set1_epi32(-128));
                vi32 = _mm256_min_epi32(vi32, _mm256_set1_epi32(127));

                /* Pack int32 → int8 */
                __m128i lo = _mm256_castsi256_si128(vi32);
                __m128i hi = _mm256_extracti128_si256(vi32, 1);
                __m128i i16 = _mm_packs_epi32(lo, hi);
                __m128i i8 = _mm_packs_epi16(i16, i16);
                /* Store 8 bytes */
                _mm_storel_epi64((__m128i*)(out_ptr + c), i8);
            }

            /* Scalar remainder */
            for (; c < C; c++) {
                int32_t acc = 0;
                for (int ky = 0; ky < 3; ky++) {
                    int iy = oy * stride - pad + ky;
                    if (iy < 0 || iy >= H) continue;
                    for (int kx = 0; kx < 3; kx++) {
                        int ix = ox * stride - pad + kx;
                        if (ix < 0 || ix >= W) continue;
                        int ki = ky * 3 + kx;
                        acc += (int32_t)in[((size_t)iy * W + ix) * C + c]
                             * (int32_t)weights_9xC[(size_t)ki * C + c];
                    }
                }
                float fp = (float)acc * cs_buf[c];
                if (bias) fp += bias[c];
                if (do_relu && fp < 0) fp = 0;
                int q = (int)lrintf(fp * inv_buf[c]);
                if (q > 127) q = 127;
                if (q < -128) q = -128;
                out_ptr[c] = (int8_t)q;
            }
        }
    }
#else
    /* Scalar fallback */
    #pragma omp parallel for schedule(static)
    for (int oy = 0; oy < OH; oy++) {
        for (int ox = 0; ox < OW; ox++) {
            int8_t* out_ptr = out + ((size_t)oy * OW + ox) * C;
            for (int c = 0; c < C; c++) {
                int32_t acc = 0;
                for (int ky = 0; ky < 3; ky++) {
                    int iy = oy * stride - pad + ky;
                    if (iy < 0 || iy >= H) continue;
                    for (int kx = 0; kx < 3; kx++) {
                        int ix = ox * stride - pad + kx;
                        if (ix < 0 || ix >= W) continue;
                        int ki = ky * 3 + kx;
                        acc += (int32_t)in[((size_t)iy * W + ix) * C + c]
                             * (int32_t)weights_9xC[(size_t)ki * C + c];
                    }
                }
                float fp = (float)acc * cs_buf[c];
                if (bias) fp += bias[c];
                if (do_relu && fp < 0) fp = 0;
                int q = (int)lrintf(fp * inv_buf[c]);
                if (q > 127) q = 127;
                if (q < -128) q = -128;
                out_ptr[c] = (int8_t)q;
            }
        }
    }
#endif
}
