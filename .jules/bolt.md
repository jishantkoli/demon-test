## 2025-05-15 - Optimizing Dashboard Statistics with Parallel Aggregations
**Learning:** Sequential database roundtrips (multiple countDocuments calls) in dashboard controllers are a significant performance anti-pattern. Consolidating these into parallel Promise.all calls and using MongoDB's $group aggregation reduces latency by over 80% (from ~25ms to ~4ms in this case).
**Action:** Always prefer Promise.all for independent queries and use aggregation facets or grouping to combine related counts into a single database trip.
