## 2025-05-15 - Consolidating Dashboard Statistics with MongoDB $facet

**Learning:** Sequential `countDocuments` calls in dashboard controllers create significant latency due to multiple database roundtrips (15+ calls in this case). MongoDB's `$facet` operator allows executing multiple aggregation pipelines within a single stage on the same set of input documents, which is much more efficient for multi-count statistics.

**Action:** Always prefer parallelized aggregation pipelines (using `$facet` and `Promise.all`) over multiple sequential `countDocuments` or `findOne` calls when gathering dashboard metrics.
