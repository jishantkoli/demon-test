## 2025-06-03 - Parallel MongoDB Aggregations for Dashboard Stats
**Learning:** Sequential database count operations (15+ calls) in dashboard controllers create a major performance bottleneck due to multiple network round-trips.Consolidating these into parallelized aggregation pipelines using `$facet` and `Promise.all` can reduce latency by over 80%.
**Action:** Always prefer MongoDB `$facet` or `$group` for retrieving multiple statistics in a single request. Parallelize independent queries using `Promise.all` to minimize wait time.
