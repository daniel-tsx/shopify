import { Prisma, type PrismaClient } from "@prisma/client";
import type { Job, JobKind, Order, Product, ShopRecord, WebhookInput } from "../domain";
import type { Dashboard, OperationsStore } from "./types";

const toProduct = (row: { shopifyId: string; title: string; status: string; vendor: string | null; tags: string[]; shopifyUpdatedAt: Date }): Product => ({ id: row.shopifyId, title: row.title, status: row.status, vendor: row.vendor, tags: row.tags, updatedAt: row.shopifyUpdatedAt.toISOString() });
const toOrder = (row: { shopifyId: string; name: string; displayFinancialStatus: string; displayFulfillmentStatus: string; totalAmount: Prisma.Decimal; currencyCode: string; processedAt: Date; shopifyUpdatedAt: Date }): Order => ({ id: row.shopifyId, name: row.name, displayFinancialStatus: row.displayFinancialStatus, displayFulfillmentStatus: row.displayFulfillmentStatus, totalAmount: row.totalAmount.toFixed(2), currencyCode: row.currencyCode, processedAt: row.processedAt.toISOString(), updatedAt: row.shopifyUpdatedAt.toISOString() });

export class PrismaOperationsStore implements OperationsStore {
  constructor(private db: PrismaClient) {}
  async install(shop: string, scopes: string) {
    await this.db.shop.upsert({ where: { domain: shop }, create: { domain: shop, grantedScopes: scopes }, update: { installationStatus: "INSTALLED", grantedScopes: scopes, uninstalledAt: null, installedAt: new Date() } });
  }
  shop(shop: string): Promise<ShopRecord | null> { return this.db.shop.findUnique({ where: { domain: shop } }); }
  async setScopes(shop: string, scopes: string) { await this.db.shop.update({ where: { domain: shop }, data: { grantedScopes: scopes } }); }
  async uninstall(shop: string) {
    await this.db.$transaction([
      this.db.shop.updateMany({ where: { domain: shop }, data: { installationStatus: "UNINSTALLED", uninstalledAt: new Date() } }),
      this.db.session.deleteMany({ where: { shop } }),
      this.db.syncJob.updateMany({ where: { shopDomain: shop, status: { in: ["QUEUED", "WAITING"] }, kind: { notIn: ["WEBHOOK_CUSTOMER_DATA_REQUEST", "WEBHOOK_CUSTOMER_REDACT", "WEBHOOK_SHOP_REDACT"] } }, data: { status: "FAILED", failedAt: new Date(), error: "App uninstalled" } })
    ]);
  }
  async redact(shop: string) { await this.db.$transaction([this.db.session.deleteMany({ where: { shop } }), this.db.shop.deleteMany({ where: { domain: shop } })]); }
  async setSyncEnabled(shop: string, enabled: boolean) { await this.db.appSetting.upsert({ where: { shopDomain: shop }, create: { shopDomain: shop, syncEnabled: enabled }, update: { syncEnabled: enabled } }); }
  async syncEnabled(shop: string) { return (await this.db.appSetting.findUnique({ where: { shopDomain: shop } }))?.syncEnabled ?? false; }
  async upsertProducts(shop: string, products: Product[]) {
    for (const product of products) {
      const stamp = new Date(product.updatedAt);
      const data = { title: product.title, status: product.status, vendor: product.vendor, tags: product.tags, shopifyUpdatedAt: stamp, mirroredAt: new Date() };
      const updated = await this.db.productMirror.updateMany({ where: { shopDomain: shop, shopifyId: product.id, shopifyUpdatedAt: { lte: stamp } }, data });
      if (updated.count) continue;
      try { await this.db.productMirror.create({ data: { shopDomain: shop, shopifyId: product.id, ...data } }); }
      catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; await this.db.productMirror.updateMany({ where: { shopDomain: shop, shopifyId: product.id, shopifyUpdatedAt: { lte: stamp } }, data }); }
    }
  }
  async upsertOrders(shop: string, orders: Order[]) {
    for (const order of orders) {
      const data = { name: order.name, displayFinancialStatus: order.displayFinancialStatus, displayFulfillmentStatus: order.displayFulfillmentStatus, totalAmount: new Prisma.Decimal(order.totalAmount), currencyCode: order.currencyCode, processedAt: new Date(order.processedAt), shopifyUpdatedAt: new Date(order.updatedAt), mirroredAt: new Date() };
      const updated = await this.db.orderMirror.updateMany({ where: { shopDomain: shop, shopifyId: order.id, shopifyUpdatedAt: { lte: data.shopifyUpdatedAt } }, data });
      if (updated.count) continue;
      try { await this.db.orderMirror.create({ data: { shopDomain: shop, shopifyId: order.id, ...data } }); }
      catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; await this.db.orderMirror.updateMany({ where: { shopDomain: shop, shopifyId: order.id, shopifyUpdatedAt: { lte: data.shopifyUpdatedAt } }, data }); }
    }
  }
  async deleteProduct(shop: string, id: string) { await this.db.productMirror.deleteMany({ where: { shopDomain: shop, shopifyId: id } }); }
  async products(shop: string, take = 100) { return (await this.db.productMirror.findMany({ where: { shopDomain: shop }, orderBy: { title: "asc" }, take })).map(toProduct); }
  async orders(shop: string, take = 100) { return (await this.db.orderMirror.findMany({ where: { shopDomain: shop }, orderBy: { processedAt: "desc" }, take })).map(toOrder); }
  async product(shop: string, id: string) { const row = await this.db.productMirror.findUnique({ where: { shopDomain_shopifyId: { shopDomain: shop, shopifyId: id } } }); return row ? toProduct(row) : null; }
  async enqueue(shop: string, kind: JobKind, resourceId: string | null = null): Promise<Job> { return this.db.syncJob.create({ data: { shopDomain: shop, kind, resourceId } }); }
  async recordWebhook(input: WebhookInput): Promise<boolean> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.shop.upsert({ where: { domain: input.shopDomain }, create: { domain: input.shopDomain, installationStatus: "UNINSTALLED" }, update: {} });
        await tx.webhookDelivery.create({ data: { id: input.id, shopDomain: input.shopDomain, topic: input.topic, resourceId: input.resourceId } });
        await tx.syncJob.create({ data: { shopDomain: input.shopDomain, kind: input.kind, resourceId: input.resourceId, webhookId: input.id } });
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }
  async claimJob(now: Date): Promise<Job | null> {
    const candidates = await this.db.syncJob.findMany({ where: { status: { in: ["QUEUED", "WAITING"] }, nextRunAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: 5 });
    for (const job of candidates) {
      const increment = job.status === "QUEUED";
      const updated = await this.db.syncJob.updateMany({ where: { id: job.id, status: job.status }, data: { status: "RUNNING", ...(increment ? { attempts: { increment: 1 } } : {}), startedAt: job.startedAt ?? now } });
      if (updated.count) return { ...job, status: "RUNNING", attempts: job.attempts + (increment ? 1 : 0) };
    }
    return null;
  }
  async updateJob(id: string, patch: Partial<Pick<Job, "status" | "attempts" | "nextRunAt" | "shopifyBulkOperationId" | "startedAt" | "completedAt" | "failedAt" | "error">>) { await this.db.syncJob.update({ where: { id }, data: patch }); }
  async finishWebhook(id: string, error?: string) { await this.db.webhookDelivery.updateMany({ where: { id }, data: { status: error ? "FAILED" : "PROCESSED", processedAt: error ? null : new Date(), error: error ?? null } }); }
  async markSync(shop: string) { await this.db.shop.updateMany({ where: { domain: shop }, data: { lastSuccessfulSyncAt: new Date() } }); }
  async audit(shop: string, action: string, resourceId?: string, detail?: Record<string, unknown>) { await this.db.auditLog.create({ data: { shopDomain: shop, action, resourceId, detail: detail as Prisma.InputJsonValue | undefined } }); }
  async dashboard(shop: string): Promise<Dashboard> {
    const [account, productCount, orderCount, jobs, deliveries, setting] = await Promise.all([
      this.db.shop.findUnique({ where: { domain: shop } }), this.db.productMirror.count({ where: { shopDomain: shop } }), this.db.orderMirror.count({ where: { shopDomain: shop } }),
      this.db.syncJob.findMany({ where: { shopDomain: shop }, orderBy: { createdAt: "desc" }, take: 10 }),
      this.db.webhookDelivery.findMany({ where: { shopDomain: shop }, orderBy: { receivedAt: "desc" }, take: 10 }),
      this.db.appSetting.findUnique({ where: { shopDomain: shop } })
    ]);
    return { shop: account, productCount, orderCount, jobs, deliveries, syncEnabled: setting?.syncEnabled ?? false };
  }
}
