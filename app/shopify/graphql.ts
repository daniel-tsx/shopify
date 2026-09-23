import { AppError, ShopifyUserError, type BulkKind, type BulkState, type Order, type Page, type Product, type ShopifyAdminClient } from "../domain";
import { log } from "../observability";
import { ADD_TAG, BULK_ORDERS, BULK_PRODUCTS, GET_BULK, ORDER, ORDERS, PRODUCT, PRODUCTS, START_BULK } from "./queries";

export type GraphqlTransport = (query: string, variables: Record<string, unknown>) => Promise<Response>;
type Envelope<T> = { data?: T; errors?: { message: string; extensions?: { code?: string } }[]; extensions?: { cost?: { requestedQueryCost?: number; throttleStatus?: { currentlyAvailable: number; restoreRate: number } } } };
type Connection<T> = { nodes: T[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } };
type OrderNode = Omit<Order, "totalAmount" | "currencyCode"> & { currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } } };
type Mutation<T> = { userErrors: { field?: string[] | null; message: string }[]; node: T | null };

export type RetryPolicy = { attempts: number; baseDelayMs: number; sleep: (ms: number) => Promise<void> };
export const defaultRetryPolicy: RetryPolicy = { attempts: 4, baseDelayMs: 250, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

export class GraphqlAdminClient implements ShopifyAdminClient {
  constructor(private transport: GraphqlTransport, private download: (url: string) => Promise<Response> = fetch, private retry: RetryPolicy = defaultRetryPolicy) {}

  private async request<T>(name: string, query: string, variables: Record<string, unknown>): Promise<T> {
    for (let attempt = 1; attempt <= this.retry.attempts; attempt++) {
      try {
        const response = await this.transport(query, variables);
        if (response.status === 429 || response.status >= 500) throw new AppError(`Shopify HTTP ${response.status} in ${name}`, "SHOPIFY_HTTP", true);
        if (!response.ok) throw new AppError(`Shopify HTTP ${response.status} in ${name}`, "SHOPIFY_HTTP");
        const body = await response.json() as Envelope<T>;
        if (body.errors?.length) {
          const throttled = body.errors.some((error) => error.extensions?.code === "THROTTLED");
          throw new AppError(body.errors.map((error) => error.message).join("; "), throttled ? "SHOPIFY_THROTTLED" : "SHOPIFY_GRAPHQL", throttled);
        }
        if (body.data === undefined) throw new AppError(`Missing GraphQL data in ${name}`, "SHOPIFY_GRAPHQL");
        const throttle = body.extensions?.cost?.throttleStatus;
        if (throttle && throttle.currentlyAvailable < 10 && throttle.restoreRate > 0) {
          await this.retry.sleep(Math.ceil((10 - throttle.currentlyAvailable) / throttle.restoreRate * 1000));
        }
        return body.data;
      } catch (error) {
        const retryable = error instanceof AppError ? error.retryable : error instanceof TypeError;
        const code = error instanceof AppError ? error.code : error instanceof TypeError ? "NETWORK" : "UNKNOWN";
        if (!retryable || attempt === this.retry.attempts) { log("error", "shopify.graphql.failed", { operationName: name, attempt, code }); throw error; }
        log("warn", "shopify.graphql.retry", { operationName: name, attempt, code });
        await this.retry.sleep(this.retry.baseDelayMs * 2 ** (attempt - 1));
      }
    }
    throw new AppError("Retry policy exhausted", "RETRY_EXHAUSTED");
  }

  async listProducts(first: number, after?: string): Promise<Page<Product>> {
    const data = await this.request<{ products: Connection<Product> }>("ListProducts", PRODUCTS, { first, after });
    return { items: data.products.nodes, ...data.products.pageInfo };
  }
  async getProduct(id: string): Promise<Product | null> {
    return (await this.request<{ product: Product | null }>("GetProduct", PRODUCT, { id })).product;
  }
  private order(node: OrderNode): Order {
    const { currentTotalPriceSet, ...rest } = node;
    return { ...rest, totalAmount: currentTotalPriceSet.shopMoney.amount, currencyCode: currentTotalPriceSet.shopMoney.currencyCode };
  }
  async listOrders(first: number, after?: string): Promise<Page<Order>> {
    const data = await this.request<{ orders: Connection<OrderNode> }>("ListOrders", ORDERS, { first, after });
    return { items: data.orders.nodes.map((node) => this.order(node)), ...data.orders.pageInfo };
  }
  async getOrder(id: string): Promise<Order | null> {
    const node = (await this.request<{ order: OrderNode | null }>("GetOrder", ORDER, { id })).order;
    return node ? this.order(node) : null;
  }
  async addMerchandisingTag(id: string, tag: string): Promise<Product> {
    const { tagsAdd } = await this.request<{ tagsAdd: Mutation<Product> }>("AddMerchandisingTag", ADD_TAG, { id, tags: [tag] });
    if (tagsAdd.userErrors.length) throw new ShopifyUserError(tagsAdd.userErrors);
    if (!tagsAdd.node) throw new AppError("Shopify returned no product", "SHOPIFY_GRAPHQL");
    return tagsAdd.node;
  }
  async startBulk(kind: BulkKind): Promise<string> {
    const query = kind === "products" ? BULK_PRODUCTS : BULK_ORDERS;
    const { bulkOperationRunQuery } = await this.request<{ bulkOperationRunQuery: { bulkOperation: BulkState | null; userErrors: { field?: string[]; message: string }[] } }>("StartBulk", START_BULK, { query, groupObjects: false });
    if (bulkOperationRunQuery.userErrors.length) throw new ShopifyUserError(bulkOperationRunQuery.userErrors);
    if (!bulkOperationRunQuery.bulkOperation) throw new AppError("Shopify returned no bulk operation", "SHOPIFY_GRAPHQL");
    return bulkOperationRunQuery.bulkOperation.id;
  }
  async getBulk(id: string): Promise<BulkState> {
    const result = (await this.request<{ bulkOperation: BulkState | null }>("GetBulk", GET_BULK, { id })).bulkOperation;
    if (!result) throw new AppError("Bulk operation not found", "BULK_NOT_FOUND");
    return result;
  }
  async *bulkLines(url: string): AsyncIterable<string> {
    const response = await this.download(url);
    if (!response.ok || !response.body) throw new AppError(`Bulk result HTTP ${response.status}`, "BULK_DOWNLOAD", response.status >= 500);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) yield line;
      }
      if (buffer.trim()) yield buffer;
    } finally { reader.releaseLock(); }
  }
}
