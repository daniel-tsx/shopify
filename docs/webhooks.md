# Webhooks and privacy

Status: implemented processing architecture; subscriptions are reference configuration only.

`shopify.app.toml.example` declares app-specific subscriptions for product create/update/delete, order create/updated, app uninstall, scope update, and the required privacy topics. Shopify recommends app-specific TOML subscriptions when all shops use the same topics. The HTTP route calls the official `authenticate.webhook(request)` before reading the verified shop, topic, payload, and webhook ID. Invalid HMAC is rejected by the framework. Mock mode has no webhook HTTP route; its demo calls the same receiving service with simulated verified metadata.

In one database transaction, `recordWebhook` inserts a globally unique `WebhookDelivery.id` and a job. A repeated delivery ID hits the uniqueness constraint and is acknowledged without a second job. The route acknowledges only after the transaction commits. The worker refetches current Shopify state rather than applying stale payload fields. Shopify does not guarantee webhook order, and delivery can be missed; see [Shopify's webhook guidance](https://shopify.dev/docs/apps/build/webhooks).

`app/uninstalled` marks the installation inactive, deletes Shopify sessions, and fails queued/waiting jobs. Existing product and order mirrors remain temporarily under the documented retention policy. A later `shop/redact` deletes the Shop row and cascading mirrors, jobs, deliveries, settings, and audit logs. These are distinct events: uninstall disables access immediately; redaction fulfills deletion obligations later. The application must not attempt an API call after uninstall.

No customer email, phone, address, or customer ID is copied into `OrderMirror`. `customers/data_request` and `customers/redact` record only a no-PII audit action in this example. A production app that added customer data later would need to locate, export, or erase it within the applicable deadline, including backups and downstream processors. `shop/redact` removes all application-owned shop data. See [Shopify's privacy compliance requirements](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).

The delivery table intentionally stores only metadata and resource IDs for operational topics, never full webhook payloads. Payloads for privacy topics are not persisted. Structured logs include shop, topic, webhook ID, and job ID, but never tokens or payload bodies.
