# Qwen3.6-35B-A3B concurrency test: reviewed results

384 reader-plus-answer questions attempted, 96 per level. Ten frozen messy Discord questions and wiki sources repeated in three rounds, with level order rotated. Thinking disabled, temperature zero, no retries. Complete workload finished; input hashes matched. Provider errors prevent capacity certification.

| Concurrent | Completed / attempted | Rubric passes / completed | Completed median | Completed p95 | Cost / completed answer |
| --- | --- | --- | --- | --- | --- |
| 2 | 40/96 | 38/40 | 1.86 s | 3.72 s | $0.000171 |
| 4 | 64/96 | 64/64 | 1.56 s | 3.55 s | $0.000172 |
| 8 | 32/96 | 31/32 | 1.97 s | 5.06 s | $0.000173 |
| 16 | 1/96 | 1/1 | 3.55 s | 3.55 s | $0.000167 |

The 16-concurrency row has only one completed answer and is not representative. Completed answers at 2/4/8 cost about $0.171–$0.173 per 1,000, including reader and answer calls.

The first two 16-request waves produced service-unavailable responses and timeouts. Later waves at multiple levels returned HTTP 400 “model does not exist” and some 503 responses, before service recovered late in round three. This does not prove that concurrency caused the incident or establish a maximum capacity. Quick error responses are excluded from the timing table. Original comparison.json retains all-attempt timings for audit.

137 workflows completed; 134 passed the automatic rubric. Three incorrect NPC abstentions occurred. Review of all distinct case/answer combinations also found a recipe answer claiming required Enchanting skill 25, although the source distinguishes Start 5 and Trivial 25. Rubric passes are not exhaustive accuracy.

Total observed usage-derived charge: $0.02623435 (2.62 cents), including successful API calls in failed workflows. Failed calls without usage have unknown charges; this is not invoice reconciliation. Documented rates: $0.06 input / $0.95 output per million tokens: https://docs.salad.com/ai-gateway/reference/pricing.

Latency includes network and provider queueing for reader plus answer calls. Fixed knowledge-base passages were supplied; production retrieval, Discord delivery and other classification/background calls are excluded. Short waves do not establish sustained capacity. No streaming first-token or VRAM measurement.
