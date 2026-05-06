## 2025-05-15 - Initial Bolt entry
**Learning:** The `getStats` controller in the backend is doing multiple individual `countDocuments` calls, which can be optimized using MongoDB's `$facet` or `Promise.all` with more efficient queries. Specifically, the role-based stats for 'admin' and 'functionary' are very chatty.
**Action:** Use `$facet` or `Promise.all` to parallelize or combine database queries in `getStats` to reduce database round-trips.
