/*
 * threadpool.h — Minimal lock-free thread pool for GEMM parallelization.
 *
 * Design: persistent worker threads + atomic task queue.
 * Workers spin briefly then sleep via WaitOnAddress (Windows) or futex (Linux).
 * Target dispatch latency: <500ns (vs OpenMP ~20µs).
 *
 * API:
 *   tp_init(int n_threads)        — create pool (call once at startup)
 *   tp_parallel_for(fn, ctx, N)   — parallel for i=0..N-1
 *   tp_destroy()                  — shutdown
 */
#ifndef THREADPOOL_H
#define THREADPOOL_H

#include <stdint.h>

/* Task function: called with (context, start, end) for range [start, end) */
typedef void (*tp_task_fn)(void* ctx, int start, int end);

/* Initialize thread pool with n_threads workers (0 = auto-detect) */
void tp_init(int n_threads);

/* Execute fn(ctx, i, i+chunk) for i=0..total-1, split across workers.
 * Blocks until all work is done. Granularity = chunk size per worker. */
void tp_parallel_for(tp_task_fn fn, void* ctx, int total, int grain);

/* Shutdown thread pool */
void tp_destroy(void);

/* Get number of threads */
int tp_num_threads(void);

#endif /* THREADPOOL_H */
