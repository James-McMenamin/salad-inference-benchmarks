# Salad API versus local Gemma E4B

Measured October 15, 2026. API results are new; Gemma reuses the same-day frozen local baseline. One active request at a time. Three repetitions of 24 interpretation cases, ten grounded-answer cases and twelve question-classification cases: 138 trials per model, not 138 distinct questions.

| Model | Interpretation | Grounded answer | Question judge | Answer median | Answer p95 | USD / 1,000 answer attempts | USD / 1,000 rubric passes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gemma E4B local (historical baseline) | 57/72 | 30/30 | 33/36 | 0.79 s | 1.08 s | not measured | not measured |
| qwen3.5-9b | 36/72 | 17/30 | 24/36 | 5.83 s | 14.68 s | 0.193 | 0.340 |
| qwen3.6-35b-a3b | 60/72 | 30/30 | 36/36 | 1.93 s | 3.53 s | 0.170 | 0.170 |

Answer timing and cost include both interpretation and answer generation. Standalone question judging is separate. Selected source passages, recent-chat fixtures, prompts, token limits and grading are held constant. API requests use temperature zero and chat_template_kwargs.enable_thinking=false. Gemma thinking was also disabled. No timed request is silently retried.

## Cost and token evidence

Costs use provider-reported prompt_tokens and completion_tokens at the pricing-reference rates: Qwen3.5-9B $0.07/$0.23 per million input/output tokens; Qwen3.6-35B-A3B $0.06/$0.95. These are usage-derived charges, not an independently reconciled credit-balance debit or invoice. The marketing homepage currently lists different 9B rates; this report uses the explicit pricing reference at https://docs.salad.com/ai-gateway/reference/pricing. All generated tokens, including unsuccessful output, remain in the cost denominator.

- Gemma E4B local (historical baseline): mean 1805.1 input and 58.9 output tokens per reader-plus-answer trial.
- qwen3.5-9b: mean 1844.2 input and 276.4 output tokens per reader-plus-answer trial; all-task run cost $0.015637.
- qwen3.6-35b-a3b: mean 1846.0 input and 62.4 output tokens per reader-plus-answer trial; all-task run cost $0.015373.

Owned local GPU electricity and depreciation were not measured; zero API charges does not mean zero operating cost. No rented GPU was used for this API comparison. Preparatory probes are retained separately and excluded from timed benchmark totals.

## Limits

Automatic scores check required facts, citations, interpretation and abstention. They are not exhaustive hallucination checks. Inspect answer texts against sources before choosing a model. The 9B endpoint produced malformed or repetitive output with this configuration; these observations do not establish the underlying model capability under other serving settings. API latency includes internet/provider overhead; local Gemma timing excludes it. Retrieval, Discord delivery, live memory, additional support checks and production four-request queueing are outside this test. The same-day baseline had shared host load and resident bot activity. API quantization and host hardware were not disclosed.

Raw requests are public frozen test fixtures. Response files retain provider IDs, usage, finish reasons and reasoning fields without credentials. Per-task totals and failures are in review-data.json; raw outputs and costs are in each model subdirectory. Failed startup/transport attempts remain in prior run folders.

## Assistant output review

The thirteen distinct 35B-A3B grounded-answer texts were checked against the supplied sources and were supported. Its remaining interpretation failures include guessing ambiguous `ss`, losing map-follow-up context, and dropping the title in a misspelled NPC name. Twelve of the thirteen failed 9B grounded trials produced repetitive non-English output; the other lost a pronoun referent and declined. This identifies endpoint/configuration behavior, not its root cause.

All 18 benchmark harness checks passed. Both API models completed all 138 predeclared trials (165 calls each). Frozen input hashes were rechecked after completion, and inputs are copied into this run directory.
