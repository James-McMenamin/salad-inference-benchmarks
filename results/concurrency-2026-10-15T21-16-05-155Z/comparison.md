# Gemma E4B concurrency results

Shared-load experiment on RTX 3090 Ti. Two CPU threads, BelowNormal priority, thinking disabled, 4096 tokens per request, 512-token shared batch. One model with independent sequences. Three rounds of the same 32 requests per level. Loading and warmup excluded; full production retrieval/network excluded.

| Simultaneous requests | Completed | Median latency s | p95 latency s | Median first answer token s | Requests per second | Peak additional VRAM GiB | Peak total GPU VRAM GiB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 96/96 | 0.778 | 1.063 | 0.651 | 1.25 | 3.80 | 12.48 |
| 2 | 96/96 | 1.702 | 2.050 | 1.390 | 1.14 | 3.67 | 12.33 |
| 4 | 96/96 | 2.571 | 3.145 | 2.238 | 1.37 | 4.41 | 13.09 |
| 8 | 96/96 | 5.246 | 8.475 | 4.679 | 1.32 | 4.30 | 12.92 |
| 16 | 96/96 | 10.664 | 11.591 | 9.584 | 1.39 | 5.38 | 14.11 |

All latency includes question reading plus answer generation. First answer token excludes the reader JSON. VRAM is dedicated NVIDIA device telemetry sampled every 200 ms and includes the resident bot and desktop; additional VRAM subtracts each worker baseline. Throughput uses sum of elapsed waves rather than summed overlapping request durations. This is a burst test with no application queue, not production capacity certification. CPU and memory-bandwidth contention remain uncontrolled; no CPU idle gate was used.
