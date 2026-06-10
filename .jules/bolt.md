## 2025-05-14 - Parallelizing Dashboard Stats with $facet
**Learning:** Sequential database queries (e.g., multiple countDocuments) in dashboard controllers are a performance anti-pattern. Consolidating them into parallelized MongoDB aggregation pipelines using $facet can reduce database roundtrips significantly.
**Action:** Use Promise.all to run model-specific aggregation pipelines with $facet to fetch multiple counts in a single request.
