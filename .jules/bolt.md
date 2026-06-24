## 2026-06-24 - Parallelized Dashboard Stats
**Learning:** Sequential database calls (e.g., multiple countDocuments) in dashboard controllers are a performance anti-pattern. Consolidating them using MongoDB aggregation facets ($facet) or parallelizing with Promise.all significantly reduces latency by minimizing database roundtrips.
**Action:** Always use Promise.all or aggregation pipelines with facets for dashboard-like endpoints that aggregate data from multiple collections or statuses.
