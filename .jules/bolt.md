## 2026-05-01 - Optimizing MongoDB Queries with Compound Indexes and Avoiding Low Cardinality

**Learning:** When queries involve both filtering (e.g., `schoolCode`) and sorting (e.g., `createdAt`), a compound index on both fields is significantly more efficient than two separate single-field indexes. Additionally, indexing fields with low cardinality (few unique values, like `status`) often provides negligible performance benefits and can waste storage and write performance.

**Action:** Always analyze common query patterns (filter + sort) to identify compound index opportunities. Avoid indexing flags or status fields unless they are part of a more selective compound index.
