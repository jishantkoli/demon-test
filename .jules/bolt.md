## 2025-05-22 - Parallelizing Dashboard Statistics
**Learning:** The dashboard `getStats` controller was performing 13+ sequential database `countDocuments` calls. In a typical MongoDB environment, this leads to significant cumulative latency due to sequential network round-trips. By using `Promise.all`, these queries are executed concurrently, reducing total latency to the time of the slowest single query.
**Action:** Always look for sequential independent database queries in controllers and parallelize them using `Promise.all` or MongoDB `$facet` aggregations.
