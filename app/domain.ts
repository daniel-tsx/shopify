export type Product = {
  id: string; title: string; status: string; vendor: string | null;
  tags: string[]; updatedAt: string;
};
export type Order = {
  id: string; name: string; displayFinancialStatus: string;
  displayFulfillmentStatus: string; totalAmount: string;
  currencyCode: string; processedAt: string; updatedAt: string;
};
export type Page<T> = { items: T[]; endCursor: string | null; hasNextPage: boolean };
export type BulkKind = "products" | "orders";
export type BulkState = { id: string; status: "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED"; url: string | null; errorCode?: string | null };
export type JobKind = "BULK_PRODUCTS" | "BULK_ORDERS" | "WEBHOOK_PRODUCT" | "WEBHOOK_ORDER" | "WEBHOOK_PRODUCT_DELETE" | "WEBHOOK_UNINSTALL" | "WEBHOOK_SCOPES" | "WEBHOOK_CUSTOMER_DATA_REQUEST" | "WEBHOOK_CUSTOMER_REDACT" | "WEBHOOK_SHOP_REDACT";
export type JobStatus = "QUEUED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED";
export type Job = { id: string; shopDomain: string; kind: JobKind; status: JobStatus; attempts: number; nextRunAt: Date; resourceId: string | null; webhookId: string | null; shopifyBulkOperationId: string | null; createdAt: Date; startedAt: Date | null; completedAt: Date | null; failedAt: Date | null; error: string | null };
export type ShopRecord = { domain: string; installationStatus: "INSTALLED" | "UNINSTALLED"; grantedScopes: string; installedAt: Date; uninstalledAt: Date | null; lastSuccessfulSyncAt: Date | null };
export type WebhookInput = { id: string; shopDomain: string; topic: string; resourceId: string | null; kind: JobKind };

export class AppError extends Error {
  constructor(message: string, readonly code: string, readonly retryable = false) { super(message); this.name = "AppError"; }
}
export class ShopifyUserError extends AppError {
  constructor(readonly errors: { field?: string[] | null; message: string }[]) {
    super(errors.map((error) => error.message).join("; "), "SHOPIFY_USER_ERROR");
  }
}

export interface ShopifyAdminClient {
  listProducts(first: number, after?: string): Promise<Page<Product>>;
  getProduct(id: string): Promise<Product | null>;
  listOrders(first: number, after?: string): Promise<Page<Order>>;
  getOrder(id: string): Promise<Order | null>;
  addMerchandisingTag(id: string, tag: string): Promise<Product>;
  startBulk(kind: BulkKind): Promise<string>;
  getBulk(id: string): Promise<BulkState>;
  bulkLines(url: string): AsyncIterable<string>;
}
