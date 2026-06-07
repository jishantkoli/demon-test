## 2026-06-07 - Dashboard Stats Optimization
**Learning:** Sequential database queries (like multiple `countDocuments`) in dashboard controllers create significant latency due to network roundtrips and repetitive collection scans. Consolidation into a single aggregation pipeline using `$facet` and `$group` reduces database load and response time.
**Action:** When implementing summary statistics or dashboard widgets, always use MongoDB aggregation facets to batch queries for the same collection into one operation.
