import type { Order, Product } from "../domain";
import { GraphqlAdminClient, type GraphqlTransport, type RetryPolicy } from "./graphql";

const updated = "2026-09-01T12:00:00.000Z";
export const fixtureProducts: Product[] = [
  { id: "gid://shopify/Product/101", title: "Canvas Field Tote", status: "ACTIVE", vendor: "Northline Goods", tags: ["canvas"], updatedAt: updated },
  { id: "gid://shopify/Product/102", title: "Ceramic Pour Over", status: "ACTIVE", vendor: "Hearth Workshop", tags: ["ceramic"], updatedAt: updated },
  { id: "gid://shopify/Product/103", title: "Linen Table Runner", status: "DRAFT", vendor: "Northline Goods", tags: ["linen"], updatedAt: updated }
];
export const fixtureOrders: Order[] = [
  { id: "gid://shopify/Order/201", name: "#1042", displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED", totalAmount: "68.00", currencyCode: "USD", processedAt: updated, updatedAt: updated },
  { id: "gid://shopify/Order/202", name: "#1043", displayFinancialStatus: "PAID", displayFulfillmentStatus: "FULFILLED", totalAmount: "32.50", currencyCode: "USD", processedAt: updated, updatedAt: updated }
];

type MockState = { products: Product[]; orders: Order[]; throttleNext: boolean; failNext: boolean; userErrorNext: boolean; bulk: Map<string, { kind: "products" | "orders"; polls: number }> };
const response = (data: unknown, status = 200) => Response.json(data, { status });
const asNode = (order: Order) => {
  const { totalAmount, currencyCode, ...rest } = order;
  return { ...rest, currentTotalPriceSet: { shopMoney: { amount: totalAmount, currencyCode } } };
};

export class MockShopifyAdminClient extends GraphqlAdminClient {
  private state: MockState;
  constructor(retry?: RetryPolicy) {
    const state: MockState = { products: structuredClone(fixtureProducts), orders: structuredClone(fixtureOrders), throttleNext: false, failNext: false, userErrorNext: false, bulk: new Map() };
    const transport: GraphqlTransport = async (query, variables) => {
      if (state.failNext) { state.failNext = false; return response({ error: "temporary" }, 503); }
      if (state.throttleNext) { state.throttleNext = false; return response({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }); }
      const id = String(variables.id ?? "");
      if (query.includes("query ListProducts")) {
        const start = variables.after ? Number(variables.after) : 0;
        const end = start + Number(variables.first);
        return response({ data: { products: { nodes: state.products.slice(start, end), pageInfo: { endCursor: end < state.products.length ? String(end) : null, hasNextPage: end < state.products.length } } } });
      }
      if (query.includes("query GetProduct")) return response({ data: { product: state.products.find((item) => item.id === id) ?? null } });
      if (query.includes("query ListOrders")) {
        const start = variables.after ? Number(variables.after) : 0;
        const end = start + Number(variables.first);
        return response({ data: { orders: { nodes: state.orders.slice(start, end).map(asNode), pageInfo: { endCursor: end < state.orders.length ? String(end) : null, hasNextPage: end < state.orders.length } } } });
      }
      if (query.includes("query GetOrder")) return response({ data: { order: state.orders.find((item) => item.id === id) ? asNode(state.orders.find((item) => item.id === id)!) : null } });
      if (query.includes("mutation AddMerchandisingTag")) {
        if (state.userErrorNext) { state.userErrorNext = false; return response({ data: { tagsAdd: { node: null, userErrors: [{ field: ["tags"], message: "Tag is invalid" }] } } }); }
        const product = state.products.find((item) => item.id === id);
        if (!product) return response({ data: { tagsAdd: { node: null, userErrors: [{ field: ["id"], message: "Product does not exist" }] } } });
        const tags = variables.tags as string[];
        product.tags = [...new Set([...product.tags, ...tags])];
        product.updatedAt = new Date().toISOString();
        return response({ data: { tagsAdd: { node: product, userErrors: [] } } });
      }
      if (query.includes("mutation StartBulk")) {
        const kind = String(variables.query).includes("products") ? "products" : "orders";
        const bulkId = `gid://shopify/BulkOperation/${state.bulk.size + 1}`;
        state.bulk.set(bulkId, { kind, polls: 0 });
        return response({ data: { bulkOperationRunQuery: { bulkOperation: { id: bulkId, status: "CREATED" }, userErrors: [] } } });
      }
      if (query.includes("query GetBulk")) {
        const bulk = state.bulk.get(id);
        if (!bulk) return response({ data: { bulkOperation: null } });
        bulk.polls++;
        return response({ data: { bulkOperation: { id, status: bulk.polls < 2 ? "RUNNING" : "COMPLETED", url: bulk.polls < 2 ? null : `mock://bulk/${encodeURIComponent(id)}` } } });
      }
      return response({ errors: [{ message: "Unknown mock operation" }] });
    };
    const download = async (url: string) => {
      const id = decodeURIComponent(url.replace("mock://bulk/", ""));
      const bulk = state.bulk.get(id);
      if (!bulk) return new Response(null, { status: 404 });
      const records = bulk.kind === "products" ? state.products : state.orders.map(asNode);
      return new Response(records.map((item) => JSON.stringify(item)).join("\n") + "\n", { status: 200 });
    };
    super(transport, download, retry);
    this.state = state;
  }
  throttleOnce() { this.state.throttleNext = true; }
  failOnce() { this.state.failNext = true; }
  userErrorOnce() { this.state.userErrorNext = true; }
  updateProduct(product: Product) { this.state.products = [...this.state.products.filter((item) => item.id !== product.id), product]; }
  deleteProduct(id: string) { this.state.products = this.state.products.filter((item) => item.id !== id); }
  updateOrder(order: Order) { this.state.orders = [...this.state.orders.filter((item) => item.id !== order.id), order]; }
}
