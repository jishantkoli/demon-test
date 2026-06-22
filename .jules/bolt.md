## 2024-06-22 - Parallelizing Database Counts

**Learning:** Sequential database queries (even simple `countDocuments`) are a major bottleneck in dashboard endpoints. Parallelizing 13+ sequential calls into a single `Promise.all` batch reduced dashboard latency by ~64% (from ~17ms to ~6ms) in a moderate dataset.

**Action:** Always prefer `Promise.all` or MongoDB `$facet` for aggregation/stats endpoints with multiple independent counts.
