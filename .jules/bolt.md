## 2025-05-14 - Parallelizing Dashboard Statistics Aggregation
**Learning:** Sequential `countDocuments` calls (13+ in this case) create significant overhead due to multiple database roundtrips. Using `Promise.all` combined with MongoDB aggregation `$group` or `$facet` allows fetching all status-based counts in a single pass over the collection, drastically reducing latency.
**Action:** Always prefer parallelized aggregations for dashboard-style statistics. Ensure that all possible status/role keys are initialized with 0 in the response object to handle cases where certain categories have no data.

## 2025-05-14 - Database Indexing for Status and Role Enums
**Learning:** Fields used for filtering and counting in dashboards (like `status` in Submissions or `role` in Users) often lack indexes in early-stage codebases, leading to full collection scans as data grows.
**Action:** Proactively add indexes to enum fields and foreign keys (`form_id`, `user_id`) that are frequently used in `countDocuments` or `$match` aggregation stages.
