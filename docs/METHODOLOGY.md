# Methodology and limitations

## Frozen development workload

The initial comparison repeated 24 interpretation cases, 10 grounded-answer cases and 12 question-classification cases three times: 138 task trials per model, 165 API calls per Salad model. Some examples resemble the prompts. These are development regression fixtures, not a held-out scientific benchmark. Frozen input snapshots and original hashes are retained.

Most subsequent experiments repeated the ten grounded-answer cases with an interpretation call before each answer call. There is no production retrieval or Discord delivery in these timings. Temperature was zero and thinking was disabled with `chat_template_kwargs.enable_thinking=false`; output limits were 260 reader tokens and 400 answer tokens. Classification used four output tokens. Automatic grounding scores require facts, citations and/or abstention, but can miss unsupported extra claims and can reject harmless singular/plural wording. Recorded assistant reviews are separate from rubric scores and are not independent human adjudication.

## Schedules and timing

The main no-retry experiment tested concurrency 2/4/8/16, with three 32-workflow rounds at each level (96 per level). Level order rotated by round. The retry16 plan had the same 96-workflow target but stopped after 48 on HTTP 401; do not treat it as completed validation.

Burst profiles start 4/8/12/16 workflows together. The stagger profile starts 16 workflows at 62.5 ms intervals. Arrival profiles start 4 or 8 workflows at each of t=0, 1 and 2 seconds. Rate sweeps do the same at 1/2/4/8 starts per second, totaling 45 workflows per model. These are short arrival bursts, not long sustained-load tests. Historical `c12` and `c24` directory names are total workflows, not arrival rates.

The reviewed main concurrency report gives **completed-only** latency. Many generated follow-up comparison files give **all-attempt** latency, including failed/timeout workflows. These cannot be compared without their denominators. A fast HTTP error is not a fast answer. Historical `requestsPerSecond` often counts all attempted workflows per elapsed wave time, not successful answers per second. Raw wave timing is retained so alternate denominators can be computed.

## Retries and failure accounting

The main concurrency and single bursts did not retry. Backoff profiles allowed up to three retries per API call (four total attempts), with 2/4/8-second exponential delays plus jitter and Retry-After handling capped at 60 seconds. Immediate profiles used no backoff timer. The rate sweeps and arrival8-10s profile used a 10-second call timeout; other API workloads used 90 seconds. HTTP 400 model-not-found was treated as temporarily retryable only in retry profiles; this was an observed workaround, not an assertion of official API semantics.

The four/sec immediate-policy run had zero actual retries, so its success is not evidence that retries fixed the service. In the eight/sec immediate-policy run, none of the 19 retried workflows recovered. Failed discovery, authorization episodes, partial workflows and successful reader calls inside failed workflows remain in evidence.

## Costs

The historical assumptions were input/output USD per million tokens: Qwen3.5-9B 0.07/0.23, Qwen3.6-35B-A3B 0.06/0.95, Qwen3.6-27B 0.29/1.90. The benchmark recorded these from the [pricing reference](https://docs.salad.com/ai-gateway/reference/pricing) at test time; they are not a claim about current prices. Provider-reported generated token counts remain billable estimates even when the output fails grading. Missing usage is unknown charge, not evidence of zero cost. Local GPU electricity, depreciation and rental costs were not measured.

## Public export and portable rerun differences

The original results have not been remeasured for publication. Local filesystem roots, account directory paths and host name were normalized. Personal introductory reader comments were removed without changing executable parser or prompt text. `export-manifest.json` records before/after hashes. Completion IDs, timestamps, usage, outputs, errors and numeric measurements are retained for correlation. No API credentials, model weights, production data or resume are included.

The new portable runner removes shared-machine scheduling/locks, consolidates historical scripts into profiles, adds explicit billable execution opt-in, logs transport errors consistently and reports completed-only and all-attempt latency separately. It does not reproduce local controller overhead, original network/provider conditions, historical model deployments or hardware contention. Its offline tests verify the schedule and failure handling; they do not establish fresh Salad performance.

Historical hashes in specifications refer to the original local files, not all of which are byte-identical after public normalization. The original receipt/status is retained even where a generated comparison file exists. A completed workload with API errors is not a successful service gate. An incomplete or disturbed run is not promoted to a passing result.
