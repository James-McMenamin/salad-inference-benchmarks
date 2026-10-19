# MnMOracle comparison review

All three models completed 46 identical development cases, repeated three times, on the RTX 3090 Ti on October 15, 2026. These are 24 distinct reader cases, 10 grounded questions, and 12 judge cases per model, not 138 independent accuracy examples. Production remains on Qwen.

The user authorized shared CPU load. Workers ran BelowNormal on logical CPUs 22 and 28 with two inference threads, 4096-token contexts, 512-token batches, and thinking disabled. NVIDIA-only counters and startup Vulkan device restriction were verified. Measurements are from one active request and exclude retrieval, full production routing, Discord/network overhead, and concurrent throughput. Model order was Qwen, E2B, E4B; background load was uncontrolled. This is useful operational evidence, not isolated maximum performance or a statistically conclusive ranking.

## Measured results

| Metric | Qwen3 4B Q4_K_M | Gemma 4 E2B QAT Q4_0 | Gemma 4 E4B QAT Q4_0 |
| --- | --- | --- | --- |
| Reader contract passes | 42/72 | 42/72 | 57/72 |
| Game question versus banter passes | 30/36 | 24/36 | 33/36 |
| Grounded answer strict rubric passes | 30/30 | 21/30 | 30/30 |
| Required factual content or valid abstention after assistant review | 30/30 | 30/30 | 30/30 |
| Median reader latency | 442 ms | 353 ms | 589 ms |
| Median reader plus grounded answer latency | 609 ms | 493 ms | 791 ms |
| p95 reader plus grounded answer latency | 786 ms | 886 ms | 1083 ms |
| Incremental model loading VRAM | 2385 MiB | 1289 MiB | 2706 MiB |
| Incremental first context VRAM | 877 MiB | 570 MiB | 658 MiB |
| Incremental second context VRAM | 878 MiB | 575 MiB | 658 MiB |
| Sampled peak additional VRAM above pre-load baseline | 3287 MiB | 1879 MiB | 3580 MiB |

The background bot and desktop are excluded only by subtracting the measured pre-load baseline; their activity can still affect deltas. Sampled peaks are not guaranteed instantaneous maxima. Additional context allocations include work buffers, not only KV cache. Model file sizes are 2497281120, 3349516256, and 5154941280 bytes respectively; file size and dedicated VRAM residency differ. Gemma uses per-layer embedding tables and backend-specific placement; do not treat its lower VRAM delta as its entire RAM requirement or assume every tensor is GPU resident simply because all transformer layers were offloaded.

## Answer review

The assistant inspected the unique grounded answer text across all repetitions against the frozen source passages. Answers were identical within each model across repetitions. Each model supplied the required facts for all seven answerable questions and abstained on all three questions lacking evidence. No fabricated release date, Discord account, or drop percentage appeared. This is an assistant review, not independent human adjudication.

E2B's nine strict failures are the same three abstentions repeated: it used variants such as "The wiki does not say" and "The provided sources do not contain information" rather than the exact required contraction. Keep those original rubric failures; they are output-contract failures, not fabricated answers. E2B's recipe output was more verbose than the desired short reply. Qwen's recipe reply combines the station and vessel into wording that should be checked against the game's actual crafting behavior before treating that extra detail as instructions; the required ingredients themselves were correct.

## Reader and judge findings

The reader score checks required terms, intent fields, separate questions, and ambiguity handling. It is not a complete semantic accuracy score. Examples found during review:

- E4B correctly switched from Fallen Pass to Glass Flats after "nah glass flats lvl not fallen pass"; Qwen and E2B retained Fallen Pass.
- E4B split "where abbot harrow at n what class is he" into two questions; Qwen lost the class question, and E2B retained both in a single question rather than the required separate fields.
- E2B rewrote "aashirs journal wat drops it" as "what does aashirs journal drop", reversing the relation despite passing the keyword rubric. The supplied source still led its final answer to the correct dropper.
- E2B added an unasked charm question to the necromancer pet follow-up despite passing the main-question rubric.
- E4B left the second Sweet Treat question without its own explicit quest name despite passing the split-question rubric; it is not fully standalone.
- All three guessed Shallow Shoals for ambiguous "ss", even though two zones were supplied. All three failed to flag "where are they tho" with no meaningful context as ambiguous. The existing prompt's where-question rule does not settle two place meanings; this is also a prompt-design limitation.
- Qwen's quest rewrite preserved "who gives" but returned an `asks` field of `what`; its strict failure is not equivalent to losing the question's meaning.

Judge errors were all missed game questions in this small set. Qwen missed "bank nh were" and "glass flats connected 2 where". E2B missed those plus the fishing-pole and journal-drop questions. E4B missed only "bank nh were". All six banter/non-game cases passed for every model in every repetition.

## Recommendation

E4B is the strongest next candidate for the actual Discord interpretation workload in this development set. It improved reader-contract passes from 58.3% to 79.2% and judge decisions from 83.3% to 91.7%, at about 30% higher median reader-plus-answer latency and 293 MiB higher sampled peak additional VRAM than Qwen. E2B is the fastest and lightest option here, but its question-detection and interpretation failures make it a weaker default for automatic Discord chime-in.

Do not switch production from this small development set alone. Next evaluate an anonymized held-out set of real Discord messages, full source retrieval and authority checks, model-neutral feature profiles, semantic grading of rewritten relationships, and actual 2/4/8-request workloads. Keep output-contract behavior and factual correctness separate. Neither Gemma has been enabled in production.

## Preserved evidence

Raw per-case output, latency records, memory samples, model hashes, settings, and native runtime identity remain in this run directory and the prepared specification. The initial mixed-device telemetry attempt and subsequent failed startup-device guard remain in their own run directories. Neither was silently retried or counted as valid final measurement evidence. The completed run is `2026-10-15T09-41-12-711Z`; see `comparison.json`, `comparison.md`, and each model's `results.jsonl`, `summary.json`, and `samples.json`.
