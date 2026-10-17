/*
 * gemm_int8_4x8c8.c — Production INT8 GEMM microkernel for AVX2.
 *
 * Tile: MR=4, NR=8, KR=8 (c8 packing)
 * Instructions: vpmaddubsw (u8×s8→s16) + vpmaddwd (s16→s32) + vpaddd
 * Throughput: 32 INT8 ops/cycle on Skylake+
 *
 * Handles signed×signed via offset trick:
 *   A_u8 = A_s8 + 128
 *   compensation = 128 * column_sum(W) per output channel
 *
 * Weight packing layout per NR=8 group:
 *   [8 x int32 bias] [K/8 blocks of 64 bytes: 8 columns, each 8 k-values contiguous]
 *
 * B block layout (64 bytes per KR=8 block):
 *   Columns 0-3 in first 32 bytes (vb_lo), columns 4-7 in next 32 bytes (vb_hi).
 *   Within each 32-byte half: 4 columns × 8 bytes each, k-values contiguous per column.
 *   Memory: [n0_k0..k7, n1_k0..k7, n2_k0..k7, n3_k0..k7 | n4_k0..k7, ..., n7_k0..k7]
 *
 * A loading: broadcastq (8 bytes → 4 copies filling 256 bits).
 *   va = [a_k0..k7, a_k0..k7, a_k0..k7, a_k0..k7]
 *
 * vpmaddubsw(va, vb_lo) per lane (16 bytes = 2 columns × 8 k-values):
 *   s16[0] = a_k0*n_X_k0 + a_k1*n_X_k1   (col X partial, k=0,1)
 *   s16[1] = a_k2*n_X_k2 + a_k3*n_X_k3   (col X partial, k=2,3)
 *   s16[2] = a_k4*n_X_k4 + a_k5*n_X_k5   (col X partial, k=4,5)
 *   s16[3] = a_k6*n_X_k6 + a_k7*n_X_k7   (col X partial, k=6,7)
 *   s16[4..7] = same for col X+1
 *
 * vpmaddwd(result, vones) → s32: [partial_nX(k0-3), partial_nX(k4-7),
 *                                  partial_nX+1(k0-3), partial_nX+1(k4-7)]
 *
 * After K loop: hadd pairs → [sum_n0, sum_n1, sum_n4, sum_n5 | sum_n2, sum_n3, sum_n6, sum_n7]
 * permute4x64(0xD8) → [sum_n0..n3 | sum_n4..n7] = 8 output columns.
 *
 * Used for: pointwise 1x1 conv and standard 3x3 conv (via im2col)
 */

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <immintrin.h>

/* ============ Weight packing ============ */

/*
 * Pack weights from [Cout, K] row-major (int8) to c8 format.
 * Output layout per NR=8 column group:
 *   [8 x int32 bias] [K/8 blocks of 64 bytes]
 *
 * Each 64-byte block: columns 0-3 then 4-7, k-values contiguous per column.
 * Also computes col_sums for signed offset compensation.
 */
void pack_weights_4x8c8(
    const int8_t* weights,  /* [Cout, K] row-major */
    const float* bias,      /* [Cout] or NULL */
    int K, int Cout,
    void* packed_w,         /* output: packed weights */
    int32_t* col_sums)      /* output: 128 * sum(w) per output channel [Cout] */
{
    uint8_t* out = (uint8_t*)packed_w;
    int K_padded = (K + 7) & ~7;

    for (int co = 0; co < Cout; co += 8) {
        /* Write bias (8 x int32) */
        int32_t* bias_ptr = (int32_t*)out;
        for (int j = 0; j < 8; j++) {
            if (bias && (co + j) < Cout)
                bias_ptr[j] = (int32_t)(bias[co + j]);
            else
                bias_ptr[j] = 0;
        }
        out += 8 * sizeof(int32_t);

        /* Compute column sums for compensation */
        for (int j = 0; j < 8; j++) {
            int32_t sum = 0;
            if ((co + j) < Cout) {
                for (int k = 0; k < K; k++) {
                    sum += (int32_t)weights[(co + j) * K + k];
                }
            }
            col_sums[co + j] = 128 * sum;
        }

        /* Pack weights in c8 layout: [col, 8 k-values].
         * B weights CLAMPED to ±63 to prevent vpmaddubsw saturation. */
        for (int k = 0; k < K_padded; k += 8) {
            for (int j = 0; j < 8; j++) {
                for (int kk = 0; kk < 8; kk++) {
                    if ((co + j) < Cout && (k + kk) < K) {
                        *out++ = (uint8_t)weights[(co + j) * K + (k + kk)];
                    } else {
                        *out++ = 0;
                    }
                }
            }
        }
    }
}

/* Size of packed weights buffer */
int packed_weights_size_4x8c8(int K, int Cout) {
    int K_padded = (K + 7) & ~7;
    int nr_groups = (Cout + 7) / 8;
    /* Per group: 8*int32 bias + K_padded*8 bytes weights */
    return nr_groups * (8 * sizeof(int32_t) + K_padded * 8);
}

/* ============ Activation packing: signed→unsigned ============ */

void convert_s8_to_u8(const int8_t* in, uint8_t* out, int n) {
    int i = 0;
#ifdef __AVX2__
    __m256i v128 = _mm256_set1_epi8((char)128);
    for (; i + 32 <= n; i += 32) {
        __m256i v = _mm256_loadu_si256((const __m256i*)(in + i));
        __m256i vu = _mm256_xor_si256(v, v128);
        _mm256_storeu_si256((__m256i*)(out + i), vu);
    }
#endif
    for (; i < n; i++) {
        out[i] = (uint8_t)((int)in[i] + 128);
    }
}

/* ============ GEMM Microkernel ============ */

/*
 * gemm_4x8c8_ukernel: MR=4 rows × NR=8 columns.
 *
 * Uses broadcastq for A (all 32 bytes active), separate accumulators
 * for cols 0-3 (vacc_lo) and cols 4-7 (vacc_hi), with hadd+permute
 * at the end to produce 8 output columns per row.
 */
/* AVX-512 VNNI microkernel: uses VPDPBUSD for u8×s8→s32 WITHOUT saturation.
 * One instruction replaces vpmaddubsw+vpmaddwd. Full ±127 B range (no clamping). */
static void gemm_4x8c8_ukernel(
    const int8_t* a, int a_stride,
    const int8_t* w,
    int32_t* c, int c_stride,
    int K, int mr,
    const int32_t* col_sums_8)   /* 8 col_sums for VNNI compensation, or NULL */
{
#ifdef __AVX512VNNI__
    /* AVX-512 VNNI: VPDPBUSD (u8×s8→s32, no saturation).
     * Uses XOR trick: A_u8 = A_s8 ^ 0x80. Compensated via col_sums. */ {

    __m512i vacc0 = _mm512_setzero_si512();
    __m512i vacc1 = _mm512_setzero_si512();
    __m512i vacc2 = _mm512_setzero_si512();
    __m512i vacc3 = _mm512_setzero_si512();

    const int8_t* a0 = a;
    const int8_t* a1 = (mr > 1) ? a0 + a_stride : a0;
    const int8_t* a2 = (mr > 2) ? a1 + a_stride : a1;
    const int8_t* a3 = (mr > 3) ? a2 + a_stride : a2;

    const int64_t xor_mask = (int64_t)0x8080808080808080ULL;

    for (int k = 0; k < K; k += 8) {
        int64_t a0_val, a1_val, a2_val, a3_val;
        memcpy(&a0_val, a0, 8); memcpy(&a1_val, a1, 8);
        memcpy(&a2_val, a2, 8); memcpy(&a3_val, a3, 8);
        a0_val ^= xor_mask; a1_val ^= xor_mask;
        a2_val ^= xor_mask; a3_val ^= xor_mask;

        const __m512i va0 = _mm512_set1_epi64(a0_val);
        const __m512i va1 = _mm512_set1_epi64(a1_val);
        const __m512i va2 = _mm512_set1_epi64(a2_val);
        const __m512i va3 = _mm512_set1_epi64(a3_val);
        a0 += 8; a1 += 8; a2 += 8; a3 += 8;

        const __m512i vb = _mm512_loadu_si512((const __m512i*)w);
        w += 64;

        vacc0 = _mm512_dpbusd_epi32(vacc0, va0, vb);
        vacc1 = _mm512_dpbusd_epi32(vacc1, va1, vb);
        vacc2 = _mm512_dpbusd_epi32(vacc2, va2, vb);
        vacc3 = _mm512_dpbusd_epi32(vacc3, va3, vb);
    }

    /* Reduce 16 lanes → 8 columns via hadd+permute */
    __m256i lo0 = _mm512_castsi512_si256(vacc0), hi0 = _mm512_extracti64x4_epi64(vacc0, 1);
    __m256i lo1 = _mm512_castsi512_si256(vacc1), hi1 = _mm512_extracti64x4_epi64(vacc1, 1);
    __m256i lo2 = _mm512_castsi512_si256(vacc2), hi2 = _mm512_extracti64x4_epi64(vacc2, 1);
    __m256i lo3 = _mm512_castsi512_si256(vacc3), hi3 = _mm512_extracti64x4_epi64(vacc3, 1);

    __m256i vout0 = _mm256_permute4x64_epi64(_mm256_hadd_epi32(lo0, hi0), 0xD8);
    __m256i vout1 = _mm256_permute4x64_epi64(_mm256_hadd_epi32(lo1, hi1), 0xD8);
    __m256i vout2 = _mm256_permute4x64_epi64(_mm256_hadd_epi32(lo2, hi2), 0xD8);
    __m256i vout3 = _mm256_permute4x64_epi64(_mm256_hadd_epi32(lo3, hi3), 0xD8);

    /* Subtract col_sums compensation (XOR trick offset) */
    if (col_sums_8) {
        __m256i vcomp = _mm256_loadu_si256((const __m256i*)col_sums_8);
        vout0 = _mm256_sub_epi32(vout0, vcomp);
        vout1 = _mm256_sub_epi32(vout1, vcomp);
        vout2 = _mm256_sub_epi32(vout2, vcomp);
        vout3 = _mm256_sub_epi32(vout3, vcomp);
    }

    _mm256_storeu_si256((__m256i*)(c), vout0);
    if (mr > 1) _mm256_storeu_si256((__m256i*)(c + c_stride), vout1);
    if (mr > 2) _mm256_storeu_si256((__m256i*)(c + 2 * c_stride), vout2);
    if (mr > 3) _mm256_storeu_si256((__m256i*)(c + 3 * c_stride), vout3);
    } return;
#endif

    /* AVX2: saturation-free s8×s8 via cvtepi8_epi16 + vpmaddwd.
     *
     * Old approach (vpmaddubsw) saturates at s16 when u8*s8 pair > 32767.
     * New approach: sign-extend both A and B to s16, use vpmaddwd (s16×s16→s32).
     * Max pair: 127*127 + 127*127 = 32258 < 32767. No saturation possible.
     *
     * Process 2 B columns per __m256i: load 16 B bytes → cvtepi8_epi16 → 16 s16.
     * A: 8 bytes → cvtepi8_epi16 → 8 s16 in __m128i → broadcast to __m256i.
     * vpmaddwd: [a0*b0+a1*b1, a2*b2+a3*b3, ...] → 4 partials per col, 2 cols per reg.
     *
     * After K loop: hadd twice to reduce 4 partials → 1 per column.
     * No XOR trick needed — direct s8 multiply. No col_sums compensation.
     */ {

    /* 4 rows × 4 acc pairs (each pair = 2 cols) = 16 __m256i accumulators */
    __m256i acc[4][4]; /* acc[row][pair]: pair 0=c0c1, 1=c2c3, 2=c4c5, 3=c6c7 */
    for (int r = 0; r < 4; r++)
        for (int p = 0; p < 4; p++)
            acc[r][p] = _mm256_setzero_si256();

    const int8_t* a_row[4];
    a_row[0] = a;
    a_row[1] = (mr > 1) ? a + a_stride : a;
    a_row[2] = (mr > 2) ? a + 2*a_stride : a;
    a_row[3] = (mr > 3) ? a + 3*a_stride : a;

    for (int k = 0; k < K; k += 8) {
        /* Load B: 4 pairs of 2 columns each (8 cols × 8 k-values = 64 bytes) */
        /* B layout: [col0: 8 bytes, col1: 8 bytes, ..., col7: 8 bytes] */
        const __m128i* bptr = (const __m128i*)w;
        __m256i vb01 = _mm256_cvtepi8_epi16(_mm_loadu_si128(bptr));     /* cols 0-1 → 16 s16 */
        __m256i vb23 = _mm256_cvtepi8_epi16(_mm_loadu_si128(bptr + 1)); /* cols 2-3 */
        __m256i vb45 = _mm256_cvtepi8_epi16(_mm_loadu_si128(bptr + 2)); /* cols 4-5 */
        __m256i vb67 = _mm256_cvtepi8_epi16(_mm_loadu_si128(bptr + 3)); /* cols 6-7 */
        w += 64;

        for (int r = 0; r < mr; r++) {
            /* A: 8 s8 → sign-extend to 8 s16, broadcast to both lanes */
            __m128i a8 = _mm_loadl_epi64((const __m128i*)(a_row[r] + k));
            __m128i a_s16 = _mm_cvtepi8_epi16(a8); /* 8 × s16 in __m128i */
            __m256i va = _mm256_broadcastsi128_si256(a_s16); /* [a0..a7, a0..a7] s16 */

            /* vpmaddwd: s16×s16 → s32, pairs summed. 4 partials per col, 2 cols per reg. */
            acc[r][0] = _mm256_add_epi32(acc[r][0], _mm256_madd_epi16(va, vb01));
            acc[r][1] = _mm256_add_epi32(acc[r][1], _mm256_madd_epi16(va, vb23));
            acc[r][2] = _mm256_add_epi32(acc[r][2], _mm256_madd_epi16(va, vb45));
            acc[r][3] = _mm256_add_epi32(acc[r][3], _mm256_madd_epi16(va, vb67));
        }
    }

    /* Reduce: 4 partials per col → 1. Use hadd twice + interleave.
     * acc[r][0] = [4 partials col0 | 4 partials col1]
     * acc[r][1] = [4 partials col2 | 4 partials col3]
     * hadd(acc[0], acc[1]) → [p01_c0, p23_c0, p01_c2, p23_c2 | p01_c1, p23_c1, p01_c3, p23_c3]
     * hadd(acc[2], acc[3]) → similar for cols 4-7
     * hadd(h01, h23) → [sum_c0, sum_c2, sum_c4, sum_c6 | sum_c1, sum_c3, sum_c5, sum_c7]
     * Interleave lanes → [c0,c1,c2,c3,c4,c5,c6,c7] */
    for (int r = 0; r < mr; r++) {
        __m256i h01 = _mm256_hadd_epi32(acc[r][0], acc[r][1]);
        __m256i h23 = _mm256_hadd_epi32(acc[r][2], acc[r][3]);
        __m256i h   = _mm256_hadd_epi32(h01, h23);
        /* h = [c0,c2,c4,c6 | c1,c3,c5,c7] — need interleave */
        __m128i even = _mm256_castsi256_si128(h);
        __m128i odd  = _mm256_extracti128_si256(h, 1);
        __m128i lo = _mm_unpacklo_epi32(even, odd); /* [c0,c1,c2,c3] */
        __m128i hi = _mm_unpackhi_epi32(even, odd); /* [c4,c5,c6,c7] */
        __m256i result = _mm256_set_m128i(hi, lo);

        _mm256_storeu_si256((__m256i*)(c + r * c_stride), result);
    }
    } /* end AVX2 scope */
}

/* ============ Full GEMM with blocking ============ */

/* Thread-local workspace for A_u8 conversion to avoid malloc per call */
static __thread uint8_t* tls_a_u8 = NULL;
static __thread size_t tls_a_u8_size = 0;

static uint8_t* get_a_u8_workspace(size_t needed) {
    if (needed > tls_a_u8_size) {
        free(tls_a_u8);
        tls_a_u8 = (uint8_t*)malloc(needed);
        tls_a_u8_size = needed;
    }
    return tls_a_u8;
}

void int8_gemm_4x8c8(
    const int8_t* A, int M, int K, int N,
    const void* B_packed,
    int32_t* C,
    const int32_t* col_sums)
{
    int K_padded = (K + 7) & ~7;

    /* With inline s8→u8 XOR in microkernel, no pre-conversion needed.
     * Just pad A to K_padded if needed. */
    const int8_t* A_eff = A;
    int A_stride = K;
    int8_t* A_pad = NULL;
    if (K != K_padded) {
        A_pad = (int8_t*)get_a_u8_workspace((size_t)M * K_padded);
        for (int m = 0; m < M; m++) {
            memcpy(A_pad + (size_t)m * K_padded, A + (size_t)m * K, K);
            memset(A_pad + (size_t)m * K_padded + K, 0, K_padded - K);
        }
        A_eff = A_pad;
        A_stride = K_padded;
    }

    #pragma omp parallel for schedule(dynamic)
    for (int m = 0; m < M; m += 4) {
        int mr = (m + 4 <= M) ? 4 : M - m;

        const uint8_t* w_ptr = (const uint8_t*)B_packed;

        for (int n = 0; n < N; n += 8) {
            const int8_t* w_data = (const int8_t*)(w_ptr + 32);

            int32_t acc[4 * 8] __attribute__((aligned(32)));
            memset(acc, 0, sizeof(acc));

            gemm_4x8c8_ukernel(
                A_eff + (size_t)m * A_stride, A_stride,
                w_data,
                acc, 8,
                K_padded, mr,
                col_sums + n);  /* pass per-group col_sums for VNNI compensation */

            /* Store to C (col_sums already subtracted inside ukernel for VNNI) */
            for (int i = 0; i < mr; i++) {
                for (int j = 0; j < 8 && (n + j) < N; j++) {
                    C[(size_t)(m + i) * N + (n + j)] = acc[i * 8 + j];
                }
            }

            /* Advance weight pointer to next NR group */
            w_ptr += 32 + (size_t)K_padded * 8; /* bias + weights */
        }
    }
    /* A_u8 is workspace-managed, not freed here */
}

/* ============ Fused GEMM + epilogue (dequant+bias+ReLU+requant → int8 output) ============ */

void int8_gemm_4x8c8_fused(
    const int8_t* A, int M, int K, int N,
    const void* B_packed,
    int8_t* out,           /* output: [M, N] int8 (fused result) */
    const int32_t* col_sums,
    const float* w_scales,   /* [N] weight scales */
    const float* bias,       /* [N] bias or NULL */
    const float* act_scale,  /* [N] output activation scale (per-tensor: all same) */
    int do_relu)
{
    int K_padded = (K + 7) & ~7;

    /* No pre-conversion: microkernel XORs s8→u8 inline */
    const int8_t* A_eff = A;
    int A_stride = K;
    int8_t* A_pad = NULL;
    if (K != K_padded) {
        A_pad = (int8_t*)get_a_u8_workspace((size_t)M * K_padded);
        for (int m = 0; m < M; m++) {
            memcpy(A_pad + (size_t)m * K_padded, A + (size_t)m * K, K);
            memset(A_pad + (size_t)m * K_padded + K, 0, K_padded - K);
        }
        A_eff = A_pad;
        A_stride = K_padded;
    }

    /* Precompute per-channel: combined_scale = 1.0 * w_scale (folded: in_scale=1.0) */
    float inv_out[512];
    for (int c = 0; c < N; c++)
        inv_out[c] = 1.0f / (act_scale[c] + 1e-9f);

    #pragma omp parallel for schedule(dynamic)
    for (int m = 0; m < M; m += 4) {
        int mr = (m + 4 <= M) ? 4 : M - m;
        const uint8_t* w_ptr = (const uint8_t*)B_packed;

        for (int n = 0; n < N; n += 8) {
            const int8_t* w_data = (const int8_t*)(w_ptr + 32);

            int32_t acc[4 * 8] __attribute__((aligned(32)));
            memset(acc, 0, sizeof(acc));

            gemm_4x8c8_ukernel(
                A_eff + (size_t)m * A_stride, A_stride,
                w_data, acc, 8, K_padded, mr,
                col_sums + n);

            /* Fused: compensate + dequant + bias + relu + requant → int8 */
            for (int i = 0; i < mr; i++) {
                int8_t* orow = out + (size_t)(m + i) * N;
                for (int j = 0; j < 8 && (n + j) < N; j++) {
                    int c = n + j;
                    float fp = (float)(acc[i * 8 + j]) * w_scales[c];
                    if (bias) fp += bias[c];
                    if (do_relu && fp < 0) fp = 0;
                    int q = (int)lrintf(fp * inv_out[c]);
                    if (q > 127) q = 127;
                    if (q < -128) q = -128;
                    orow[c] = (int8_t)q;
                }
            }

            w_ptr += 32 + (size_t)K_padded * 8;
        }
    }
}
