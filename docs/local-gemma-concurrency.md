# Gemma E4B concurrency benchmark

Measured October 15, 2026 on the local RTX 3090 Ti. Gemma 4 E4B handled 16 simultaneous requests without exhausting VRAM. Four active requests offered almost the same throughput with substantially shorter response times in this workload. Production configuration was not changed.

## Results

| Active requests | Median response | p95 response | Median first answer token | Answers per second | Peak additional VRAM | Peak total GPU VRAM |
| --- | --- | --- | --- | --- | --- | --- |
| 1 baseline | 0.78 s | 1.06 s | 0.65 s | 1.25 | 3.80 GiB | 12.48 GiB |
| 2 | 1.70 s | 2.05 s | 1.39 s | 1.14 | 3.67 GiB | 12.33 GiB |
| 4 | 2.57 s | 3.15 s | 2.24 s | 1.37 | 4.41 GiB | 13.09 GiB |
| 8 | 5.25 s | 8.47 s | 4.68 s | 1.32 | 4.30 GiB | 12.92 GiB |
| 16 | 10.66 s | 11.59 s | 9.58 s | 1.39 | 5.38 GiB | 14.11 GiB |

Each level completed 96 measured requests: three rounds of the same 32-request schedule, drawn from ten frozen grounded-answer cases. All 480 requests completed without errors and passed the existing required-fact, citation, and abstention rubric. These repeated cases are not 480 independent accuracy examples. An assistant review of the distinct answer texts found consistent answers across levels, with only a recipe punctuation variant; this small set showed no answer contamination between requests. It does not establish accuracy on unseen questions.

Response time starts at simultaneous wave arrival and includes question interpretation plus answer generation. First answer token means the first generated answer token after the reader stage, not the reader's JSON output. Retrieval, Discord/network overhead, model loading, and warmup are excluded. Throughput divides completed requests by elapsed wave time, excluding evidence writes between waves. The bursts have no application queue or think time and are not a sustained-arrival capacity test.

## Configuration

- Official `google/gemma-4-E4B-it-qat-q4_0-gguf`, file `gemma-4-E4B_q4_0-it.gguf`, revision `4b4a2c1d584be7264f87aac328a1bc739ce81b6c`, SHA256 `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`.
- node-llama-cpp 3.22.1, Vulkan, startup `GGML_VK_VISIBLE_DEVICES=0`; detected device verified as only the RTX 3090 Ti.
- One model and one batched context per level; each request has an independent sequence with 4096 tokens. Context reduction and allocation retries disabled. Batch size fixed at 512.
- Thinking disabled, temperature zero, seed 42, reader limit 260 output tokens, answer limit 400 output tokens.
- Two CPU inference threads, maximum thread reservation two, BelowNormal process priority, affinity to logical CPUs 22 and 28. One simultaneous warmup per slot before measurement.
- Dedicated NVIDIA VRAM sampled every 200 ms. Additional VRAM subtracts that worker's pre-load baseline; total GPU VRAM includes the live Qwen bot and desktop applications, which remained running.

The model is shared across active requests; these are not 16 model copies. Contexts share work buffers in the batched setup, so memory does not equal the single-request allocation multiplied by concurrency. File size, CPU backing memory, and GPU residency also differ; the table is GPU memory, not total machine RAM.

## Interpretation and limits

Four active requests delivered 1.37 answers per second versus 1.39 at sixteen, a difference too small to establish a meaningful throughput advantage under uncontrolled shared load. Median response time increased from 2.57 to 10.66 seconds. Start a production-serving trial with four active slots and a bounded queue; evaluate eight only if burst handling justifies longer waits. Sixteen is a successfully tested level, not a proven hardware maximum or a useful default for this workload.

No CPU idle gate was used, as explicitly requested. Other jobs continued throughout. Host CPU snapshots ranged from 5% to 52%; the eight-request level includes a slower round. All levels used identical CPU limits, but background activity and execution order remain confounders. Small nonmonotonic memory differences are observations, not evidence that adding slots reduces memory. Treat results as shared-load operational measurements, not isolated performance certification.

These are short questions with short answers and 4096-token slots. Longer prompts, larger histories, longer generation, different quantization, another backend, a larger batch size, prompt caching, or different CPU resources can change both performance and memory. Do not extrapolate a maximum user count or hosting specification from this run alone.

## Evidence and reproduction

Run directory: `experiments/model-comparison/runs/concurrency-2026-10-15T21-16-05-155Z`.

It contains an immutable specification snapshot, combined `comparison.json` and `comparison.md`, controller receipt, and per-level logs. Each `c1`, `c2`, `c4`, `c8`, and `c16` directory contains metadata, raw waves with outputs and per-call timing, NVIDIA memory samples, and a summary. The full specification and model hashes identify the exact inputs.

Harness: [model comparison instructions](../README.md#local-gpu-reproduction). Workload and timing checks passed all four focused tests before the run. Every requested concurrency level completed; no failed requests were discarded, no workload was shortened, and no level was retried. Production and other jobs were not stopped or modified.
