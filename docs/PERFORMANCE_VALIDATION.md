# RFI14 performance evidence

## Reproduce the local component benchmark

Run `npm run benchmark:refresh`. To vary the synthetic baseline, set `BENCHMARK_BASE_ROWS` to an integer from120 to100000. Each run measures baseline,2x and5x in sequential fresh Node processes, with one warm-up and three measured iterations. Output is `docs/performance/refresh-latest.json`. Existing output is replaced only after all scales succeed.

The report records hardware/runtime, source and bundle SHA-256 hashes, Git revision and working-tree status, individual timings/CPU, throughput and worker peak RSS. Source hashes identify the measured working tree, including uncommitted changes. The benchmark changes every100th row's source revision and availability time, retaining null results and comparators. Exact reconstructed target equality and idempotent replay are required at every iteration; a mismatch exits unsuccessfully.

This is **synthetic component evidence**, not representative hospital validation. It measures snapshot hashes, incremental plan generation, JSON serialization/parsing and application. It excludes fixture generation and assertions from elapsed time. Peak RSS includes the whole worker, fixture copies, warm-up and assertions, so it cannot identify stage-specific memory. Node garbage collection and host contention can affect results. Three repetitions provide a useful baseline, not a statistical service-level guarantee.

## Evidence still required before claiming criterion14

Agree the actual baseline volume and content mix with the site and program. Do not derive hospital capacity by multiplying this benchmark's throughput. Capture the following for baseline,2x and5x on the approved target VM:

| Workload | Required measurements and checks |
| --- | --- |
| Initial source extraction | Source read rate, permissions/cohort evaluation, failed rows, source impact and exact count reconciliation |
| Full refresh | All processing stages, total time, CPU, peak RAM, disk high-water mark and output bytes |
| Incremental refresh | Corrections, authoritative deletions/merges/unmerges, late arrivals, repeat delivery and loss recovery |
| Document extraction | Agreed PDF/DOCX/text/image mix, scans and tables, reader/model versions, recall and false positives with source-grounded review |
| Encrypted package delivery | Encryption and durable save, broker transfer/retries/acknowledgments, disk and network constraints |
| Site operator work | Hands-on setup, review and recovery minutes, blockers and support interventions; record measured time rather than an assumed staffing estimate |

For each case, retain exact source/request/permission/software/model identities, actual counts and sizes, stage outcomes, failures, resource samples and operator timings. Define acceptable latency, resource headroom and error-rate limits with the program before assigning a pass. Repeat under expected VM contention and validate UI responsiveness independently of Node processing time.

Current gates remain open: representative site baseline, approved target VM, real connectors/authority/broker, end-to-end extraction accuracy, disk/network metrics and measured staffing.

## Recorded local run — 2026-09-13T17:26:07.671Z

| Synthetic rows | Median measured time | Median rows/sec | Whole-worker peak RSS |
| --- | --- | --- | --- |
| 12,000 | 0.265 s | 45,365 | 478 MiB |
| 24,000 | 0.573 s | 41,888 | 797 MiB |
| 60,000 | 1.581 s | 37,951 | 1,512 MiB |

These are component results on Apple M4 / v26.7.0. The memory figure includes benchmark fixture copies and assertions. It is not native-app memory or a hospital capacity result.
