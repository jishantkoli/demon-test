## 2026-05-09 - Optimized Dashboard Stats with MongoDB Aggregation
**Learning:** Sequential `countDocuments` calls for various statuses/roles create a significant performance bottleneck due to multiple database roundtrips. Using MongoDB's `$facet` combined with `$group` allows fetching all these counts in a single query per collection.
**Action:** Always prefer MongoDB aggregation pipelines with `$facet` for "stats" or "dashboard" style endpoints that need to return multiple counts or aggregated metrics from the same collection.
