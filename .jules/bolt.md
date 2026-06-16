## 2025-05-15 - Optimizing Dashboard Statistics with Parallel Aggregation
**Learning:** Sequential database queries (e.g., multiple `countDocuments`) in dashboard controllers are a performance anti-pattern, causing high latency due to multiple roundtrips. Using MongoDB aggregation `$facet` allows combining multiple counts into a single query.
**Action:** Use `$facet` and `Promise.all` to parallelize independent model aggregations in statistics/dashboard endpoints.
