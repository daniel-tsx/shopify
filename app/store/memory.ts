import type { Job, JobKind, Order, Product, ShopRecord, WebhookInput } from "../domain";
import type { Dashboard, Delivery, OperationsStore } from "./types";

export class MemoryOperationsStore implements OperationsStore {
  shops = new Map<string, ShopRecord>();
  productRows = new Map<string, Product>();
  orderRows = new Map<string, Order>();
  jobs = new Map<string, Job>();
  deliveries = new Map<string, Delivery>();
  audits: { shop: string; action: string; resourceId?: string }[] = [];
  settings = new Map<string, boolean>();
  private key(shop: string, id: string) { return `${shop}:${id}`; }
  async install(domain: string, scopes: string) { this.shops.set(domain, { domain, installationStatus: "INSTALLED", grantedScopes: scopes, installedAt: new Date(), uninstalledAt: null, lastSuccessfulSyncAt: null }); }
  async shop(shop: string) { return this.shops.get(shop) ?? null; }
  async setScopes(shop: string, scopes: string) { const row = this.shops.get(shop); if (row) row.grantedScopes = scopes; }
  async uninstall(shop: string) { const row = this.shops.get(shop); if (row) { row.installationStatus = "UNINSTALLED"; row.uninstalledAt = new Date(); } for (const job of this.jobs.values()) if (job.shopDomain === shop && ["QUEUED", "WAITING"].includes(job.status) && !["WEBHOOK_CUSTOMER_DATA_REQUEST", "WEBHOOK_CUSTOMER_REDACT", "WEBHOOK_SHOP_REDACT"].includes(job.kind)) { job.status = "FAILED"; job.error = "App uninstalled"; } }
  async redact(shop: string) { this.shops.delete(shop); this.settings.delete(shop); for (const key of this.productRows.keys()) if (key.startsWith(`${shop}:`)) this.productRows.delete(key); for (const key of this.orderRows.keys()) if (key.startsWith(`${shop}:`)) this.orderRows.delete(key); for (const [id, job] of this.jobs) if (job.shopDomain === shop) this.jobs.delete(id); for (const [id, delivery] of this.deliveries) if (delivery.shopDomain === shop) this.deliveries.delete(id); this.audits = this.audits.filter((item) => item.shop !== shop); }
  async setSyncEnabled(shop: string, enabled: boolean) { this.settings.set(shop, enabled); }
  async syncEnabled(shop: string) { return this.settings.get(shop) ?? false; }
  async upsertProducts(shop: string, products: Product[]) { for (const product of products) { const key = this.key(shop, product.id); const previous = this.productRows.get(key); if (!previous || previous.updatedAt <= product.updatedAt) this.productRows.set(key, structuredClone(product)); } }
  async upsertOrders(shop: string, orders: Order[]) { for (const order of orders) { const key = this.key(shop, order.id); const previous = this.orderRows.get(key); if (!previous || previous.updatedAt <= order.updatedAt) this.orderRows.set(key, structuredClone(order)); } }
  async deleteProduct(shop: string, id: string) { this.productRows.delete(this.key(shop, id)); }
  async products(shop: string, take = 100) { return [...this.productRows].filter(([key]) => key.startsWith(`${shop}:`)).map(([, value]) => value).sort((a, b) => a.title.localeCompare(b.title)).slice(0, take); }
  async orders(shop: string, take = 100) { return [...this.orderRows].filter(([key]) => key.startsWith(`${shop}:`)).map(([, value]) => value).sort((a, b) => b.processedAt.localeCompare(a.processedAt)).slice(0, take); }
  async product(shop: string, id: string) { return this.productRows.get(this.key(shop, id)) ?? null; }
  async enqueue(shop: string, kind: JobKind, resourceId: string | null = null): Promise<Job> {
    const job: Job = { id: crypto.randomUUID(), shopDomain: shop, kind, status: "QUEUED", attempts: 0, nextRunAt: new Date(), resourceId, webhookId: null, shopifyBulkOperationId: null, createdAt: new Date(), startedAt: null, completedAt: null, failedAt: null, error: null };
    this.jobs.set(job.id, job); return job;
  }
  async recordWebhook(input: WebhookInput) {
    if (this.deliveries.has(input.id)) return false;
    if (!this.shops.has(input.shopDomain)) await this.install(input.shopDomain, "");
    this.deliveries.set(input.id, { id: input.id, shopDomain: input.shopDomain, topic: input.topic, resourceId: input.resourceId, status: "PENDING", receivedAt: new Date(), processedAt: null, error: null });
    const job = await this.enqueue(input.shopDomain, input.kind, input.resourceId); job.webhookId = input.id;
    return true;
  }
  async claimJob(now: Date) {
    const job = [...this.jobs.values()].filter((item) => ["QUEUED", "WAITING"].includes(item.status) && item.nextRunAt <= now).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!job) return null;
    if (job.status === "QUEUED") job.attempts++;
    job.status = "RUNNING"; job.startedAt ??= now; return { ...job };
  }
  async updateJob(id: string, patch: Partial<Pick<Job, "status" | "attempts" | "nextRunAt" | "shopifyBulkOperationId" | "startedAt" | "completedAt" | "failedAt" | "error">>) { Object.assign(this.jobs.get(id)!, patch); }
  async finishWebhook(id: string, error?: string) { const row = this.deliveries.get(id); if (row) { row.status = error ? "FAILED" : "PROCESSED"; row.processedAt = error ? null : new Date(); row.error = error ?? null; } }
  async markSync(shop: string) { const row = this.shops.get(shop); if (row) row.lastSuccessfulSyncAt = new Date(); }
  async audit(shop: string, action: string, resourceId?: string) { this.audits.push({ shop, action, resourceId }); }
  async dashboard(shop: string): Promise<Dashboard> { return { shop: await this.shop(shop), productCount: (await this.products(shop)).length, orderCount: (await this.orders(shop)).length, jobs: [...this.jobs.values()].filter((item) => item.shopDomain === shop), deliveries: [...this.deliveries.values()].filter((item) => item.shopDomain === shop), syncEnabled: await this.syncEnabled(shop) }; }
}
