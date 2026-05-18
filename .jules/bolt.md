## 2026-05-18 - Optimized Dashboard Stats via Aggregation Facets
**Learning:** Sequential `countDocuments` calls create significant database roundtrip overhead. Replacing ~18 individual queries with 4 parallel `$facet` aggregation pipelines reduced dashboard latency from 23.31ms to 2.88ms (~87% improvement).
**Action:** Use MongoDB `$facet` for multi-metric dashboards and always wrap independent database queries in `Promise.all` to minimize total RTT.
