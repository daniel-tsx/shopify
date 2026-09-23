# Shopify authentication and installation

Status: representative live integration; untested against a real installation.

The app uses Shopify's `shopifyApp` from `@shopify/shopify-app-react-router`, `authenticate.admin(request)` in the embedded layout and actions, and `PrismaSessionStorage`. It does not implement OAuth, token exchange, session token verification, HMAC, or offline token refresh itself. Shopify's framework owns those mechanisms. `afterAuth` records the installed shop and granted scopes. The Session schema includes `refreshToken` and `refreshTokenExpires` for the framework's modern expiring offline access token behavior.

**Merchant authentication** proves that the embedded request came from a Shopify Admin user for an installed shop. **Session persistence** stores Shopify's tokens and session metadata for later requests. An **online token** is user-bound and short-lived; this app's background worker instead uses an **offline token** associated with the shop. `unauthenticated.admin(shop)` is safe here only because the worker receives shop domains from durable jobs created by authenticated routes or HMAC-verified webhooks, and checks installation status first. It must never accept an arbitrary HTTP shop parameter.

The configured scopes are `read_products`, `write_products`, and `read_orders`. They authorize API access; they do not themselves authenticate a merchant. Shopify may limit ordinary `read_orders` to recent orders; historical order access requires separate approval and is outside this study. Scope changes arrive through `app/scopes_update` and are recorded on `Shop`.

The live configuration targets API version `2026-07` through `ApiVersion.July26`, and sets `future.expiringOfflineAccessTokens`. Both were verified in the installed `@shopify/shopify-app-react-router@3.0.0` declarations. Shopify's [React Router package documentation](https://shopify.dev/docs/api/shopify-app-react-router/latest), [background Admin context guide](https://shopify.dev/docs/api/shopify-app-react-router/latest/unauthenticated), and [offline token migration guide](https://shopify.dev/docs/apps/build/authentication-authorization/migrate-to-expiring-offline-access-tokens) explain the underlying behavior.

Mock mode has no merchant authentication. It exposes only a CLI and service tests, never a fake HTTP login or unsigned webhook endpoint. The embedded UI explicitly requires `SHOPIFY_MODE=live`.
