## 2026-05-22 - Optimized Dashboard Stats with MongoDB $facet and Promise.all
**Learning:** Sequential `countDocuments` calls in a dashboard stats controller create a linear latency bottleneck. Using MongoDB's `$facet` allows consolidating multiple counts into a single collection scan, and `Promise.all` parallelizes these across different collections.
**Action:** Always favor `$facet` or `Promise.all` for dashboard/summary endpoints that aggregate multiple metrics.
