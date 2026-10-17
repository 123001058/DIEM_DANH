/*
 * Nearest-neighbor 2x upsample for INT8 NHWC tensors.
 * Used in FPN to merge feature maps from different strides.
 *
 * Input:  [H, W, C] int8
 * Output: [2*H, 2*W, C] int8
 *
 * Each input pixel is replicated to a 2x2 block.
 */

#include <stdint.h>
#include <string.h>
#ifdef _OPENMP
#include <omp.h>
#endif

#ifdef __AVX2__
#include <immintrin.h>
#ifdef __wasm_simd128__
#include "../../include/wasm_compat.h"
#endif
#endif

void upsample2x_int8(
    const int8_t* in, int H, int W, int C,
    int8_t* out)
{
    int OW = W * 2;
    size_t row_bytes = (size_t)C * sizeof(int8_t);

    #pragma omp parallel for schedule(static)
    for (int y = 0; y < H; y++) {
        for (int x = 0; x < W; x++) {
            const int8_t* src = in + ((size_t)y * W + x) * C;
            /* Copy to 4 positions: (2y,2x), (2y,2x+1), (2y+1,2x), (2y+1,2x+1) */
            int8_t* dst00 = out + ((size_t)(2*y) * OW + 2*x) * C;
            int8_t* dst01 = out + ((size_t)(2*y) * OW + 2*x + 1) * C;
            int8_t* dst10 = out + ((size_t)(2*y + 1) * OW + 2*x) * C;
            int8_t* dst11 = out + ((size_t)(2*y + 1) * OW + 2*x + 1) * C;

            memcpy(dst00, src, row_bytes);
            memcpy(dst01, src, row_bytes);
            memcpy(dst10, src, row_bytes);
            memcpy(dst11, src, row_bytes);
        }
    }
}

/*
 * Element-wise add of two INT8 tensors with per-channel requantization.
 * Used in FPN: upsampled_feature + lateral_feature → merged
 *
 * out[i] = clip(round((a[i] * a_scale[c] + b[i] * b_scale[c]) * inv_out_scale[c]), -128, 127)
 *
 * NHWC layout: channel is innermost dimension.
 */
void add_int8_per_channel(
    const int8_t* a, const float* a_scale,
    const int8_t* b, const float* b_scale,
    int8_t* out, const float* inv_out_scale,
    int N_pos, int C)
{
    #pragma omp parallel for schedule(static)
    for (int p = 0; p < N_pos; p++) {
        const int8_t* ar = a + (size_t)p * C;
        const int8_t* br = b + (size_t)p * C;
        int8_t* orow = out + (size_t)p * C;

        int c = 0;
#ifdef __AVX2__
        for (; c + 8 <= C; c += 8) {
            /* Load 8 int8 values and sign-extend to int32 */
            __m128i ai8 = _mm_loadl_epi64((const __m128i*)(ar + c));
            __m128i bi8 = _mm_loadl_epi64((const __m128i*)(br + c));
            __m256 af = _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(ai8));
            __m256 bf = _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(bi8));

            __m256 as = _mm256_loadu_ps(a_scale + c);
            __m256 bs = _mm256_loadu_ps(b_scale + c);
            __m256 inv = _mm256_loadu_ps(inv_out_scale + c);

            __m256 result = _mm256_fmadd_ps(af, as, _mm256_mul_ps(bf, bs));
            result = _mm256_mul_ps(result, inv);

            /* Round to nearest */
            __m256 half = _mm256_set1_ps(0.5f);
            __m256 sign = _mm256_and_ps(result, _mm256_castsi256_ps(_mm256_set1_epi32(0x80000000)));
            __m256 rounder = _mm256_or_ps(half, sign);
            __m256i vi = _mm256_cvttps_epi32(_mm256_add_ps(result, rounder));

            /* Clamp to [-128, 127] */
            vi = _mm256_max_epi32(vi, _mm256_set1_epi32(-128));
            vi = _mm256_min_epi32(vi, _mm256_set1_epi32(127));

            /* Pack int32 → int8 */
            __m128i lo = _mm256_castsi256_si128(vi);
            __m128i hi = _mm256_extracti128_si256(vi, 1);
            __m128i i16 = _mm_packs_epi32(lo, hi);
            __m128i i8 = _mm_packs_epi16(i16, i16);
            _mm_storel_epi64((__m128i*)(orow + c), i8);
        }
#endif
        for (; c < C; c++) {
            float fp = (float)ar[c] * a_scale[c] + (float)br[c] * b_scale[c];
            int q = (int)(fp * inv_out_scale[c] + (fp >= 0 ? 0.5f : -0.5f));
            if (q > 127) q = 127;
            if (q < -128) q = -128;
            orow[c] = (int8_t)q;
        }
    }
}
