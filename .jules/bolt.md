## 2025-05-15 - [Aggregation Refactor Trap: Pre-filters vs. Counts]
**Learning:** When refactoring multiple `countDocuments` calls into a single `$facet` aggregation, moving existing query filters (like `status: 'active'`) to the top-level `$match` can accidentally exclude documents needed for other facets (like `draft` or `expired` counts).
**Action:** Extract specific status filters from the base query and apply them inside the relevant `$facet` stages instead of the global `$match`.

## 2025-05-15 - [Inconsistent User Profile Field Access]
**Learning:** The `req.user` object can have flattened fields (like `school_code`) or nested profile fields (like `profile.schoolCode`) depending on the middleware or population state.
**Action:** Use defensive accessors like `req.user.profile?.schoolCode || req.user.school_code` to ensure stats are filtered correctly for the current user's context.
