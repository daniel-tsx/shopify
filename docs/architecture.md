# Architecture

Status: current repository design.

The app has one external integration boundary: `ShopifyAdminClient`. Its live adapter uses the official authenticated Admin GraphQL client; its mock adapter returns realistic GraphQL envelopes and JSONL results. Services never choose a mode. Routes authenticate and validate; services enforce business rules; the store owns durable state; the worker performs asynchronous work.

```mermaid
flowchart LR
  Merchant --> Routes[React Router routes]
  Shopify --> Webhook[Verified webhook route]
  Routes --> Services[Application services]
  Webhook --> Store[OperationsStore]
  Services --> Store
  Store --> PG[(PostgreSQL)]
  Worker[Job worker] --> Store
  Worker --> Services
  Services --> Client[ShopifyAdminClient]
  Client --> Live[Official Admin GraphQL context]
  Client --> Mock[Mock GraphQL transport]
```

## 1. Merchant opens installed app

```mermaid
sequenceDiagram
  actor Merchant
  participant Admin as Shopify Admin + App Bridge
  participant Route as React Router /app
  participant Framework as shopifyApp authenticate.admin
  participant DB as Prisma Session storage
  Merchant->>Admin: Open installed app
  Admin->>Route: Embedded request + session token
  Route->>Framework: authenticate.admin(request)
  Framework->>Admin: Verify identity / token exchange if needed
  Framework->>DB: Load or persist session and offline token
  Framework-->>Route: Authenticated admin context + session
  Route-->>Merchant: Embedded UI
```

## 2. Normal Admin GraphQL request

```mermaid
sequenceDiagram
  participant Route as Authenticated route / worker
  participant Service as Application service
  participant Client as GraphqlAdminClient
  participant Shopify as Admin GraphQL API
  Route->>Service: shop + validated intent
  Service->>Client: listProducts / getOrder
  Client->>Shopify: Named GraphQL operation via official admin context
  Shopify-->>Client: data/errors + cost metadata
  Client->>Client: Classify errors; retry throttle/temporary failure
  Client-->>Service: Typed domain result
```

## 3. Initial bulk synchronization

```mermaid
sequenceDiagram
  actor Merchant
  participant Route as Settings action
  participant DB as PostgreSQL
  participant Worker
  participant Shopify as Shopify Bulk Operations
  Merchant->>Route: Start sync
  Route->>DB: Create product + order SyncJobs
  Route-->>Merchant: Jobs queued
  Worker->>DB: Claim job
  Worker->>Shopify: bulkOperationRunQuery
  Shopify-->>Worker: bulkOperationId
  Worker->>DB: WAITING + operation ID
  loop Until terminal status
    Worker->>Shopify: bulkOperation(id)
  end
  Shopify-->>Worker: Completed JSONL URL
  Worker->>Shopify: Stream JSONL result
  Worker->>DB: Upsert mirror rows in chunks
  Worker->>DB: Mark job completed + last sync
```

## 4. Incremental webhook synchronization

```mermaid
sequenceDiagram
  participant Shopify
  participant Route as /webhooks
  participant Framework as authenticate.webhook
  participant DB as PostgreSQL
  participant Worker
  Shopify->>Route: Delivery + webhook ID + HMAC
  Route->>Framework: Verify raw request
  Framework-->>Route: Verified topic, shop, payload, ID
  Route->>DB: Transaction: unique delivery + job
  Route-->>Shopify: 200 after durable enqueue
  Worker->>DB: Claim job
  Worker->>Shopify: Fetch current product/order state
  Shopify-->>Worker: Current resource
  Worker->>DB: Upsert/delete mirror; mark delivery processed
```

## 5. Merchant-triggered mutation

```mermaid
sequenceDiagram
  actor Merchant
  participant Route as Products action
  participant Service as featureProduct
  participant Shopify as Admin GraphQL API
  participant DB as PostgreSQL
  Merchant->>Route: Add featured tag
  Route->>Service: Authenticated shop + product ID
  Service->>DB: Validate installed shop + mirrored product
  Service->>Shopify: tagsAdd mutation
  Shopify-->>Service: Product or userErrors
  Service->>DB: Upsert mirror + audit success
  Service-->>Merchant: Result
```

## 6. Uninstall, then later redaction

```mermaid
sequenceDiagram
  participant Shopify
  participant Route as Verified webhook route
  participant Worker
  participant DB as PostgreSQL
  Shopify->>Route: app/uninstalled
  Route->>DB: Unique delivery + job
  Worker->>DB: Mark uninstalled, delete sessions, stop queued work
  Note over DB: Operational mirror retained temporarily
  Shopify->>Route: shop/redact (possibly later)
  Route->>DB: Unique delivery + job
  Worker->>DB: Delete shop and cascading mirrors, jobs, deliveries, audits
```

## Trace points

Start with `app/routes/app.settings.tsx` for a bulk request, `app/routes/webhooks.tsx` for incremental work, and `app/routes/app.products.tsx` for a Shopify write. The live worker is `scripts/worker.ts`; mock service runs are `scripts/demo.ts`. The schema is the durable state contract.
