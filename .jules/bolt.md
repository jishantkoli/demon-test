## 2026-05-29 - Dashboard Stats Query Parallelization
**Learning:** Consolidating multiple sequential `countDocuments` calls into parallel MongoDB aggregation `$facet` pipelines significantly reduces database round-trip overhead.
**Action:** Use `Promise.all` and `$facet` for dashboard-like endpoints where multiple counts or aggregates are required from the same or different collections.
