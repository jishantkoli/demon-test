## 2025-05-15 - Regex-based lookups in MongoDB
**Learning:** Using an array of case-insensitive regular expressions with `$in` in MongoDB is a major performance anti-pattern. Even with indexes on the field, the CPU cost of executing regexes for each candidate document scales poorly.
**Action:** Always prefer direct ID lookups or exact string matches. If a case-insensitive search is required, normalize the data (e.g., store a lowercased version of the email) and use an index on the normalized field. Better yet, refactor the schema to use ObjectIDs for relations wherever possible.
