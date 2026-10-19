# Salad AI Gateway inference benchmarks

**James McMenamin · Measurements October 15–16, 2026 UTC**

Benchmark harness, frozen game-question fixtures, raw responses and findings from an evaluation of Salad AI Gateway and local Gemma inference. Published as a technical work sample with a Staff Software Engineer, AI Inference Gateway application.

The central result: **Qwen3.6-35B-A3B performed well in single-request testing, while later availability failures prevented a reliable capacity conclusion.** This is an independent client-side evaluation, not a Salad-endorsed benchmark or a diagnosis of its internal infrastructure.

- [Full report PDF](docs/james-mcmenamin-salad-testing-report-2026-10-19.pdf)
- [Results and run index](docs/RESULTS.md)
- [Methodology and limitations](docs/METHODOLOGY.md)
- [Local GPU results](docs/local-gemma-concurrency.md)
- [Third-party fixture attribution](THIRD_PARTY.md)

## Key observations

| Experiment | Observation |
| --- | --- |
| 35B single-request answers | 30/30 rubric passes; 1.93 s median, 3.53 s p95; $0.170 per 1,000 answer attempts at recorded token rates |
| 35B main concurrency run | 384 workflows attempted; 137 completed; 134 completed answers passed the rubric |
| Availability failures | HTTP 400 model-not-found, HTTP 503, client timeouts; separate HTTP 401 episodes and later model-discovery absence |
| Local Gemma E4B | 480 workflows completed without request errors; four active slots had nearly the throughput of sixteen with much lower median latency |

One answer workflow normally makes two sequential calls: question interpretation, then a source-grounded answer. Repeated fixtures are not independent accuracy samples. Quality rubric passes are not exhaustive hallucination checks. Costs are usage-derived estimates, not invoice reconciliation; unreported charges for failed calls are unknown.

## Run offline checks

Requires Node.js 22 or later. No npm dependencies, credentials, GPU, or paid API calls are needed for these commands.

```sh
npm test
npm run verify
node bench.mjs concurrency
```

The last command prints a complete experiment plan and input hashes. It does **not** contact Salad. GitHub Actions runs the offline suite on Linux and Windows. No paid benchmark runs occur in CI.

## Run an API experiment

Use your own Salad API key through `SALAD_AI_GATEWAY_API_KEY`. Do not put it in source or commit a `.env` file. Model availability and prices may differ from October 2026.

```sh
# Set SALAD_AI_GATEWAY_API_KEY in your shell first.
node bench.mjs serial --model=qwen3.6-35b-a3b --execute
node bench.mjs concurrency --execute
node bench.mjs burst8 --execute
node bench.mjs arrival4-immediate --execute
node bench.mjs rate-sweep --model=qwen3.6-27b --execute
```

`--execute` makes billable API requests. The portable runner uses a best-effort $0.95 returned-usage guard; overlapping requests and charges without returned usage can exceed that amount. It preserves failed calls and partial outcomes. It stops subsequent waves after terminal 401/402/403/404 errors or the usage guard. Each error within an already-started wave is retained. No rate or concurrency limit is inferred from a single failed run.

Profiles: `serial`, `concurrency`, `retry16`, `burst4`, `burst8`, `burst12`, `burst16`, `stagger16`, `arrival4`, `arrival8`, `arrival4-backoff`, `arrival4-immediate`, `arrival8-immediate`, `arrival8-10s`, `rate-sweep`. `node bench.mjs --help` explains options.

New measurements are written to ignored `new-runs/` with a specification, raw response events, workflow outputs, retry records and separate completed-only/all-attempt latency summaries. They do not replace the historical evidence.

## Repository structure

- `bench.mjs`, `lib/runner.mjs`: portable rerun CLI and API engine. This cleaned-up implementation is new; it was not the exact program used for the historical measurements. It uses the frozen prompts/parser/grader and matching workload profiles. Read the documented differences before comparing runs.
- `lib/*.test.mjs`: the original 18 grading, measurement, usage and cost checks, unchanged except normalized line endings.
- `test/runner.test.mjs`: offline transport, scheduling, retry, partial-run and credential-handling tests for the portable runner.
- `fixtures/`: frozen inputs; `recent` values are synthetic development conversation fixtures, not exported Discord conversations.
- `results/`: sanitized historical outputs, summaries, review notes, specifications and receipts, including failed/interrupted runs. Some files preserve older generic report wording; the report and methodology explain timing denominators and actual schedules.
- `archive/harness/`: historical scripts for inspection. Machine-specific paths are normalized and some external dependencies are intentionally absent; these are archival source, not the supported portable entry point.
- `export-manifest.json`: original and public-export SHA-256 values. Local paths were normalized and reader header commentary removed. Historical `specId` values and source hashes identify original local inputs; they do not assert byte identity with normalized public exports.

## Local GPU reproduction

The archived local worker used node-llama-cpp 3.22.1, Vulkan, a pinned Gemma E4B GGUF, two CPU inference threads, per-slot 4096-token sequences and NVIDIA memory sampling. It also used a Windows-specific resource controller and an external runtime; it is not portable as exported. No model weights or model license grants are included. [The local results document](docs/local-gemma-concurrency.md) records the model revision, checksum, settings, shared-load limitations and original schedule. API reruns alone do not reproduce the local baseline.

## Licensing

Original harness code is MIT licensed. Wiki-derived passages and adaptations are separately attributed under CC BY-SA 4.0; this also applies to derived material where required. Provider responses are preserved as observations and may include wiki-derived language. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md).
