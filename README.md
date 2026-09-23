# Shopify Merchant Operations

An architecture study of an embedded Shopify Admin app. It mirrors a deliberately small set of products and orders, performs a bulk initial sync, reconciles later changes from webhooks, and writes a merchandising tag back to Shopify. It is **not** a deployed or installable app in this repository: no Partner app, store, credentials, or deployment are provided.

The structure follows [Shopify's official React Router template](https://github.com/Shopify/shopify-app-template-react-router): React Router routes, `shopifyApp`, App Bridge, Polaris web components, and Prisma session storage. The domain services and transport boundary extend that template for operations work.

## Quick start without Shopify

Node 22.12+ and pnpm 10 are expected. After installing dependencies:

```sh
pnpm install
pnpm test
pnpm demo:seed
pnpm demo:sync
pnpm demo:webhook product-update
pnpm demo:webhook duplicate
pnpm demo:throttle
```

The demo commands run **in memory, one process each**. They invoke the same sync, webhook, job, and GraphQL client services as live mode. They do not create a fake authenticated web session or persist data across invocations.

Optional local PostgreSQL for schema inspection:

```sh
docker compose up -d postgres
# Copy .env.example to .env, then set DATABASE_URL locally.
pnpm db:generate
pnpm db:migrate
pnpm db:validate
```

The embedded UI and HTTP webhook endpoint are live-only. `pnpm dev` requires a real Shopify CLI app configuration, credentials, and installation, which are intentionally outside this exercise. Do not use it for mock mode.

## Recommended reading order

| Step | Read | Follow |
| --- | --- | --- |
| 1 | [Architecture](docs/architecture.md) | The boundaries and six sequence diagrams |
| 2 | [Data ownership](docs/shopify-vs-local-data.md) | Why the mirror omits customer PII |
| 3 | [Prisma schema](prisma/schema.prisma) | Installation, session, job, delivery, and mirror constraints |
| 4 | [Shopify authentication](docs/shopify-auth.md) | Merchant identity, online/offline access, scopes |
| 5 | [Framework configuration](app/shopify.server.ts) | Official auth, session adapter, expiring offline token flag |
| 6 | [GraphQL operations](app/shopify/queries.ts) | Cursor queries, tag mutation, bulk query |
| 7 | [GraphQL client](app/shopify/graphql.ts) | Error classes, query cost, retry, JSONL streaming |
| 8 | [Live and mock adapters](app/shopify/live.server.ts) and [mock](app/shopify/mock.ts) | Same client contract; different transport |
| 9 | [Initial sync](app/services/sync.ts) | Job creation, bulk lifecycle, chunked mirror writes |
| 10 | [Job runner](app/jobs/runner.ts) | Retry and completion boundaries |
| 11 | [Webhook receiver](app/routes/webhooks.tsx) and [service](app/services/webhooks.ts) | HMAC via framework, delivery ID, current-state reconciliation |
| 12 | [Prisma store](app/store/prisma.server.ts) | Transactions, uniqueness, persistence |
| 13 | [Merchandising write](app/services/merchandising.ts) | Validation, mutation, mirror, audit |
| 14 | [Behavior tests](tests/flows.test.ts) and [demo script](scripts/demo.ts) | Trace full flows without Shopify |

## Verification

With dependencies available: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:validate`, `pnpm build`. No live integration test can run without a real Shopify installation. The installed `@shopify/shopify-app-react-router@3.0.0` declarations include `ApiVersion.July26` and `expiringOfflineAccessTokens`; the repository uses both.

## More detail

- [Architecture and sequence diagrams](docs/architecture.md)
- [Shopify authentication](docs/shopify-auth.md)
- [Bulk and incremental sync](docs/data-sync.md)
- [Webhook safety and privacy](docs/webhooks.md)
- [Shopify versus local data](docs/shopify-vs-local-data.md)
- [Production pattern versus simulation](docs/real-vs-mock.md)

## Known boundaries

This study does not implement merchant onboarding, paid plans, production deployment, historical order access approval, real webhook registration, or a hosted queue. Full sync performs upserts; a production reconciliation pass would also remove remote records missing from a complete snapshot. The database-backed worker is deliberately simple and should gain leases and heartbeat recovery before production use. See [data sync](docs/data-sync.md).
