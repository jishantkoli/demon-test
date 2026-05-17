## 2026-05-17 - Dashboard Stats Aggregation
**Learning:** Sequential 'countDocuments' calls (O(N) database round trips) for dashboard stats significantly increase latency. Using MongoDB '$facet' aggregation consolidates multiple counts into a single query pass.
**Action:** Always favor aggregation with '$facet' or parallelizing simple queries with 'Promise.all' for complex dashboard-style summary endpoints.
