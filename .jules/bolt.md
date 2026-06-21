# Bolt's Journal - Critical Learnings Only
## 2026-06-21 - Baseline stats performance
**Learning:** Current `getStats` implementation is sequential and lacks indexes, resulting in ~15-18ms latency even with small datasets.
**Action:** Parallelize queries using aggregation facets and add indexes to key fields.
## 2026-06-21 - Stats optimization results
**Learning:** Refactoring sequential counts to parallelized aggregation facets reduced latency by ~83-88%. Admin latency dropped from 15.3ms to 2.6ms.
**Action:** Always prefer `$facet` for dashboard statistics to minimize database roundtrips.
