## 2025-05-15 - Parallelizing Dashboard Statistics
**Learning:** Sequential database queries (e.g., multiple `countDocuments` for dashboard tiles) are a major source of latency. In this codebase, `getStats` performed up to 17 sequential roundtrips.
**Action:** Always use `Promise.all` to parallelize independent database queries. For complex conditional counts, use ternary operators within the `Promise.all` array with `Promise.resolve(0)` as a fallback to maintain consistent destructuring.
