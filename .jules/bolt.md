## 2025-06-04 - Optimizing Dashboard Statistics with MongoDB Aggregation

**Learning:** Sequential database queries for dashboard statistics (e.g., multiple `countDocuments` calls) are a major performance anti-pattern as they increase latency linearly with the number of metrics. Using MongoDB `$facet` allows combining multiple counts into a single aggregation pipeline, and `Promise.all` can parallelize these pipelines across different collections.

**Action:** Consolidate multiple count/stat queries into parallel aggregation pipelines using `$facet` to minimize database roundtrips.
