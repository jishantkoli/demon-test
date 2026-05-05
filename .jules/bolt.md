## 2025-05-15 - Optimization of Dashboard Stats

**Learning:** Combining multiple `countDocuments` calls into a single aggregation pipeline using `$facet` significantly reduces database roundtrips and improves performance, especially when fetching diverse statistics (total counts vs grouped counts). Using `Promise.all` for parallel execution of aggregation pipelines further optimizes the response time.

**Action:** Prefer MongoDB aggregation with `$facet` and `$group` over multiple individual `countDocuments` calls for dashboard-style statistics. Always execute independent database queries in parallel using `Promise.all`.
