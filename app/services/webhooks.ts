import { AppError, type Job, type ShopifyAdminClient, type WebhookInput } from "../domain";
import type { OperationsStore } from "../store/types";

const topicKinds: Record<string, WebhookInput["kind"]> = {
  PRODUCTS_CREATE: "WEBHOOK_PRODUCT", PRODUCTS_UPDATE: "WEBHOOK_PRODUCT", PRODUCTS_DELETE: "WEBHOOK_PRODUCT_DELETE",
  ORDERS_CREATE: "WEBHOOK_ORDER", ORDERS_UPDATED: "WEBHOOK_ORDER",
  APP_UNINSTALLED: "WEBHOOK_UNINSTALL", APP_SCOPES_UPDATE: "WEBHOOK_SCOPES",
  CUSTOMERS_DATA_REQUEST: "WEBHOOK_CUSTOMER_DATA_REQUEST", CUSTOMERS_REDACT: "WEBHOOK_CUSTOMER_REDACT", SHOP_REDACT: "WEBHOOK_SHOP_REDACT"
};
export function webhookKind(topic: string) { return topicKinds[topic] ?? null; }

export async function receiveWebhook(store: OperationsStore, input: Omit<WebhookInput, "kind">): Promise<boolean> {
  const kind = webhookKind(input.topic);
  if (!kind) throw new AppError(`Unsupported webhook topic ${input.topic}`, "WEBHOOK_TOPIC");
  return store.recordWebhook({ ...input, kind });
}

export async function processWebhook(store: OperationsStore, job: Job, client?: ShopifyAdminClient): Promise<"processed" | "redacted"> {
  const shop = job.shopDomain;
  if (job.kind === "WEBHOOK_UNINSTALL") { await store.uninstall(shop); return "processed"; }
  if (job.kind === "WEBHOOK_SHOP_REDACT") { await store.redact(shop); return "redacted"; }
  if (job.kind === "WEBHOOK_CUSTOMER_DATA_REQUEST") { await store.audit(shop, "CUSTOMER_DATA_REQUEST_NO_PII"); return "processed"; }
  if (job.kind === "WEBHOOK_CUSTOMER_REDACT") { await store.audit(shop, "CUSTOMER_REDACT_NO_PII"); return "processed"; }
  if (job.kind === "WEBHOOK_SCOPES") { await store.setScopes(shop, job.resourceId ?? ""); return "processed"; }
  const account = await store.shop(shop);
  if (account?.installationStatus !== "INSTALLED") return "processed";
  if (!(await store.syncEnabled(shop))) return "processed";
  if (!client || !job.resourceId) throw new AppError("Webhook missing Shopify client or resource ID", "WEBHOOK_INPUT");
  if (job.kind === "WEBHOOK_PRODUCT" || job.kind === "WEBHOOK_PRODUCT_DELETE") {
    // Query current state. The delivery may be old, duplicated, or arrive out of order.
    const product = await client.getProduct(job.resourceId);
    if (product) await store.upsertProducts(shop, [product]); else await store.deleteProduct(shop, job.resourceId);
  } else if (job.kind === "WEBHOOK_ORDER") {
    const order = await client.getOrder(job.resourceId);
    if (order) await store.upsertOrders(shop, [order]);
  }
  return "processed";
}
