## 2025-05-22 - Optimizing Dashboard Statistics with MongoDB $facet
**Learning:** Sequential `countDocuments` calls for dashboard statistics create unnecessary database roundtrips. Using `Promise.all` for parallel execution and MongoDB's `$facet` operator allows fetching multiple status-based counts in a single query per collection.
**Action:** Always prefer `$facet` or `$group` for dashboard status counters to minimize network overhead and database load.
