import { AppError, type Job, type Order, type Product, type ShopifyAdminClient } from "../domain";
import type { OperationsStore } from "../store/types";

export async function requestInitialSync(store: OperationsStore, shop: string) {
  const account = await store.shop(shop);
  if (account?.installationStatus !== "INSTALLED") throw new AppError("Shop is not installed", "SHOP_NOT_INSTALLED");
  await store.setSyncEnabled(shop, true);
  const products = await store.enqueue(shop, "BULK_PRODUCTS");
  const orders = await store.enqueue(shop, "BULK_ORDERS");
  return [products, orders];
}

function parseLine(line: string): unknown {
  try { return JSON.parse(line) as unknown; }
  catch { throw new AppError("Invalid Shopify bulk JSONL line", "BULK_PARSE"); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function productFromLine(value: unknown): Product {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.status !== "string" || typeof value.updatedAt !== "string" || !Array.isArray(value.tags)) throw new AppError("Malformed product bulk line", "BULK_PARSE");
  return { id: value.id, title: value.title, status: value.status, vendor: typeof value.vendor === "string" ? value.vendor : null, tags: value.tags.filter((tag): tag is string => typeof tag === "string"), updatedAt: value.updatedAt };
}
function orderFromLine(value: unknown): Order {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.processedAt !== "string" || typeof value.updatedAt !== "string" || !isRecord(value.currentTotalPriceSet) || !isRecord(value.currentTotalPriceSet.shopMoney)) throw new AppError("Malformed order bulk line", "BULK_PARSE");
  const money = value.currentTotalPriceSet.shopMoney;
  if (typeof money.amount !== "string" || typeof money.currencyCode !== "string") throw new AppError("Malformed order money", "BULK_PARSE");
  return { id: value.id, name: value.name, processedAt: value.processedAt, updatedAt: value.updatedAt, displayFinancialStatus: String(value.displayFinancialStatus ?? "UNKNOWN"), displayFulfillmentStatus: String(value.displayFulfillmentStatus ?? "UNFULFILLED"), totalAmount: money.amount, currencyCode: money.currencyCode };
}

export async function advanceBulkJob(store: OperationsStore, client: ShopifyAdminClient, job: Job, now = new Date()): Promise<"waiting" | "completed"> {
  const kind = job.kind === "BULK_PRODUCTS" ? "products" : "orders";
  if (!job.shopifyBulkOperationId) {
    const id = await client.startBulk(kind);
    await store.updateJob(job.id, { shopifyBulkOperationId: id, status: "WAITING", nextRunAt: new Date(now.getTime() + 5000) });
    return "waiting";
  }
  const operation = await client.getBulk(job.shopifyBulkOperationId);
  if (operation.status === "CREATED" || operation.status === "RUNNING") {
    await store.updateJob(job.id, { status: "WAITING", nextRunAt: new Date(now.getTime() + 5000) });
    return "waiting";
  }
  if (operation.status !== "COMPLETED" || !operation.url) throw new AppError(`Bulk operation ${operation.status}: ${operation.errorCode ?? "unknown"}`, "BULK_FAILED");
  const products: Product[] = [];
  const orders: Order[] = [];
  for await (const line of client.bulkLines(operation.url)) {
    const value = parseLine(line);
    if (kind === "products") products.push(productFromLine(value)); else orders.push(orderFromLine(value));
    if (products.length === 100) { await store.upsertProducts(job.shopDomain, products.splice(0)); }
    if (orders.length === 100) { await store.upsertOrders(job.shopDomain, orders.splice(0)); }
  }
  if (products.length) await store.upsertProducts(job.shopDomain, products);
  if (orders.length) await store.upsertOrders(job.shopDomain, orders);
  await store.markSync(job.shopDomain);
  return "completed";
}

export async function refreshProductsByCursor(store: OperationsStore, client: ShopifyAdminClient, shop: string, pageSize = 50) {
  let cursor: string | undefined;
  let count = 0;
  do {
    const page = await client.listProducts(pageSize, cursor);
    await store.upsertProducts(shop, page.items);
    count += page.items.length;
    if (!page.hasNextPage) break;
    if (!page.endCursor || page.endCursor === cursor) throw new AppError("Non-advancing Shopify product cursor", "PAGINATION_CURSOR");
    cursor = page.endCursor;
  } while (true);
  return count;
}
