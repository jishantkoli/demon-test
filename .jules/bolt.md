## 2025-05-14 - Dashboard Sequential Query Bottleneck
**Learning:** The dashboard `getStats` controller was performing over 15 sequential `countDocuments` calls, leading to high latency (~45ms in-memory, likely much higher in production with network overhead). Consolidating these into 4 parallelized `$facet` aggregation pipelines reduced latency by 70-88%.
**Action:** Use MongoDB `$facet` for dashboard statistics to minimize database round-trips. Always verify that aggregation results correctly map to default values for zero-count fields.
