## 2025-05-22 - Dashboard Stats Aggregation Optimization
**Learning:** Sequential `countDocuments` calls in dashboard endpoints are a major bottleneck as the number of metrics grows. Combining these into a single MongoDB aggregation using `$facet` and parallelizing independent model queries with `Promise.all` can reduce latency by over 80%.
**Action:** When building dashboard or statistics endpoints, prioritize MongoDB aggregation pipelines with `$facet` to consolidate counts and groupings into a single database roundtrip.
