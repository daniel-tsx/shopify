import type { Job, JobKind, Order, Product, ShopRecord, WebhookInput } from "../domain";

export type Delivery = { id: string; shopDomain: string; topic: string; resourceId: string | null; status: "PENDING" | "PROCESSED" | "FAILED"; receivedAt: Date; processedAt: Date | null; error: string | null };
export type Dashboard = { shop: ShopRecord | null; productCount: number; orderCount: number; jobs: Job[]; deliveries: Delivery[]; syncEnabled: boolean };
export interface OperationsStore {
  install(shop: string, scopes: string): Promise<void>;
  shop(shop: string): Promise<ShopRecord | null>;
  setScopes(shop: string, scopes: string): Promise<void>;
  uninstall(shop: string): Promise<void>;
  redact(shop: string): Promise<void>;
  setSyncEnabled(shop: string, enabled: boolean): Promise<void>;
  syncEnabled(shop: string): Promise<boolean>;
  upsertProducts(shop: string, products: Product[]): Promise<void>;
  upsertOrders(shop: string, orders: Order[]): Promise<void>;
  deleteProduct(shop: string, id: string): Promise<void>;
  products(shop: string, take?: number): Promise<Product[]>;
  orders(shop: string, take?: number): Promise<Order[]>;
  product(shop: string, id: string): Promise<Product | null>;
  enqueue(shop: string, kind: JobKind, resourceId?: string | null): Promise<Job>;
  recordWebhook(input: WebhookInput): Promise<boolean>;
  claimJob(now: Date): Promise<Job | null>;
  updateJob(id: string, patch: Partial<Pick<Job, "status" | "attempts" | "nextRunAt" | "shopifyBulkOperationId" | "startedAt" | "completedAt" | "failedAt" | "error">>): Promise<void>;
  finishWebhook(id: string, error?: string): Promise<void>;
  markSync(shop: string): Promise<void>;
  audit(shop: string, action: string, resourceId?: string, detail?: Record<string, unknown>): Promise<void>;
  dashboard(shop: string): Promise<Dashboard>;
}
