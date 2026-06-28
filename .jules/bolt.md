## 2026-06-28 - Parallelizing Dashboard Stats
**Learning:** Sequential database queries in dashboard controllers are a major performance bottleneck, especially when multiple independent counts are required.
**Action:** Use Promise.all to parallelize independent countDocuments or find calls. For complex breakdowns, consider MongoDB aggregation facets ($facet).
