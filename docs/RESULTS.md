# Results and evidence index

Measurements October 15–16, 2026 UTC. Historical results have not been rerun for publication. All rows refer to workflows/tasks, not unique questions. Read [methodology](METHODOLOGY.md) before comparing timings.

| Run UTC identifier | Recorded status | Attempted/completed counter | Evidence |
| --- | --- | --- | --- |
| 2026-10-15T09-41-12-711Z | completed-reviewed-by-assistant | see receipt | [evidence](../results/2026-10-15T09-41-12-711Z/comparison.md) |
| concurrency-2026-10-15T21-16-05-155Z | completed-reviewed-by-assistant | see receipt | [evidence](../results/concurrency-2026-10-15T21-16-05-155Z/comparison.md) |
| salad-api-2026-10-15T22-24-27-692Z | failed | 0 | [evidence](../results/salad-api-2026-10-15T22-24-27-692Z/receipt.json) |
| salad-api-2026-10-15T22-25-16-854Z | completed-reviewed-by-assistant | 276 | [evidence](../results/salad-api-2026-10-15T22-25-16-854Z/comparison.md) |
| salad-api-concurrency-2026-10-15T22-50-02-529Z | completed-reviewed-by-assistant | 384 | [evidence](../results/salad-api-concurrency-2026-10-15T22-50-02-529Z/comparison.md) |
| salad-api-concurrency-retry-2026-10-15T23-02-10-591Z | failed | 48 | [evidence](../results/salad-api-concurrency-retry-2026-10-15T23-02-10-591Z/receipt.json) |
| salad-api-eight-burst-2026-10-15T23-19-50-990Z | completed-needs-review | 8 | [evidence](../results/salad-api-eight-burst-2026-10-15T23-19-50-990Z/comparison.md) |
| salad-api-eight-per-second-2026-10-15T23-49-26-097Z | completed-needs-review | 24 | [evidence](../results/salad-api-eight-per-second-2026-10-15T23-49-26-097Z/comparison.md) |
| salad-api-eight-per-second-immediate-retry-10s-2026-10-16T00-38-30-986Z | failed | 0 | [evidence](../results/salad-api-eight-per-second-immediate-retry-10s-2026-10-16T00-38-30-986Z/receipt.json) |
| salad-api-eight-per-second-immediate-retry-2026-10-16T00-33-18-303Z | completed-needs-review | 24 | [evidence](../results/salad-api-eight-per-second-immediate-retry-2026-10-16T00-33-18-303Z/comparison.md) |
| salad-api-four-burst-2026-10-15T23-18-29-596Z | completed-needs-review | 4 | [evidence](../results/salad-api-four-burst-2026-10-15T23-18-29-596Z/comparison.md) |
| salad-api-four-per-second-2026-10-15T23-59-58-826Z | failed | 12 | [evidence](../results/salad-api-four-per-second-2026-10-15T23-59-58-826Z/receipt.json) |
| salad-api-four-per-second-2026-10-16T00-11-04-349Z | completed-needs-review | 12 | [evidence](../results/salad-api-four-per-second-2026-10-16T00-11-04-349Z/comparison.md) |
| salad-api-four-per-second-immediate-retry-2026-10-16T00-32-22-273Z | completed-needs-review | 12 | [evidence](../results/salad-api-four-per-second-immediate-retry-2026-10-16T00-32-22-273Z/comparison.md) |
| salad-api-four-per-second-retry-2026-10-16T00-19-43-586Z | completed-needs-review | 12 | [evidence](../results/salad-api-four-per-second-retry-2026-10-16T00-19-43-586Z/comparison.md) |
| salad-api-probe-20261015T222223Z | diagnostic/probe or empty startup | not scored | [evidence](../results/salad-api-probe-20261015T222223Z/response.json) |
| salad-api-rate-sweep-qwen3.5-9b-2026-10-16T00-46-03-119Z | completed-needs-review | 45 | [evidence](../results/salad-api-rate-sweep-qwen3.5-9b-2026-10-16T00-46-03-119Z/comparison.md) |
| salad-api-rate-sweep-qwen3.6-27b-2026-10-16T00-47-35-257Z | completed-needs-review | 45 | [evidence](../results/salad-api-rate-sweep-qwen3.6-27b-2026-10-16T00-47-35-257Z/comparison.md) |
| salad-api-sixteen-burst-2026-10-15T23-20-29-112Z | completed-needs-review | 16 | [evidence](../results/salad-api-sixteen-burst-2026-10-15T23-20-29-112Z/comparison.md) |
| salad-api-sixteen-staggered-2026-10-15T23-38-38-515Z | completed-needs-review | 16 | [evidence](../results/salad-api-sixteen-staggered-2026-10-15T23-38-38-515Z/comparison.md) |
| salad-api-twelve-burst-2026-10-15T23-42-51-187Z | completed-needs-review | 12 | [evidence](../results/salad-api-twelve-burst-2026-10-15T23-42-51-187Z/comparison.md) |
| salad-gateway-diagnostic-2026-10-15T23-16-59-956Z | diagnostic/probe or empty startup | not scored | [evidence](../results/salad-gateway-diagnostic-2026-10-15T23-16-59-956Z/results.json) |

The receipt `completed` counter often means workflows attempted/recorded, including errors; it is not the successful-answer count. The main concurrency run recorded 384 attempted, 137 completed and 134 rubric passes. The retry16 run stopped after 48/96 with 31 complete answers. The failed arrival8-10s run had zero workflow attempts because model discovery did not list the requested model.

## Key source reports

- [Initial serial comparison](../results/salad-api-2026-10-15T22-25-16-854Z/comparison.md)
- [Reviewed main concurrency results](../results/salad-api-concurrency-2026-10-15T22-50-02-529Z/comparison.md)
- [Partial retry results](../results/salad-api-concurrency-retry-2026-10-15T23-02-10-591Z/results-and-answers.txt)
- [Local Gemma results](local-gemma-concurrency.md)

## Preserved startup attempts

The original empty startup directory salad-api-2026-10-15T22-24-06-345Z contained no files and is not representable as a Git directory. The subsequent 22-24-27 startup failure is retained, including its HTTP 400 invalid-request-body receipt. Neither contributes benchmark scores.
