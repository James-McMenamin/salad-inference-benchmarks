# Publication validation

Publication uses offline checks only. No new paid API workloads or GPU benchmarks were run to publish the historical evidence.

## Initial cross-platform failure

[Initial CI run](https://github.com/James-McMenamin/salad-inference-benchmarks/actions/runs/39306662342) retained a failing Linux export-hash check; its Windows matrix job was cancelled by fail-fast. All 27 offline tests passed on Linux before the hash check failed.

Root cause: the initial export hashed some archived text files with CRLF line endings in the working tree, while `.gitattributes` correctly stored those files as LF in Git. For `archive/harness/salad-api-concurrency-retry.mjs`, the original public working copy had 135 CRLF sequences and hash `cba15bb3196a0f804cd973e0f8f96f67f0f992928665760b9136b7b788ab236d`; converting CRLF to LF produced `20d0e7ba150aac631ccaf1f382c76c5b405373d0106e79ec0a7e2f88cfbbf2f0`, exactly matching the Linux checkout.

The correction normalizes exported text files to LF before computing their public hashes. Original-source SHA-256 values are preserved. The archive's Git-stored source contents and benchmark measurements are unchanged by the correction. Export hash assertions remain required on both operating systems; the failure was not bypassed or retried on unchanged inputs.

Current CI validates all 27 offline tests, all 322 historical export hashes, headline totals, partial-run statuses, credential/local-path patterns, and non-billable CLI plans on Linux and Windows. A green check establishes offline harness/export correctness, not fresh provider performance or production capacity.
