## 2025-05-13 - Optimizing Dashboard Statistics with Aggregation Facets

**Learning:** Sequential `countDocuments` calls in a dashboard controller create a massive performance bottleneck due to multiple database round-trips. Consolidating these into parallelized MongoDB aggregation pipelines using `$facet` can reduce latency by over 70% while also fixing shadowing bugs where filters intended for one count leaked into others.

**Action:** Always prefer `$facet` or `$group` within a `Promise.all` block for complex dashboard statistics endpoints. Ensure each facet has a clear, isolated match stage to maintain role-based data visibility.
