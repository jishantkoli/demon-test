BOLT'S JOURNAL - CRITICAL LEARNINGS ONLY
## 2025-06-19 - [Stats API Optimization]
**Learning:** Sequential database queries (countDocuments) in dashboard controllers are a performance anti-pattern. Consolidating them with Promise.all reduces database round-trips and significantly improves latency (~54% improvement in this case).
**Action:** Always parallelize independent database queries in controllers.

## 2025-06-19 - [MongoMemoryServer Benchmarking]
**Learning:** MongoMemoryServer can time out during binary download or startup in constrained environments. Using a specific stable version (6.0.4) and increasing the spawn timeout helps. Also, seeding large datasets can trigger unique index constraints if fields like 'shareableLink' or 'unique_token' are not manually populated.
**Action:** Use version '6.0.4' and provide unique values for indexed fields during bulk inserts in benchmarks.
