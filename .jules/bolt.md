## 2026-05-12 - Optimized Dashboard Stats with MongoDB Facets

**Learning:** Aggregation pipelines using the `$facet` operator are extremely effective at consolidating multiple related count operations into a single database roundtrip. When combined with `Promise.all` for concurrent execution across different collections, it significantly reduces total response time for data-heavy dashboard endpoints.

**Action:** Always look for "query waterfalls" (sequential database calls) in dashboard and analytics controllers. Replace them with consolidated `$facet` aggregations and `Promise.all` to minimize network latency and database overhead.
