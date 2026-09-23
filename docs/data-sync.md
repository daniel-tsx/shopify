# Data synchronization

Status: implemented service flow, live integration unverified without Shopify.

The merchant starts synchronization in Settings. `requestInitialSync` enables incremental sync and creates separate durable product and order jobs. A worker claims each job, starts `bulkOperationRunQuery`, stores the operation ID, then polls `bulkOperation(id)` on later passes. Once complete, it streams Shopify's JSONL output, parses one record at a time, and upserts batches of 100 into Prisma mirrors. Mock bulk operations use the same state transitions and JSONL ingestion path.

Normal `listProducts` and `listOrders` show cursor pagination for targeted reads. `refreshProductsByCursor` demonstrates complete traversal and rejects a cursor that does not advance. Bulk is used for initial large datasets because thousands of normal page requests would be inefficient. Shopify's [bulk operation guide](https://shopify.dev/docs/apps/build/apis/graphql-admin/bulk-operations/queries) and [bulkOperation query](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/bulkOperation) are the source references.

Jobs have `QUEUED`, `RUNNING`, `WAITING`, `COMPLETED`, and `FAILED` states; attempts, timestamps, operation ID, error, and next run time are persisted. Transient errors retry with exponential backoff up to five job attempts. Permanent GraphQL validation and mutation `userErrors` fail rather than loop. The GraphQL client independently retries temporary HTTP/network failures and Shopify throttling with an explicit policy and inspects query cost metadata.

After initial sync, webhooks trigger current-state fetches to upsert changed products and orders. Product deletions query current state before deleting. This tolerates duplicate or reordered deliveries. Webhooks are not a perfect event log: a production system should schedule periodic reconciliation for missed deliveries, paginate changes since the last checkpoint, and compare complete snapshots to remove remote deletions missed during downtime.

Operational limits before production: the worker has no lease/heartbeat to reclaim jobs left `RUNNING` after a crash; bulk JSONL download errors after some chunks can leave partial mirror updates; the next retry safely upserts again, but an all-or-nothing snapshot needs staging and cutover. A full sync upserts existing records but does not prune records absent from Shopify's complete export. These are deliberate, documented next steps, not claims of production readiness.
