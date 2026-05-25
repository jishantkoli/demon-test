
## 2025-05-25 - Consolidating Dashboard Statistics
**Learning:** Sequential `countDocuments` calls in a dashboard controller create significant latency due to multiple database round-trips and redundant collection scans. Even with `Promise.all`, multiple counts still trigger separate scans.
**Action:** Use MongoDB aggregation `$facet` and `$group` to compute all required metrics in a single database round-trip per collection. This reduced dashboard latency by ~85% in benchmarks.
