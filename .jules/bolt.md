
## 2026-05-27 - Dashboard Statistics Optimization
**Learning:** Sequential database queries (countDocuments) in a dashboard controller are a major bottleneck. Consolidating them into parallelized MongoDB aggregation pipelines using $facet significantly reduces database round-trips and improves performance. Adding indexes on frequently filtered fields like 'status' and 'role' further accelerates these queries.
**Action:** Use $facet and Promise.all for dashboard/stats controllers. Always ensure frequently queried status fields are indexed.
