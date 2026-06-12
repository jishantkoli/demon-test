## 2026-06-12 - Parallelizing Dashboard Statistics
**Learning:** Sequential `countDocuments` calls in a single API endpoint create a significant performance bottleneck due to multiple database roundtrips. Consolidating these into MongoDB aggregation pipelines using `$facet` and executing them in parallel with `Promise.all` can reduce latency by 50% or more.
**Action:** Always prefer MongoDB aggregation facets or groups when building dashboard statistics endpoints that require multiple counts from the same collection.
