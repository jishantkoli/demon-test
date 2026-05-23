## 2025-05-23 - Sequential Count Consolidation with $facet
**Learning:** Sequential `countDocuments` calls in dashboard controllers are a performance anti-pattern. Consolidating them into a single aggregation pipeline using MongoDB's `$facet` operator, combined with `Promise.all` for parallel execution of disparate collection queries, can reduce latency by over 70%.
**Action:** When optimizing dashboard or reporting endpoints, always look for opportunities to use `$facet` to batch multiple counts/aggregations into a single database round-trip.

## 2025-05-23 - Preserve Visibility Rules during Refactor
**Learning:** Refactoring simple query logic into aggregation pipelines can inadvertently bypass existing visibility filters (e.g., status-based filtering for specific roles).
**Action:** Always cross-reference the original `find` or `countDocuments` query objects with the new `$match` stages in aggregation pipelines to ensure no business logic or security rules are lost.
