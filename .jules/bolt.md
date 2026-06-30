## 2025-05-14 - Optimized getSubmissions with Indexing and Normalization
**Learning:** Using case-insensitive regex lookups within an $in operator (e.g., for teacher emails in functionary views) is extremely inefficient as it prevents optimal index usage and incurs high CPU overhead for pattern matching on every record.
**Action:** Normalize email fields to lowercase using Mongoose pre-save hooks and update query logic to use exact-match strings. Combine with .lean() and targeted .select() to reduce memory overhead and bypass Mongoose document hydration.
