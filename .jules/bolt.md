## 2025-05-15 - Dashboard Stats Sequential Query Anti-pattern
**Learning:** Sequential `countDocuments` calls (15+ in this case) create significant network and database overhead, especially when multiplied by many concurrent users. Using `Promise.all` for parallel execution and MongoDB `$group` aggregations to fetch multiple counts in a single round-trip is far more efficient.
**Action:** Always look for patterns where multiple `count` or `find` calls can be consolidated into a single aggregation pipeline or parallelized with `Promise.all`.
