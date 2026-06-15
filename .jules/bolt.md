## 2025-06-15 - Optimizing Dashboard Statistics with MongoDB Aggregation Facets

**Learning:** Sequential database queries (e.g., multiple `countDocuments`) in dashboard controllers are a performance anti-pattern. They cause unnecessary network roundtrips and overhead. Consolidating these into parallelized MongoDB aggregation pipelines using `$facet` and `$group`, then executing them with `Promise.all`, drastically reduces latency.

**Action:** Always identify dashboard endpoints with multiple counts or aggregations and refactor them to use `$facet` to minimize database roundtrips.
