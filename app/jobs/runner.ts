import { AppError, type ShopifyAdminClient } from "../domain";
import { log } from "../observability";
import { advanceBulkJob } from "../services/sync";
import { processWebhook } from "../services/webhooks";
import type { OperationsStore } from "../store/types";

export type ClientForShop = (shop: string) => Promise<ShopifyAdminClient>;
const MAX_ATTEMPTS = 5;
export async function runNextJob(store: OperationsStore, clientForShop: ClientForShop, now = new Date()): Promise<boolean> {
  const job = await store.claimJob(now);
  if (!job) return false;
  log("info", "job.started", { shop: job.shopDomain, syncJobId: job.id, bulkOperationId: job.shopifyBulkOperationId, attempts: job.attempts });
  try {
    const account = await store.shop(job.shopDomain);
    const requiresApi = ["BULK_PRODUCTS", "BULK_ORDERS", "WEBHOOK_PRODUCT", "WEBHOOK_PRODUCT_DELETE", "WEBHOOK_ORDER"].includes(job.kind);
    if (requiresApi && account?.installationStatus !== "INSTALLED") throw new AppError("Installation inactive", "SHOP_NOT_INSTALLED");
    const client = requiresApi ? await clientForShop(job.shopDomain) : undefined;
    let result: "waiting" | "completed" | "redacted" | "processed" = "completed";
    if (job.kind === "BULK_PRODUCTS" || job.kind === "BULK_ORDERS") result = await advanceBulkJob(store, client!, job, now);
    else result = await processWebhook(store, job, client);
    if (result === "waiting" || result === "redacted") return true;
    await store.updateJob(job.id, { status: "COMPLETED", completedAt: now, error: null });
    if (job.webhookId) await store.finishWebhook(job.webhookId);
    log("info", "job.completed", { shop: job.shopDomain, syncJobId: job.id });
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError(error instanceof Error ? error.message : "Unknown job failure", "JOB_FAILURE", error instanceof TypeError);
    const retry = appError.retryable && job.attempts < MAX_ATTEMPTS;
    const nextRunAt = new Date(now.getTime() + Math.min(60_000, 1000 * 2 ** (job.attempts - 1)));
    await store.updateJob(job.id, { status: retry ? "QUEUED" : "FAILED", nextRunAt, failedAt: retry ? null : now, error: appError.message });
    if (!retry && job.webhookId) await store.finishWebhook(job.webhookId, appError.message);
    log(retry ? "warn" : "error", "job.failed", { shop: job.shopDomain, syncJobId: job.id, code: appError.code, retry });
  }
  return true;
}
