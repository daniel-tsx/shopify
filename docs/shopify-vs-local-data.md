# Shopify data versus application data

Status: current schema policy.

Shopify remains the source of truth for products and orders. `ProductMirror` holds ID, title, status, vendor, tags, and update time because the UI needs merchandising context. `OrderMirror` holds ID, order name, financial and fulfillment statuses, total, currency, and timestamps for operations monitoring. It intentionally omits customers, email, phone, shipping and billing addresses, line items, and payment details. Mirrored fields can be stale until a webhook or reconciliation pass succeeds.

The app owns `Shop` installation state, `AppSetting` sync preference, `SyncJob` execution state, `WebhookDelivery` deduplication state, and `AuditLog` of app-initiated actions. The Shopify `Session` table stores framework-managed credentials and is access controlled as sensitive data. Tokens are never returned in loaders, logged, or placed in the mock fixtures.

The featured tag is an example of a Shopify-owned write. A successful `tagsAdd` response updates the local product mirror and creates an audit record. Shopify `userErrors` leave the mirror and audit untouched. If the database write fails after Shopify succeeds, reconciliation is required; a production workflow could add an outbox or follow-up repair job.

Uninstall retains operational mirrors until Shopify's later `shop/redact`; redaction cascades deletion. A real business must document a retention schedule, legal exceptions, backup deletion, and data processor handling. This repository is an educational implementation, not legal advice.
