## 2024-05-26 - [Optimized Dashboard Statistics with Aggregation Facets]
**Learning:** Sequential 'countDocuments' calls in dashboard controllers create a bottleneck due to multiple database roundtrips. Consolidating these into a single aggregation pipeline using MongoDB '$facet' reduces latency significantly.
**Action:** Always prefer '$facet' and 'Promise.all' when fetching multiple independent statistics or counts to minimize database roundtrips and parallelize operations.
