# Real versus mock

Status: current repository design.

| Area | Live production pattern | Mock simulation |
| --- | --- | --- |
| Merchant authentication | Official Shopify React Router framework and App Bridge | No fake login or embedded HTTP session |
| Session persistence | Official Prisma session adapter with offline refresh fields | No mock token is created |
| GraphQL queries and mutation | Named 2026-07 Admin GraphQL operations via authenticated context | Same typed client through in-memory GraphQL transport |
| Product/order data | Shopify is source of truth; slim Prisma mirrors | Fictional Northline Goods fixture records |
| Pagination | Shopify cursor and `pageInfo` | Cursor slicing over fixtures |
| Bulk operations | Start, poll by ID, stream JSONL, batch upsert | Delayed status transition and JSONL response from mock transport |
| Webhook verification | Framework HMAC verification before service call | CLI passes simulated verified metadata directly |
| Webhook deduplication | Unique PostgreSQL delivery ID plus transaction | In-memory uniqueness for behavior tests |
| Retry/throttling | GraphQL cost metadata and explicit retry policy | One-shot throttle and temporary failure toggles |
| Privacy | No customer PII in mirrors; redaction deletes shop data | Simulated privacy delivery and in-memory deletion |
| Background work | PostgreSQL SyncJob and separate worker process | Same runner using in-memory store |

The production boundary is not weakened to let mock mode start an embedded app. All route authentication and HTTP webhook delivery remain live-only. Mock mode is for service-level tracing and tests. See [architecture](architecture.md) for the flow diagrams.
