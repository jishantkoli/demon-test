## 2025-05-14 - Optimizing Dashboard Statistics with Aggregation Facets
**Learning:** Sequential `countDocuments` calls in a single controller (15+ in this case) create significant database roundtrip overhead. Consolidating these into parallelized MongoDB aggregation pipelines using `$facet` and `Promise.all` can reduce latency by over 80%.
**Action:** Always identify patterns of multiple sequential queries for counts or status breakdowns and refactor them into single-collection aggregation facets executed in parallel.
