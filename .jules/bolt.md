## 2025-05-22 - Dashboard Stats Optimization
**Learning:** Sequential `countDocuments` calls create a performance "waterfall" in dashboard endpoints. Consolidating them using MongoDB aggregation pipelines with `$facet` and `Promise.all` significantly reduces latency by minimizing database roundtrips.
**Action:** Always check for multi-count dashboard endpoints and use `$facet` to batch independent counts into a single aggregation query.
