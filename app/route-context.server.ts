import { authenticate } from "./shopify.server";
import prisma from "./db.server";
import { PrismaOperationsStore } from "./store/prisma.server";

export async function authenticatedLive(request: Request) {
  if (process.env.SHOPIFY_MODE !== "live") throw new Response("Embedded UI requires a real Shopify installation. Use the mock CLI and tests for local learning.", { status: 503 });
  const { admin, session } = await authenticate.admin(request);
  const store = new PrismaOperationsStore(prisma);
  const account = await store.shop(session.shop);
  if (account?.installationStatus !== "INSTALLED") throw new Response("Installation is inactive", { status: 403 });
  return { admin, shop: session.shop, store };
}
