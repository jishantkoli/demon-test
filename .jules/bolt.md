## 2026-06-13 - Parallel Aggregation for Dashboard Stats
**Learning:** Sequential database queries for dashboard statistics (15+ roundtrips) created a significant performance bottleneck. Combining these into parallelized MongoDB aggregation `$facet` pipelines reduced latency by over 70%. Additionally, large benchmark datasets (>5000 records) can cause timeouts in the current sandbox environment when using `mongodb-memory-server`.
**Action:** Use `$facet` for multi-metric dashboards and prefer medium-sized datasets (~1000-2000 records) for reliable benchmarking in this environment.
