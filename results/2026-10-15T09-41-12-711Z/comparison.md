# MnMOracle model comparison results

Status: complete automatic measurements; human accuracy review pending.

Three repetitions of the same 46 development cases per model. Scores are rubric passes, not independently reviewed factual accuracy. All timing uses one active request; source retrieval and the full production pipeline are outside this experiment.

| Model | Intent | Grounded answers | Game question judge | Intent median ms | Answer median ms | Answer p95 ms | Model load delta MiB | One context delta MiB | Second context delta MiB | Peak delta MiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| qwen3-4b | 42/72 | 30/30 | 30/36 | 442 | 609 | 786 | 2385 | 877 | 878 | 3287 |
| gemma4-e2b | 42/72 | 21/30 | 24/36 | 353 | 493 | 886 | 1289 | 570 | 575 | 1879 |
| gemma4-e4b | 57/72 | 30/30 | 33/36 | 589 | 791 | 1083 | 2706 | 658 | 658 | 3580 |

Device memory includes other applications. Compare deltas alongside recorded context state sizes. Review raw answers and errors before recommending a model. Quantization differs: current Qwen Q4_K_M versus official Gemma QAT Q4_0.

User authorized running alongside CPU tests without CPU idle admission. Workers use BelowNormal priority and two logical CPUs. Timings are shared-load observations, not isolated maximum-performance measurements. GPU use by the live bot or desktop may also affect timings and device memory.
