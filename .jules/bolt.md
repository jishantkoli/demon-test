## 2025-05-15 - Optimizing Dashboard Statistics with Parallel Aggregation

**Learning:** Sequential database queries (e.g., multiple `countDocuments` calls) in dashboard controllers are a performance anti-pattern. Each call adds network latency and query overhead. Consolidating these into parallelized MongoDB aggregation pipelines using `$facet` and `Promise.all` can significantly reduce latency.

**Action:** Always check for multiple sequential database counts or lookups in analytics/dashboard endpoints. Refactor them into parallelized aggregation pipelines to minimize database roundtrips.
