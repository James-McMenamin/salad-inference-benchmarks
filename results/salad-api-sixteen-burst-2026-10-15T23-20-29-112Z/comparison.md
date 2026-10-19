# Qwen3.6-35B-A3B Salad API concurrency test

One simultaneous burst of sixteen reader-plus-answer questions. No retries. Each request interprets the messy question and answers from fixed wiki passages. Levels rotate order between rounds. Thinking disabled, temperature zero. No automatic retries.

| Simultaneous requests | Passed | Errors | Median response | p95 response | Requests/sec | USD/1,000 attempts | USD/1,000 passes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 16 | 1/16 | 15 | 90.01 s | 95.59 s | 0.17 | $0.087 | $1.387 |

Latency is complete reader-plus-answer response time including network/provider overhead. Throughput divides requests by sum of elapsed wave times, excluding evidence writes. These are repeated short-case bursts, not a sustained-load capacity guarantee. Scores are automatic fact/citation/abstention rubric passes, requiring output review. No streaming TTFT measurement was taken.

Costs use provider-reported input/output token counts at $0.06/$0.95 per million tokens from https://docs.salad.com/ai-gateway/reference/pricing. They are calculated usage charges, not invoice reconciliation. Failed HTTP requests without usage have unknown charge; no request is silently treated as successful or retried. Separate production classification/support/background calls are excluded.

Total observed usage-derived cost: $0.001387.
