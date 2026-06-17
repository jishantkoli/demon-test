## 2025-05-15 - [Parallelizing Dashboard Stats]
**Learning:** Sequential `countDocuments` calls in a dashboard controller create a significant performance bottleneck as the number of metrics grows. Each call adds a full database roundtrip of latency.
**Action:** Use `Promise.all` to parallelize independent count queries. This reduced latency by ~54% in the `getStats` endpoint.
