# qwen3.6-27b Salad API arrival-rate test

1/2/4/8 questions per second, three bursts per level at t=0/1/2 seconds. cN directory labels show total questions per level, not arrival rate. Each request interprets the messy question and answers from fixed wiki passages. Levels rotate order between rounds. Thinking disabled, temperature zero. Up to three retries per failed API call immediately, without a backoff timer. Latency includes retries.

| Simultaneous requests | Passed | Errors | Median response | p95 response | Requests/sec | USD/1,000 attempts | USD/1,000 passes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 3/3 | 0 | 6.34 s | 16.18 s | 0.19 | $0.648 | $0.648 |
| 6 | 6/6 | 0 | 9.28 s | 17.69 s | 0.30 | $0.667 | $0.667 |
| 12 | 2/12 | 10 | 24.53 s | 30.05 s | 0.39 | $0.240 | $1.442 |
| 24 | 2/24 | 22 | 23.01 s | 35.29 s | 0.55 | $0.164 | $1.964 |

Latency is complete reader-plus-answer response time including network/provider overhead. Throughput divides requests by sum of elapsed wave times, excluding evidence writes. These are repeated short-case bursts, not a sustained-load capacity guarantee. Scores are automatic fact/citation/abstention rubric passes, requiring output review. No streaming TTFT measurement was taken.

Costs use provider-reported input/output token counts at the model rates in spec.json per million tokens from https://docs.salad.com/ai-gateway/reference/pricing. They are calculated usage charges, not invoice reconciliation. Failed HTTP requests without usage have unknown charge; no request is silently treated as successful as uncharged. Retry attempts are preserved in wave results and raw responses. Separate production classification/support/background calls are excluded.

Total observed usage-derived cost: $0.012758.
