## 2025-05-15 - Optimizing Dashboard Statistics with $facet

**Learning:** Sequential `countDocuments()` calls in Express controllers (common in dashboard logic) create a significant performance bottleneck due to cumulative database roundtrip latency. For example, 17 sequential counts were reduced to 4 parallelized aggregation queries. Using MongoDB's `$facet` operator allows for multiple aggregation pipelines to be executed within a single `aggregate()` command, effectively batching status-based or role-based counts.

**Action:** When encountering multiple count operations on the same collection with different filters, refactor them into a single `$facet` aggregation pipeline. Combine unrelated collection queries using `Promise.all` for maximum concurrency.
