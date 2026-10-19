# Qwen3.6-35B-A3B Salad API concurrency test

Four questions at offsets 0, 1000 and 2000 ms; 12 total, earlier questions may still be running. Each request interprets the messy question and answers from fixed wiki passages. Levels rotate order between rounds. Thinking disabled, temperature zero. Up to three retries per failed API call immediately, without a backoff timer. Latency includes retries.

| Simultaneous requests | Passed | Errors | Median response | p95 response | Requests/sec | USD/1,000 attempts | USD/1,000 passes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 | 12/12 | 0 | 1.90 s | 5.63 s | 2.13 | $0.172 | $0.172 |

Latency is complete reader-plus-answer response time including network/provider overhead. Throughput divides requests by sum of elapsed wave times, excluding evidence writes. These are repeated short-case bursts, not a sustained-load capacity guarantee. Scores are automatic fact/citation/abstention rubric passes, requiring output review. No streaming TTFT measurement was taken.

Costs use provider-reported input/output token counts at $0.06/$0.95 per million tokens from https://docs.salad.com/ai-gateway/reference/pricing. They are calculated usage charges, not invoice reconciliation. Failed HTTP requests without usage have unknown charge; no request is silently treated as successful as uncharged. Retry attempts are preserved in wave results and raw responses. Separate production classification/support/background calls are excluded.

Total observed usage-derived cost: $0.002062.
