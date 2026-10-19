# qwen3.5-9b Salad API arrival-rate test

1/2/4/8 questions per second, three bursts per level at t=0/1/2 seconds. cN directory labels show total questions per level, not arrival rate. Each request interprets the messy question and answers from fixed wiki passages. Levels rotate order between rounds. Thinking disabled, temperature zero. Up to three retries per failed API call immediately, without a backoff timer. Latency includes retries.

| Simultaneous requests | Passed | Errors | Median response | p95 response | Requests/sec | USD/1,000 attempts | USD/1,000 passes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 3/3 | 0 | 7.86 s | 8.67 s | 0.28 | $0.162 | $0.162 |
| 6 | 5/6 | 0 | 2.86 s | 12.00 s | 0.43 | $0.154 | $0.185 |
| 12 | 6/12 | 5 | 22.15 s | 29.69 s | 0.40 | $0.112 | $0.225 |
| 24 | 1/24 | 22 | 11.51 s | 25.29 s | 0.66 | $0.055 | $1.315 |

Latency is complete reader-plus-answer response time including network/provider overhead. Throughput divides requests by sum of elapsed wave times, excluding evidence writes. These are repeated short-case bursts, not a sustained-load capacity guarantee. Scores are automatic fact/citation/abstention rubric passes, requiring output review. No streaming TTFT measurement was taken.

Costs use provider-reported input/output token counts at the model rates in spec.json per million tokens from https://docs.salad.com/ai-gateway/reference/pricing. They are calculated usage charges, not invoice reconciliation. Failed HTTP requests without usage have unknown charge; no request is silently treated as successful as uncharged. Retry attempts are preserved in wave results and raw responses. Separate production classification/support/background calls are excluded.

Total observed usage-derived cost: $0.004074.
