## 2026-06-01 - Consolidating Dashboard Statistics with $facet
**Learning:** In dashboards where multiple counts are required from the same or different collections, sequential `countDocuments` calls create significant overhead due to multiple database round-trips. Consolidating these into a few parallelized MongoDB aggregation pipelines using the `$facet` operator significantly reduces latency.
**Action:** When implementing statistics or summary endpoints, prioritize MongoDB aggregation `$facet` and `Promise.all` to minimize database round-trips and parallelize data retrieval.
