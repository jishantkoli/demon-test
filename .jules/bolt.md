## 2025-05-04 - Optimize Dashboard Stats
**Learning:** Sequential `countDocuments` calls in `getStats` controller cause multiple database roundtrips (18 calls), which can be significantly reduced using MongoDB aggregation pipelines with `$facet`.
**Action:** Consolidate these calls into 4 parallel aggregation pipelines using `$facet` and `Promise.all`. This reduces the number of roundtrips from 18 to 4, improving dashboard load times.

### Optimized Aggregation Logic:

1. **User Stats:**
   ```javascript
   User.aggregate([
     {
       $facet: {
         totalUsers: [{ $count: "count" }],
         admin: [{ $match: { role: 'admin' } }, { $count: "count" }],
         reviewer: [{ $match: { role: 'reviewer' } }, { $count: "count" }],
         functionary: [{ $match: { role: 'functionary' } }, { $count: "count" }],
         teacher: [{ $match: { role: 'teacher' } }, { $count: "count" }]
       }
     }
   ])
   ```

2. **Form Stats:**
   ```javascript
   Form.aggregate([
     { $match: formQuery },
     {
       $facet: {
         activeForms: [{ $match: { status: 'active' } }, { $count: "count" }],
         draftForms: [{ $match: { status: 'draft' } }, { $count: "count" }],
         expiredForms: [{ $match: { status: 'expired' } }, { $count: "count" }]
       }
     }
   ])
   ```

3. **Submission Stats:**
   ```javascript
   Submission.aggregate([
     { $match: subQuery },
     {
       $facet: {
         totalSubmissions: [{ $count: "count" }],
         submitted: [{ $match: { status: 'submitted' } }, { $count: "count" }],
         under_review: [{ $match: { status: 'under_review' } }, { $count: "count" }],
         approved: [{ $match: { status: 'approved' } }, { $count: "count" }],
         rejected: [{ $match: { status: 'rejected' } }, { $count: "count" }]
       }
     }
   ])
   ```

4. **Nomination Stats (only for functionary):**
   ```javascript
   Nomination.aggregate([
     { $match: { functionary_id: userId } },
     {
       $facet: {
         totalNominations: [{ $count: "count" }],
         pending: [{ $match: { status: 'pending' } }, { $count: "count" }],
         invited: [{ $match: { status: 'invited' } }, { $count: "count" }],
         completed: [{ $match: { status: 'completed' } }, { $count: "count" }]
       }
     }
   ])
   ```
