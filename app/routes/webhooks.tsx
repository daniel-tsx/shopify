import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PrismaOperationsStore } from "../store/prisma.server";
import { receiveWebhook } from "../services/webhooks";
import { log } from "../observability";

function resourceId(topic: string, payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const row = payload as Record<string, unknown>;
  if (topic === "APP_SCOPES_UPDATE") return Array.isArray(row.current) ? row.current.filter((value): value is string => typeof value === "string").join(",") : null;
  if (typeof row.admin_graphql_api_id === "string") return row.admin_graphql_api_id;
  if (typeof row.id === "number" && topic.startsWith("PRODUCTS_")) return `gid://shopify/Product/${row.id}`;
  if (typeof row.id === "number" && topic.startsWith("ORDERS_")) return `gid://shopify/Order/${row.id}`;
  return null;
}
export const action = async ({ request }: ActionFunctionArgs) => {
  if (process.env.SHOPIFY_MODE !== "live") return new Response("Webhook HTTP endpoint disabled in mock mode", { status: 404 });
  const { shop, topic, payload, webhookId } = await authenticate.webhook(request);
  const inserted = await receiveWebhook(new PrismaOperationsStore(prisma), { id: webhookId, shopDomain: shop, topic, resourceId: resourceId(topic, payload) });
  log("info", "webhook.received", { requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(), shop, topic, webhookId, duplicate: !inserted });
  return new Response(null, { status: 200 });
};
