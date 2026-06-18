## 2026-06-18 - Dashboard Optimization with MongoDB Aggregation Facets
**Learning:** Sequential database queries (multiple countDocuments) in dashboard controllers are a performance anti-pattern. Consolidating them using MongoDB aggregation facets ($facet) and parallelizing with Promise.all significantly reduces database roundtrips and latency.
**Action:** Always check for sequential count operations in analytics/stats endpoints and refactor them into a single aggregation pipeline where possible.
