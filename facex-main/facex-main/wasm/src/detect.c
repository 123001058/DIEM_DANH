/*
 * retinaface_forward_int8.c — Native C99 INT8 inference for det_500m.
 *
 * Full pipeline: image → backbone → FPN → 3 detection heads → face results.
 * Reuses FastFace kernels + new depthwise + upsample.
 *
 * See EXECUTION_MAP.md for tensor flow details.
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <time.h>
#ifdef _OPENMP
#include <omp.h>
#endif
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif

/* ============ Model structures ============ */

#define MAX_LAYERS 64

typedef struct {
    uint8_t type;     /* 0=STD, 1=DW, 2=PW */
    uint16_t cin, cout;
    uint8_t kh, kw, sh, sw, pad;
    int8_t*  w;       /* INT8 weights */
    int      w_size;
    float*   w_scale; /* per-channel [cout] */
    float*   bias;    /* FP32 [cout] or NULL */
    float*   act_scale; /* activation scale [cout] */
    int      n_act;
    /* c8-packed GEMM data (pre-packed at load time for PW/STD layers) */
    void*    packed_w;  /* c8-format packed weights, or NULL for DW */
    int32_t* col_sums;  /* compensation array [cout], or NULL */
    int      gemm_K;    /* K dimension for GEMM (Cin for PW, Cin*Kh*Kw for STD) */
} Layer;

typedef struct {
    int n_layers;
    Layer layers[MAX_LAYERS];
} Model;

/* INT8 tensor: NHWC layout */
typedef struct { int8_t* d; int H, W, C; } T8;
/* INT32 accumulator */
typedef struct { int32_t* d; int H, W, C; } T32;
/* FP32 output */
typedef struct { float* d; int H, W, C; } TF;

static T8  t8_alloc(int H, int W, int C)  { T8 t={(int8_t*)malloc((size_t)H*W*C),H,W,C}; return t; }
static T32 t32_alloc(int H, int W, int C) { T32 t={(int32_t*)malloc((size_t)H*W*C*4),H,W,C}; return t; }
static TF  tf_alloc(int H, int W, int C)  { TF t={calloc((size_t)H*W*C,4),H,W,C}; return t; }
static void t8_free(T8* t) { free(t->d); t->d=NULL; }
static void t32_free(T32* t) { free(t->d); t->d=NULL; }
static void tf_free(TF* t) { free(t->d); t->d=NULL; }

/* ============ External kernels ============ */

extern void depthwise_conv3x3_int8_fast(
    const int8_t* in, int H, int W, int C,
    const int8_t* w, int32_t* out, int stride, int pad);

extern void upsample2x_int8(const int8_t* in, int H, int W, int C, int8_t* out);

extern void depthwise_conv3x3_int8_fused(
    const int8_t* in, int H, int W, int C,
    const int8_t* w, int8_t* out, int stride, int pad,
    const float* w_scale, const float* bias, const float* act_scale,
    float in_scale, int do_relu);

extern void add_int8_per_channel(
    const int8_t* a, const float* a_scale,
    const int8_t* b, const float* b_scale,
    int8_t* out, const float* inv_out,
    int N_pos, int C);

/* ============ Fast GEMM (external) ============ */
extern void gemm_int8_fast(const int8_t* A, int M, int K, const int8_t* B, int N, int32_t* C);

/* ============ c8-packed GEMM (external) ============ */
extern void int8_gemm_4x8c8(
    const int8_t* A, int M, int K, int N,
    const void* B_packed, int32_t* C, const int32_t* col_sums);
extern void pack_weights_4x8c8(
    const int8_t* weights, const float* bias, int K, int Cout,
    void* packed_w, int32_t* col_sums);
extern int packed_weights_size_4x8c8(int K, int Cout);
extern void int8_gemm_4x8c8_fused(
    const int8_t* A, int M, int K, int N,
    const void* B_packed, int8_t* out, const int32_t* col_sums,
    const float* w_scales, const float* bias, const float* act_scale, int do_relu);

/* ============ Optimized GEMM for 1x1 pointwise conv ============ */
#ifdef __AVX2__
#include <immintrin.h>
#ifdef __wasm_simd128__
#include "../../include/wasm_compat.h"
#endif
#endif

/* Pointwise 1x1 as c8-packed GEMM */
static void gemm_pw_int8_c8(
    const int8_t* in, int N, int Cin,
    const void* packed_w, const int32_t* col_sums, int Cout,
    int32_t* out)
{
    int8_gemm_4x8c8(in, N, Cin, Cout, packed_w, out, col_sums);
}

/* Specialized stem conv: STD 3→16 3x3 s2 pad=1
 * "Activation stationary": for each output position, gather 27 input values,
 * then accumulate across all 16 output channels using pre-transposed weights.
 * Avoids im2col allocation (2.76MB) and GEMM overhead for tiny K=27. */
static void conv_stem_3x16(
    const int8_t* in, int H, int W,
    const int8_t* w_orig, /* [16, 3*3*3] row-major */
    int32_t* out)
{
    int OH = (H + 2 - 3) / 2 + 1;
    int OW = (W + 2 - 3) / 2 + 1;

    /* Pre-transpose weights: w_T[27][16] from w[16][27], padded to [27][16] */
    int8_t w_T[27][16] __attribute__((aligned(32)));
    memset(w_T, 0, sizeof(w_T));
    for (int co = 0; co < 16; co++)
        for (int k = 0; k < 27; k++)
            w_T[k][co] = w_orig[co * 27 + k];

#ifdef __AVX2__
    /* Pack weights for vpmaddwd: for each spatial position (ky,kx),
     * pack 3 channels + 1 zero as int16 pairs for 8 output channels.
     * w_packed[9][2]: lo=channels 0-7, hi=channels 8-15
     * Each __m256i has 16 int16: [w0_c0, w0_c1, w0_c2, 0, w1_c0, w1_c1, w1_c2, 0,
     *                              w2_c0, w2_c1, w2_c2, 0, w3_c0, w3_c1, w3_c2, 0]
     * Then vpmaddwd with [a_c0, a_c1, a_c2, 0, ...] gives 8 partial sums.
     * But that's 4 output channels per 256-bit, need 2 loads for 8. Hmm, suboptimal.
     *
     * Simpler: keep original per-channel approach but process 3 ci in unrolled loop. */
    __m256i w16_lo[27], w16_hi[27];
    for (int k = 0; k < 27; k++) {
        __m128i v8 = _mm_loadu_si128((const __m128i*)w_T[k]);
        w16_lo[k] = _mm256_cvtepi8_epi16(v8);
        __m128i v8_hi = _mm_srli_si128(v8, 8);
        w16_hi[k] = _mm256_cvtepi8_epi16(v8_hi);
    }
#endif

    #pragma omp parallel for schedule(static)
    for (int oy = 0; oy < OH; oy++) {
        for (int ox = 0; ox < OW; ox++) {
            int32_t* out_ptr = out + ((size_t)oy * OW + ox) * 16;

#ifdef __AVX2__
            __m256i acc_lo = _mm256_setzero_si256();
            __m256i acc_hi = _mm256_setzero_si256();

            for (int ky = 0; ky < 3; ky++) {
                int iy = oy * 2 - 1 + ky;
                if (iy < 0 || iy >= H) continue; /* skip padding rows entirely */
                for (int kx = 0; kx < 3; kx++) {
                    int ix = ox * 2 - 1 + kx;
                    if (ix < 0 || ix >= W) continue;
                    int ki = ky * 9 + kx * 3;
                    const int8_t* pix = in + ((size_t)iy * W + ix) * 3;

                    /* Unroll 3 channels */
                    __m256i va0 = _mm256_set1_epi16((int16_t)pix[0]);
                    __m256i va1 = _mm256_set1_epi16((int16_t)pix[1]);
                    __m256i va2 = _mm256_set1_epi16((int16_t)pix[2]);

                    /* Low 8 channels */
                    __m256i p0 = _mm256_mullo_epi16(va0, w16_lo[ki]);
                    __m256i p1 = _mm256_mullo_epi16(va1, w16_lo[ki+1]);
                    __m256i p2 = _mm256_mullo_epi16(va2, w16_lo[ki+2]);
                    /* Sum 3 int16 products: max |sum| = 3*127*127 = 48387 > 32767!
                     * But after mullo_epi16 each product is int16 (wraps at ±32768).
                     * Products are ≤ 127*127=16129, so each fits in int16.
                     * Sum of 3: max 48387 overflows. Sum of 2 fits: max 32258.
                     * So: sum 2, extend, add third. */
                    __m256i sum01 = _mm256_add_epi16(p0, p1); /* fits in int16 */
                    acc_lo = _mm256_add_epi32(acc_lo,
                        _mm256_cvtepi16_epi32(_mm256_castsi256_si128(sum01)));
                    acc_lo = _mm256_add_epi32(acc_lo,
                        _mm256_cvtepi16_epi32(_mm256_castsi256_si128(p2)));

                    /* High 8 channels */
                    p0 = _mm256_mullo_epi16(va0, w16_hi[ki]);
                    p1 = _mm256_mullo_epi16(va1, w16_hi[ki+1]);
                    p2 = _mm256_mullo_epi16(va2, w16_hi[ki+2]);
                    sum01 = _mm256_add_epi16(p0, p1);
                    acc_hi = _mm256_add_epi32(acc_hi,
                        _mm256_cvtepi16_epi32(_mm256_castsi256_si128(sum01)));
                    acc_hi = _mm256_add_epi32(acc_hi,
                        _mm256_cvtepi16_epi32(_mm256_castsi256_si128(p2)));
                }
            }

            _mm256_storeu_si256((__m256i*)(out_ptr), acc_lo);
            _mm256_storeu_si256((__m256i*)(out_ptr + 8), acc_hi);
#else
            memset(out_ptr, 0, 16 * sizeof(int32_t));
            int ki = 0;
            for (int ky = 0; ky < 3; ky++) {
                int iy = oy * 2 - 1 + ky;
                for (int kx = 0; kx < 3; kx++) {
                    int ix = ox * 2 - 1 + kx;
                    for (int ci = 0; ci < 3; ci++, ki++) {
                        int8_t a = 0;
                        if (iy >= 0 && iy < H && ix >= 0 && ix < W)
                            a = in[((size_t)iy * W + ix) * 3 + ci];
                        for (int co = 0; co < 16; co++)
                            out_ptr[co] += (int32_t)a * (int32_t)w_T[ki][co];
                    }
                }
            }
#endif
        }
    }
}

/* im2col: extract patches into matrix for 3x3 conv → GEMM */
static void im2col_int8(
    const int8_t* in, int H, int W, int Cin,
    int Kh, int Kw, int stride, int pad,
    int8_t* col) /* output: [OH*OW, Cin*Kh*Kw] */
{
    int OH = (H + 2*pad - Kh) / stride + 1;
    int OW = (W + 2*pad - Kw) / stride + 1;
    int K = Cin * Kh * Kw;

    for (int oy = 0; oy < OH; oy++) {
        for (int ox = 0; ox < OW; ox++) {
            int8_t* col_row = col + ((size_t)oy * OW + ox) * K;
            int idx = 0;
            for (int ky = 0; ky < Kh; ky++) {
                int iy = oy * stride - pad + ky;
                for (int kx = 0; kx < Kw; kx++) {
                    int ix = ox * stride - pad + kx;
                    if (iy >= 0 && iy < H && ix >= 0 && ix < W) {
                        const int8_t* src = in + ((size_t)iy * W + ix) * Cin;
                        memcpy(col_row + idx, src, Cin);
                    } else {
                        memset(col_row + idx, 0, Cin);
                    }
                    idx += Cin;
                }
            }
        }
    }
}

/* Standard 3x3 conv via im2col + c8-packed GEMM */
static void conv_std_int8_gemm_c8(
    const int8_t* in, int H, int W, int Cin,
    const void* packed_w, const int32_t* col_sums,
    int Cout, int Kh, int Kw,
    int stride, int pad,
    int32_t* out)
{
    int OH = (H + 2*pad - Kh) / stride + 1;
    int OW = (W + 2*pad - Kw) / stride + 1;
    int K = Cin * Kh * Kw;
    int M = OH * OW;

    /* im2col */
    int8_t* col = (int8_t*)malloc((size_t)M * K);
    im2col_int8(in, H, W, Cin, Kh, Kw, stride, pad, col);

    /* GEMM: col[M, K] × packed_w → out[M, Cout] */
    int8_gemm_4x8c8(col, M, K, Cout, packed_w, out, col_sums);

    free(col);
}

/* Standard 3x3 conv with AVX2 inner loop (fallback) */
static void conv_std_int8(
    const int8_t* in, int H, int W, int Cin,
    const int8_t* w, int Cout, int Kh, int Kw,
    int stride, int pad,
    int32_t* out)
{
    int OH = (H + 2*pad - Kh) / stride + 1;
    int OW = (W + 2*pad - Kw) / stride + 1;

    #pragma omp parallel for schedule(dynamic)
    for (int oy = 0; oy < OH; oy++) {
        for (int ox = 0; ox < OW; ox++) {
            int32_t* out_ptr = out + ((size_t)oy * OW + ox) * Cout;
            memset(out_ptr, 0, Cout * sizeof(int32_t));

            for (int ky = 0; ky < Kh; ky++) {
                int iy = oy * stride - pad + ky;
                if (iy < 0 || iy >= H) continue;
                for (int kx = 0; kx < Kw; kx++) {
                    int ix = ox * stride - pad + kx;
                    if (ix < 0 || ix >= W) continue;

                    const int8_t* in_ptr = in + ((size_t)iy * W + ix) * Cin;
                    int k_offset = (ky * Kw + kx) * Cin;

                    for (int co = 0; co < Cout; co++) {
                        const int8_t* ww = w + (size_t)co * Kh * Kw * Cin + k_offset;
                        int32_t sum = 0;
                        int ci = 0;

#ifdef __AVX2__
                        /* Vectorize inner product along Cin dimension */
                        __m256i vacc = _mm256_setzero_si256();
                        for (; ci + 16 <= Cin; ci += 16) {
                            __m128i vi8 = _mm_loadu_si128((const __m128i*)(in_ptr + ci));
                            __m128i vw8 = _mm_loadu_si128((const __m128i*)(ww + ci));
                            /* Extend to 16-bit and multiply */
                            __m256i vi16 = _mm256_cvtepi8_epi16(vi8);
                            __m256i vw16 = _mm256_cvtepi8_epi16(vw8);
                            __m256i prod = _mm256_mullo_epi16(vi16, vw16);
                            /* Extend to 32-bit and accumulate */
                            __m256i prod_lo = _mm256_cvtepi16_epi32(_mm256_castsi256_si128(prod));
                            __m256i prod_hi = _mm256_cvtepi16_epi32(_mm256_extracti128_si256(prod, 1));
                            vacc = _mm256_add_epi32(vacc, prod_lo);
                            vacc = _mm256_add_epi32(vacc, prod_hi);
                        }
                        /* Horizontal sum */
                        __m128i lo = _mm256_castsi256_si128(vacc);
                        __m128i hi = _mm256_extracti128_si256(vacc, 1);
                        lo = _mm_add_epi32(lo, hi);
                        lo = _mm_add_epi32(lo, _mm_srli_si128(lo, 8));
                        lo = _mm_add_epi32(lo, _mm_srli_si128(lo, 4));
                        sum = _mm_cvtsi128_si32(lo);
#endif
                        for (; ci < Cin; ci++) {
                            sum += (int32_t)in_ptr[ci] * (int32_t)ww[ci];
                        }
                        out_ptr[co] += sum;
                    }
                }
            }
        }
    }
}

/* Dequant + bias + ReLU + requant epilogue — AVX2 vectorized */
static void epilogue_relu_requant(
    const int32_t* acc, int N_pos, int Cout,
    float in_scale, const float* w_scales, const float* bias,
    const float* out_act_scale,
    int8_t* out, int do_relu)
{
    /* Precompute combined scale and inv_out per channel — stack alloc for small Cout */
    float combined_scale_buf[512], inv_out_buf[512];
    float* combined_scale = (Cout <= 512) ? combined_scale_buf : (float*)malloc(Cout * sizeof(float));
    float* inv_out = (Cout <= 512) ? inv_out_buf : (float*)malloc(Cout * sizeof(float));
    for (int c = 0; c < Cout; c++) {
        combined_scale[c] = in_scale * w_scales[c];
        inv_out[c] = 1.0f / (out_act_scale[c] + 1e-9f);
    }

    #pragma omp parallel for schedule(static)
    for (int p = 0; p < N_pos; p++) {
        const int32_t* row = acc + (size_t)p * Cout;
        int8_t* orow = out + (size_t)p * Cout;
        int c = 0;

#ifdef __AVX2__
        __m256 vzero = _mm256_setzero_ps();
        __m256 vhalf = _mm256_set1_ps(0.5f);

        for (; c + 8 <= Cout; c += 8) {
            /* Load 8 int32 accumulators → float */
            __m256i vi32 = _mm256_loadu_si256((const __m256i*)(row + c));
            __m256 vfp = _mm256_cvtepi32_ps(vi32);

            /* Multiply by combined scale */
            __m256 vcs = _mm256_loadu_ps(combined_scale + c);
            vfp = _mm256_mul_ps(vfp, vcs);

            /* Add bias */
            if (bias) vfp = _mm256_add_ps(vfp, _mm256_loadu_ps(bias + c));

            /* ReLU: max(0, x) */
            if (do_relu) vfp = _mm256_max_ps(vfp, vzero);

            /* Requantize: multiply by inv_out, round, clamp to int8 */
            __m256 vio = _mm256_loadu_ps(inv_out + c);
            vfp = _mm256_mul_ps(vfp, vio);

            /* Round to nearest */
            __m256 sign_bit = _mm256_and_ps(vfp, _mm256_castsi256_ps(_mm256_set1_epi32(0x80000000)));
            __m256 rounder = _mm256_or_ps(vhalf, sign_bit);
            __m256i vi = _mm256_cvttps_epi32(_mm256_add_ps(vfp, rounder));

            /* Clamp [-128, 127] */
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
        for (; c < Cout; c++) {
            float fp = (float)row[c] * combined_scale[c];
            if (bias) fp += bias[c];
            if (do_relu && fp < 0) fp = 0;
            int q = (int)lrintf(fp * inv_out[c]);
            if (q > 127) q = 127;
            if (q < -128) q = -128;
            orow[c] = (int8_t)q;
        }
    }
    if (Cout > 512) { free(combined_scale); free(inv_out); }
}

/* Dequant + bias (no requant) → FP32 output for detection heads */
static void epilogue_to_fp32(
    const int32_t* acc, int N_pos, int Cout,
    float in_scale, const float* w_scales, const float* bias,
    float* out)
{
    for (int p = 0; p < N_pos; p++) {
        const int32_t* row = acc + (size_t)p * Cout;
        float* orow = out + (size_t)p * Cout;
        for (int c = 0; c < Cout; c++) {
            float fp = (float)row[c] * in_scale * w_scales[c];
            if (bias) fp += bias[c];
            orow[c] = fp;
        }
    }
}

/* ============ Run one conv layer ============ */

/* Per-layer profiling (enabled via global flag) */
static int g_profile = 0;
static double g_layer_ms[MAX_LAYERS];
static int g_layer_idx = 0;

static double time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6;
}

static T8 run_conv(Layer* L, T8 input, float in_scale, int do_relu) {
    int OH = (input.H + 2*L->pad - L->kh) / L->sh + 1;
    int OW = (input.W + 2*L->pad - L->kw) / L->sw + 1;

    double t0 = g_profile ? time_ms() : 0;

    /* Fused DW path: conv + epilogue in single pass, no int32 buffer */
    if (L->type == 1 && L->kh == 3 && L->kw == 3) {
        T8 out = t8_alloc(OH, OW, L->cout);
        depthwise_conv3x3_int8_fused(
            input.d, input.H, input.W, input.C,
            L->w, out.d, L->sh, L->pad,
            L->w_scale, L->bias, L->act_scale, in_scale, do_relu);

        if (g_profile && g_layer_idx < MAX_LAYERS)
            g_layer_ms[g_layer_idx++] = time_ms() - t0;
        return out;
    }

    /* Fused path: PW conv with c8 GEMM — skip int32 intermediate buffer */
    if (L->packed_w && L->type == 2 && L->kh == 1 && L->kw == 1 && L->sh == 1) {
        T8 out = t8_alloc(OH, OW, L->cout);
        int8_gemm_4x8c8_fused(
            input.d, OH * OW, input.C, L->cout,
            L->packed_w, out.d, L->col_sums,
            L->w_scale, L->bias, L->act_scale, do_relu);

        if (g_profile && g_layer_idx < MAX_LAYERS)
            g_layer_ms[g_layer_idx++] = time_ms() - t0;
        return out;
    }

    T32 acc = t32_alloc(OH, OW, L->cout);

    if (L->type == 1) { /* DW */
        depthwise_conv3x3_int8_fast(input.d, input.H, input.W, input.C,
                                     L->w, acc.d, L->sh, L->pad);
    } else if (L->type == 0 && L->cin == 3 && L->cout == 16 &&
               L->kh == 3 && L->kw == 3 && L->sh == 2) {
        /* Stem conv — still needs int32 buffer for now */
        conv_stem_3x16(input.d, input.H, input.W, L->w, acc.d);
    } else if (L->packed_w && L->kh >= 3) {
        /* STD conv via im2col + fused c8 GEMM (skip int32 buffer) */
        int K = L->cin * L->kh * L->kw;
        int M = OH * OW;
        int8_t* col = (int8_t*)malloc((size_t)M * K);
        im2col_int8(input.d, input.H, input.W, input.C,
                    L->kh, L->kw, L->sh, L->pad, col);
        T8 out_fused = t8_alloc(OH, OW, L->cout);
        int8_gemm_4x8c8_fused(col, M, K, L->cout,
                               L->packed_w, out_fused.d, L->col_sums,
                               L->w_scale, L->bias, L->act_scale, do_relu);
        free(col);
        if (g_profile && g_layer_idx < MAX_LAYERS)
            g_layer_ms[g_layer_idx++] = time_ms() - t0;
        return out_fused;
    } else if (L->packed_w) {
        /* Other conv via im2col + c8 GEMM */
        conv_std_int8_gemm_c8(input.d, input.H, input.W, input.C,
                              L->packed_w, L->col_sums,
                              L->cout, L->kh, L->kw, L->sh, L->pad, acc.d);
    } else {
        conv_std_int8(input.d, input.H, input.W, input.C,
                      L->w, L->cout, L->kh, L->kw, L->sh, L->pad, acc.d);
    }

    T8 out = t8_alloc(OH, OW, L->cout);
    epilogue_relu_requant(acc.d, OH * OW, L->cout,
                          in_scale, L->w_scale, L->bias,
                          L->act_scale, out.d, do_relu);
    t32_free(&acc);

    if (g_profile && g_layer_idx < MAX_LAYERS) {
        g_layer_ms[g_layer_idx++] = time_ms() - t0;
    }

    return out;
}

/* Run conv with FP32 output (for detection head finals) */
static TF run_conv_fp32(Layer* L, T8 input, float in_scale) {
    int OH = (input.H + 2*L->pad - L->kh) / L->sh + 1;
    int OW = (input.W + 2*L->pad - L->kw) / L->sw + 1;

    T32 acc = t32_alloc(OH, OW, L->cout);
    if (L->packed_w) {
        if (L->type == 2 && L->kh == 1 && L->kw == 1 && L->sh == 1) {
            gemm_pw_int8_c8(input.d, input.H * input.W, input.C,
                            L->packed_w, L->col_sums, L->cout, acc.d);
        } else {
            conv_std_int8_gemm_c8(input.d, input.H, input.W, input.C,
                                  L->packed_w, L->col_sums,
                                  L->cout, L->kh, L->kw, L->sh, L->pad, acc.d);
        }
    } else {
        conv_std_int8(input.d, input.H, input.W, input.C,
                      L->w, L->cout, L->kh, L->kw, L->sh, L->pad, acc.d);
    }

    TF out = tf_alloc(OH, OW, L->cout);
    epilogue_to_fp32(acc.d, OH * OW, L->cout,
                     in_scale, L->w_scale, L->bias, out.d);
    t32_free(&acc);
    return out;
}

/* ============ Input quantization ============ */

static T8 quantize_input(const float* rgb_hwc, int H, int W) {
    T8 out = t8_alloc(H, W, 3);
    int n = H * W * 3;
    int i = 0;
#ifdef __AVX2__
    __m256 v127 = _mm256_set1_ps(127.0f);
    for (; i + 8 <= n; i += 8) {
        __m256 vf = _mm256_loadu_ps(rgb_hwc + i);
        __m256i vi = _mm256_cvtps_epi32(_mm256_mul_ps(vf, v127));
        vi = _mm256_max_epi32(vi, _mm256_set1_epi32(-128));
        vi = _mm256_min_epi32(vi, _mm256_set1_epi32(127));
        /* Pack int32 → int8 */
        __m128i lo = _mm256_castsi256_si128(vi);
        __m128i hi = _mm256_extracti128_si256(vi, 1);
        __m128i i16 = _mm_packs_epi32(lo, hi);
        __m128i i8 = _mm_packs_epi16(i16, i16);
        *(int64_t*)(out.d + i) = _mm_extract_epi64(i8, 0);
    }
#endif
    for (; i < n; i++) {
        int q = (int)lrintf(rgb_hwc[i] * 127.0f);
        if (q > 127) q = 127; if (q < -128) q = -128;
        out.d[i] = (int8_t)q;
    }
    return out;
}

/* ============ Load DET8 ============ */

static int load_model(const char* path, Model* m) {
    FILE* f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "Cannot open %s\n", path); return -1; }

    char magic[4]; fread(magic, 1, 4, f);
    if (memcmp(magic, "DET8", 4)) { fclose(f); return -1; }
    uint8_t ver; fread(&ver, 1, 1, f);
    uint32_t nl; fread(&nl, 4, 1, f);
    m->n_layers = (int)nl;

    for (int i = 0; i < m->n_layers; i++) {
        Layer* L = &m->layers[i];
        fread(&L->type, 1, 1, f);
        fread(&L->cin, 2, 1, f); fread(&L->cout, 2, 1, f);
        fread(&L->kh, 1, 1, f); fread(&L->kw, 1, 1, f);
        fread(&L->sh, 1, 1, f); fread(&L->sw, 1, 1, f);
        fread(&L->pad, 1, 1, f);

        uint32_t ws; fread(&ws, 4, 1, f);
        L->w_size = ws; L->w = malloc(ws); fread(L->w, 1, ws, f);

        uint32_t ns; fread(&ns, 4, 1, f);
        L->w_scale = malloc(ns * 4); fread(L->w_scale, 4, ns, f);

        uint32_t nb; fread(&nb, 4, 1, f);
        if (nb) { L->bias = malloc(nb * 4); fread(L->bias, 4, nb, f); }
        else L->bias = NULL;

        uint32_t na; fread(&na, 4, 1, f);
        L->n_act = na; L->act_scale = malloc(na * 4); fread(L->act_scale, 4, na, f);

        /* Pre-pack weights for c8 GEMM (non-DW layers) */
        L->packed_w = NULL;
        L->col_sums = NULL;
        L->gemm_K = 0;
        if (L->type != 1) { /* PW (type=2) or STD (type=0) */
            int K;
            if (L->type == 2 && L->kh == 1 && L->kw == 1) {
                K = L->cin;  /* Pointwise: K = Cin */
            } else {
                K = L->cin * L->kh * L->kw;  /* Standard: K = Cin*Kh*Kw */
            }
            L->gemm_K = K;
            int pw_size = packed_weights_size_4x8c8(K, L->cout);
            L->packed_w = malloc(pw_size);
            L->col_sums = (int32_t*)calloc(((L->cout + 7) & ~7), sizeof(int32_t));
            pack_weights_4x8c8(L->w, NULL, K, L->cout,
                               L->packed_w, L->col_sums);
        }
    }
    fclose(f);
    fprintf(stderr, "DET8: %d layers loaded (c8-packed GEMM)\n", m->n_layers);
    return 0;
}

/* ============ Get activation scale (scalar approximation) ============ */
static float mean_scale(float* scales, int n) {
    float sum = 0;
    for (int i = 0; i < n; i++) sum += scales[i];
    return sum / n;
}
/* Use geometric mean — better balance for per-channel variation */
static float geomean_scale(float* scales, int n) {
    double log_sum = 0;
    int count = 0;
    for (int i = 0; i < n; i++) {
        if (scales[i] > 1e-9f) {
            log_sum += log((double)scales[i]);
            count++;
        }
    }
    return count > 0 ? (float)exp(log_sum / count) : 1e-6f;
}

/* ============ Main forward pass ============ */

typedef struct {
    float* cls;  /* [N, 1] after sigmoid */
    float* bbox; /* [N, 4] */
    float* kps;  /* [N, 10] */
    int N;
} HeadOutput;

/* Pre-allocated workspace to avoid malloc during inference */
typedef struct {
    int8_t*  buf_a;     /* ping buffer for INT8 tensors */
    int8_t*  buf_b;     /* pong buffer */
    int32_t* acc;       /* INT32 accumulator */
    int8_t*  im2col;    /* im2col scratch */
    size_t   buf_size;  /* size of each ping/pong buffer */
    size_t   acc_size;
    size_t   col_size;
} Workspace;

static Workspace ws = {0};

static void init_workspace(int max_H, int max_W, int max_C) {
    /* Allocate once, reuse forever */
    ws.buf_size = (size_t)max_H * max_W * max_C;
    ws.acc_size = (size_t)max_H * max_W * max_C * sizeof(int32_t);
    ws.col_size = (size_t)max_H * max_W * max_C * 9; /* 3x3 kernel worst case */
    ws.buf_a   = (int8_t*)calloc(ws.buf_size, 1);
    ws.buf_b   = (int8_t*)calloc(ws.buf_size, 1);
    ws.acc     = (int32_t*)calloc(ws.buf_size, sizeof(int32_t));
    ws.im2col  = (int8_t*)calloc(ws.col_size, 1);
}

static void forward(Model* m, const float* input_hwc, int H, int W,
                     HeadOutput* head8, HeadOutput* head16, HeadOutput* head32) {

    /* Init workspace on first call */
    if (!ws.buf_a) init_workspace(H, W, 320); /* max 320×320×288 won't exceed this */

    /* With v2 folded weights, in_scale = 1.0 everywhere.
     * Per-channel activation variation is absorbed into weights.
     * act_scale is per-tensor (same value for all channels). */
    float input_scale = 1.0f;

    /* Quantize input */
    T8 x = quantize_input(input_hwc, H, W);

    /* ====== BACKBONE layers 0-28 ====== */
    /* Each conv: x → conv → relu → x' */
    /* Save feature_8 (after layer 12), feature_16 (after layer 16), feature_32 (after layer 28) */

    T8 feature_8 = {0}, feature_16 = {0};
    int x_is_saved = 0;

    /* Pre-allocate workspace for DW→PW intermediate (reused across pairs) */
    size_t max_intermediate = (size_t)320 * 320 * 288; /* covers all backbone sizes */
    int8_t* dw_pw_buf = (int8_t*)malloc(max_intermediate);

    for (int i = 0; i <= 28; i++) {
        Layer* L = &m->layers[i];
        Layer* L_next = (i + 1 <= 28) ? &m->layers[i + 1] : NULL;

        /* Detect DW+PW pair and fuse: DW output goes to workspace, PW reads from it */
        if (L->type == 1 && L_next && L_next->type == 2 &&
            L->kh == 3 && L_next->kh == 1) {
            int OH_dw = (x.H + 2*L->pad - 3) / L->sh + 1;
            int OW_dw = (x.W + 2*L->pad - 3) / L->sw + 1;

            double t0 = g_profile ? time_ms() : 0;

            /* DW → workspace buffer (no malloc) */
            depthwise_conv3x3_int8_fused(
                x.d, x.H, x.W, x.C,
                L->w, dw_pw_buf, L->sh, L->pad,
                L->w_scale, L->bias, L->act_scale, 1.0f, 1);

            if (g_profile && g_layer_idx < MAX_LAYERS)
                g_layer_ms[g_layer_idx++] = time_ms() - t0;

            /* PW reads from workspace, outputs to new alloc */
            T8 pw_out = t8_alloc(OH_dw, OW_dw, L_next->cout);
            t0 = g_profile ? time_ms() : 0;

            int8_gemm_4x8c8_fused(
                dw_pw_buf, OH_dw * OW_dw, L_next->cin, L_next->cout,
                L_next->packed_w, pw_out.d, L_next->col_sums,
                L_next->w_scale, L_next->bias, L_next->act_scale, 1);

            if (g_profile && g_layer_idx < MAX_LAYERS)
                g_layer_ms[g_layer_idx++] = time_ms() - t0;

            if (!x_is_saved) t8_free(&x);
            x_is_saved = 0;
            x = pw_out;
            i++; /* skip PW layer (already processed) */
        } else {
            T8 out = run_conv(L, x, 1.0f, 1);
            if (!x_is_saved) t8_free(&x);
            x_is_saved = 0;
            x = out;
        }

        if (i == 12) {
            feature_8 = t8_alloc(x.H, x.W, x.C);
            memcpy(feature_8.d, x.d, (size_t)x.H * x.W * x.C);
        }
        if (i == 16) {
            feature_16 = t8_alloc(x.H, x.W, x.C);
            memcpy(feature_16.d, x.d, (size_t)x.H * x.W * x.C);
        }
    }
    free(dw_pw_buf);
    T8 feature_32 = x;

    /* ====== FPN LATERALS layers 29-31 ====== */
    T8 lat8  = run_conv(&m->layers[29], feature_8, 1.0f, 0);
    T8 lat16 = run_conv(&m->layers[30], feature_16, 1.0f, 0);
    T8 lat32 = run_conv(&m->layers[31], feature_32, 1.0f, 0);

    float lat8_ms  = mean_scale(m->layers[29].act_scale, m->layers[29].n_act);
    float lat16_ms = mean_scale(m->layers[30].act_scale, m->layers[30].n_act);
    float lat32_ms = mean_scale(m->layers[31].act_scale, m->layers[31].n_act);

    t8_free(&feature_8); t8_free(&feature_16); t8_free(&feature_32);

    /* ====== FPN TOP-DOWN MERGE (fused upsample+add) ====== */
    float lat16_s = m->layers[30].act_scale[0];
    float lat32_s = m->layers[31].act_scale[0];
    float lat8_s  = m->layers[29].act_scale[0];
    float inv16 = 1.0f / (lat16_s + 1e-9f);
    float inv8  = 1.0f / (lat8_s + 1e-9f);

    /* Fused upsample(lat32) + add(lat16) → merged16 — AVX2 for C=16 */
    T8 merged16 = t8_alloc(lat16.H, lat16.W, lat16.C);
    {
        int C = lat16.C, H16 = lat16.H, W16 = lat16.W;
#ifdef __AVX2__
        __m256 va_sc = _mm256_set1_ps(lat16_s);
        __m256 vb_sc = _mm256_set1_ps(lat32_s);
        __m256 vinv = _mm256_set1_ps(inv16);
#endif
        #pragma omp parallel for schedule(static)
        for (int y = 0; y < H16; y++) {
            for (int x = 0; x < W16; x++) {
                const int8_t* a = lat16.d + ((size_t)y * W16 + x) * C;
                const int8_t* b = lat32.d + ((size_t)(y/2) * lat32.W + x/2) * C;
                int8_t* o = merged16.d + ((size_t)y * W16 + x) * C;
                int c = 0;
#ifdef __AVX2__
                for (; c + 8 <= C; c += 8) {
                    __m256 fa = _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(_mm_loadl_epi64((const __m128i*)(a+c))));
                    __m256 fb = _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(_mm_loadl_epi64((const __m128i*)(b+c))));
                    __m256 fp = _mm256_fmadd_ps(fa, va_sc, _mm256_mul_ps(fb, vb_sc));
                    __m256i vi = _mm256_cvtps_epi32(_mm256_mul_ps(fp, vinv));
                    vi = _mm256_max_epi32(vi, _mm256_set1_epi32(-128));
                    vi = _mm256_min_epi32(vi, _mm256_set1_epi32(127));
                    __m128i lo = _mm256_castsi256_si128(vi);
                    __m128i hi = _mm256_extracti128_si256(vi, 1);
                    __m128i i16 = _mm_packs_epi32(lo, hi);
                    __m128i i8 = _mm_packs_epi16(i16, i16);
                    *(int64_t*)(o+c) = _mm_extract_epi64(i8, 0);
                }
#endif
                for (; c < C; c++) {
                    float fp = (float)a[c] * lat16_s + (float)b[c] * lat32_s;
                    int q = (int)lrintf(fp * inv16);
                    o[c] = (int8_t)(q > 127 ? 127 : (q < -128 ? -128 : q));
                }
            }
        }
    }

    /* Fused upsample(merged16) + add(lat8) → merged8 — AVX2 */
    T8 merged8 = t8_alloc(lat8.H, lat8.W, lat8.C);
    {
        int C = lat8.C, H8 = lat8.H, W8 = lat8.W, W16 = lat16.W;
#ifdef __AVX2__
        __m256 va_sc2 = _mm256_set1_ps(lat8_s);
        __m256 vb_sc2 = _mm256_set1_ps(lat16_s);
        __m256 vinv2 = _mm256_set1_ps(inv8);
#endif
        #pragma omp parallel for schedule(static)
        for (int y = 0; y < H8; y++) {
            for (int x = 0; x < W8; x++) {
                const int8_t* a = lat8.d + ((size_t)y * W8 + x) * C;
                const int8_t* b = merged16.d + ((size_t)(y/2) * W16 + x/2) * C;
                int8_t* o = merged8.d + ((size_t)y * W8 + x) * C;
                int c = 0;
#ifdef __AVX2__
                for (; c + 8 <= C; c += 8) {
                    __m256 fa = _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(_mm_loadl_epi64((const __m128i*)(a+c))));
                    __m256 fb = _mm256_cvtepi32_ps(_mm256_cvtepi8_epi32(_mm_loadl_epi64((const __m128i*)(b+c))));
                    __m256 fp = _mm256_fmadd_ps(fa, va_sc2, _mm256_mul_ps(fb, vb_sc2));
                    __m256i vi = _mm256_cvtps_epi32(_mm256_mul_ps(fp, vinv2));
                    vi = _mm256_max_epi32(vi, _mm256_set1_epi32(-128));
                    vi = _mm256_min_epi32(vi, _mm256_set1_epi32(127));
                    __m128i lo = _mm256_castsi256_si128(vi);
                    __m128i hi = _mm256_extracti128_si256(vi, 1);
                    __m128i i16 = _mm_packs_epi32(lo, hi);
                    __m128i i8 = _mm_packs_epi16(i16, i16);
                    *(int64_t*)(o+c) = _mm_extract_epi64(i8, 0);
                }
#endif
                for (; c < C; c++) {
                    float fp = (float)a[c] * lat8_s + (float)b[c] * lat16_s;
                    int q = (int)lrintf(fp * inv8);
                    o[c] = (int8_t)(q > 127 ? 127 : (q < -128 ? -128 : q));
                }
            }
        }
    }
    t8_free(&lat8); t8_free(&lat16);

    /* ====== FPN OUTPUT CONVS layers 32-38 ====== */
    T8 fpn8 = run_conv(&m->layers[32], merged8, 1.0f, 0);
    t8_free(&merged8);

    T8 t417 = run_conv(&m->layers[33], merged16, 1.0f, 0);
    t8_free(&merged16);

    T8 t418 = run_conv(&m->layers[34], lat32, 1.0f, 0);
    t8_free(&lat32);

    T8 t419 = run_conv(&m->layers[35], fpn8, 1.0f, 0);

    float t417_s = m->layers[33].act_scale[0]; /* per-tensor */
    float t419_s = m->layers[35].act_scale[0];
    T8 fpn16 = t8_alloc(t417.H, t417.W, t417.C);
    {
        int C = t417.C;
        float a_sc[320], b_sc[320], inv_sc[320];
        for (int c=0;c<C;c++) { a_sc[c]=t417_s; b_sc[c]=t419_s; inv_sc[c]=1.0f/(t417_s+1e-9f); }
        add_int8_per_channel(t417.d, a_sc, t419.d, b_sc, fpn16.d, inv_sc, t417.H*t417.W, C);
    }
    t8_free(&t417); t8_free(&t419);

    T8 t421 = run_conv(&m->layers[36], fpn16, 1.0f, 0);

    float t418_s = m->layers[34].act_scale[0];
    float t421_s = m->layers[36].act_scale[0];
    T8 fpn32 = t8_alloc(t418.H, t418.W, t418.C);
    {
        int C = t418.C;
        float a_sc[320], b_sc[320], inv_sc[320];
        for (int c=0;c<C;c++) { a_sc[c]=t418_s; b_sc[c]=t421_s; inv_sc[c]=1.0f/(t418_s+1e-9f); }
        add_int8_per_channel(t418.d, a_sc, t421.d, b_sc, fpn32.d, inv_sc, t418.H*t418.W, C);
    }
    t8_free(&t418); t8_free(&t421);

    T8 head_in_16 = run_conv(&m->layers[37], fpn16, 1.0f, 0);
    t8_free(&fpn16);

    T8 head_in_32 = run_conv(&m->layers[38], fpn32, 1.0f, 0);
    t8_free(&fpn32);

    /* ====== DETECTION HEADS ====== */
    #define RUN_HEAD(start_layer, input_tensor, head_out) do { \
        T8 h1 = run_conv(&m->layers[start_layer], input_tensor, 1.0f, 1); \
        T8 h2 = run_conv(&m->layers[start_layer+1], h1, 1.0f, 1); \
        t8_free(&h1); \
        T8 h3 = run_conv(&m->layers[start_layer+2], h2, 1.0f, 1); \
        t8_free(&h2); \
        T8 h4 = run_conv(&m->layers[start_layer+3], h3, 1.0f, 1); \
        t8_free(&h3); \
        TF cls_f  = run_conv_fp32(&m->layers[start_layer+4], h4, 1.0f); \
        TF bbox_f = run_conv_fp32(&m->layers[start_layer+5], h4, 1.0f); \
        TF kps_f  = run_conv_fp32(&m->layers[start_layer+6], h4, 1.0f); \
        t8_free(&h4); \
        /* Apply sigmoid to cls */ \
        int n_cls = cls_f.H * cls_f.W * cls_f.C; \
        for (int j = 0; j < n_cls; j++) \
            cls_f.d[j] = 1.0f / (1.0f + expf(-cls_f.d[j])); \
        (head_out).cls = cls_f.d; \
        (head_out).bbox = bbox_f.d; \
        (head_out).kps = kps_f.d; \
        (head_out).N = cls_f.H * cls_f.W; \
    } while(0)

    /* Head stride 8 (layers 39-45, input: fpn8) */
    RUN_HEAD(39, fpn8, *head8);
    t8_free(&fpn8);

    RUN_HEAD(46, head_in_16, *head16);
    t8_free(&head_in_16);

    RUN_HEAD(53, head_in_32, *head32);
    t8_free(&head_in_32);

    #undef RUN_HEAD
}

/* ============ External postprocess ============ */

typedef struct {
    float x1, y1, x2, y2;
    float score;
    float kps[5][2];
} Face;

extern int postprocess_retinaface(
    const float* cls8, const float* bbox8, const float* kps8,
    const float* cls16, const float* bbox16, const float* kps16,
    const float* cls32, const float* bbox32, const float* kps32,
    int det_size, int img_w, int img_h,
    float conf_thresh, float iou_thresh,
    Face* out_faces, int max_out);

extern void print_faces(const Face* faces, int n);

/* ============ Server mode ============ */

/*
 * Binary protocol (stdin/stdout):
 * Input:  uint32 width, uint32 height, float32[H*W*3] normalized HWC [-1,1]
 * Output: uint32 num_faces, per face: float32[4] bbox, float32 score, float32[10] kps
 */
static void server_loop(Model* model) {
#ifdef _WIN32
    /* Set stdin/stdout to binary mode and increase buffer */
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    /* Increase stdio buffers for large blobs */
    setvbuf(stdin, NULL, _IOFBF, 1024 * 1024);  /* 1MB input buffer */
    setvbuf(stdout, NULL, _IOFBF, 64 * 1024);    /* 64KB output buffer */
#endif
    fprintf(stderr, "fastdet_int8: server mode ready\n");

    while (1) {
        uint32_t w, h;
        if (fread(&w, 4, 1, stdin) != 1) break;
        if (fread(&h, 4, 1, stdin) != 1) break;

        size_t n_floats = (size_t)h * w * 3;
        float* input = (float*)malloc(n_floats * sizeof(float));
        if (fread(input, sizeof(float), n_floats, stdin) != n_floats) {
            free(input);
            break;
        }

        /* Run detection */
        HeadOutput h8, h16, h32;
        forward(model, input, (int)h, (int)w, &h8, &h16, &h32);

        /* Postprocess */
        Face faces[256];
        int n_faces = postprocess_retinaface(
            h8.cls, h8.bbox, h8.kps,
            h16.cls, h16.bbox, h16.kps,
            h32.cls, h32.bbox, h32.kps,
            (int)(w > h ? w : h), (int)w, (int)h,
            0.40f, 0.4f,
            faces, 256);

        /* Write output */
        uint32_t nf = (uint32_t)n_faces;
        fwrite(&nf, 4, 1, stdout);
        for (int i = 0; i < n_faces; i++) {
            fwrite(&faces[i].x1, 4, 1, stdout);
            fwrite(&faces[i].y1, 4, 1, stdout);
            fwrite(&faces[i].x2, 4, 1, stdout);
            fwrite(&faces[i].y2, 4, 1, stdout);
            fwrite(&faces[i].score, 4, 1, stdout);
            fwrite(faces[i].kps, 4, 10, stdout);
        }
        fflush(stdout);

        /* Cleanup */
        free(h8.cls); free(h8.bbox); free(h8.kps);
        free(h16.cls); free(h16.bbox); free(h16.kps);
        free(h32.cls); free(h32.bbox); free(h32.kps);
        free(input);
    }
}

/* ============ Main ============ */
#ifndef DETECT_NO_MAIN
int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "Usage: fastdet_int8 <det8_weights> [--server|--test]\n");
        return 1;
    }

    /* OpenMP tuning for inference: active spinning + core binding */
    #ifdef _WIN32
    _putenv("OMP_WAIT_POLICY=active");
    _putenv("OMP_PROC_BIND=close");
    #else
    setenv("OMP_WAIT_POLICY", "active", 0);
    setenv("OMP_PROC_BIND", "close", 0);
    #endif

    Model model;
    if (load_model(argv[1], &model) != 0) return 1;

    if (argc > 2 && strcmp(argv[2], "--server") == 0) {
        server_loop(&model);
    } else if (argc > 2 && strcmp(argv[2], "--test") == 0) {
        int det_size = (argc > 3) ? atoi(argv[3]) : 640;
        int H = det_size, W = det_size;
        float* input = calloc((size_t)H * W * 3, sizeof(float));
        for (int i = 0; i < H * W * 3; i++)
            input[i] = ((float)(i % 256) - 127.5f) / 128.0f;

        fprintf(stderr, "Running forward pass on %dx%d dummy input...\n", H, W);

        /* Enable profiling */
        g_profile = 1;
        g_layer_idx = 0;

        struct timespec t0, t1;
        clock_gettime(CLOCK_MONOTONIC, &t0);

        HeadOutput h8, h16, h32;
        forward(&model, input, H, W, &h8, &h16, &h32);

        clock_gettime(CLOCK_MONOTONIC, &t1);
        double ms = (t1.tv_sec - t0.tv_sec) * 1000.0 + (t1.tv_nsec - t0.tv_nsec) / 1e6;

        /* Postprocess */
        Face faces[256];
        int n = postprocess_retinaface(
            h8.cls, h8.bbox, h8.kps,
            h16.cls, h16.bbox, h16.kps,
            h32.cls, h32.bbox, h32.kps,
            det_size, det_size, det_size, 0.3f, 0.4f,
            faces, 256);

        printf("Forward: %.1f ms, %d faces detected\n", ms, n);
        print_faces(faces, n);

        /* Print per-layer profile */
        printf("\n=== Per-layer profile (%d layers timed) ===\n", g_layer_idx);
        double dw_total = 0, pw_total = 0, std_total = 0;
        for (int li = 0; li < g_layer_idx && li < model.n_layers; li++) {
            Layer* L = &model.layers[li];
            const char* ty = L->type == 1 ? "DW" : (L->type == 2 ? "PW" : "STD");
            printf("  [%2d] %3s %3d->%3d k=%dx%d s=%d  %.2f ms\n",
                   li, ty, L->cin, L->cout, L->kh, L->kw, L->sh, g_layer_ms[li]);
            if (L->type == 1) dw_total += g_layer_ms[li];
            else if (L->type == 2) pw_total += g_layer_ms[li];
            else std_total += g_layer_ms[li];
        }
        printf("  Totals: DW=%.1fms PW=%.1fms STD=%.1fms sum=%.1fms\n",
               dw_total, pw_total, std_total, dw_total + pw_total + std_total);

        free(h8.cls); free(h8.bbox); free(h8.kps);
        free(h16.cls); free(h16.bbox); free(h16.kps);
        free(h32.cls); free(h32.bbox); free(h32.kps);
        free(input);
    } else {
        printf("RetinaFace INT8 engine (%d layers). Use --server or --test.\n", model.n_layers);
    }

    for (int i = 0; i < model.n_layers; i++) {
        free(model.layers[i].w);
        free(model.layers[i].w_scale);
        if (model.layers[i].bias) free(model.layers[i].bias);
        free(model.layers[i].act_scale);
        if (model.layers[i].packed_w) free(model.layers[i].packed_w);
        if (model.layers[i].col_sums) free(model.layers[i].col_sums);
    }
    return 0;
}
#endif /* DETECT_NO_MAIN */
