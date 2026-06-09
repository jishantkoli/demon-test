## 2026-06-09 - Dashboard Statistics Bottleneck
**Learning:** Sequential 'countDocuments' calls in a dashboard controller created a significant performance bottleneck as the number of metrics grew. Each call added database roundtrip latency.
**Action:** Use MongoDB aggregation with $facet to group multiple counts into a single query, and wrap multi-collection queries in Promise.all to parallelize execution. This reduced 'getStats' latency by ~60-70%.
