import prisma from "../app/db.server";
import { PrismaOperationsStore } from "../app/store/prisma.server";
import { runNextJob } from "../app/jobs/runner";
import { unauthenticated } from "../app/shopify.server";
import { liveShopifyClient } from "../app/shopify/live.server";

if (process.env.SHOPIFY_MODE !== "live") throw new Error("Use demo commands for mock mode; worker requires live Shopify configuration.");
const store = new PrismaOperationsStore(prisma);
while (true) {
  const worked = await runNextJob(store, async (shop) => {
    const account = await store.shop(shop);
    if (account?.installationStatus !== "INSTALLED") throw new Error("Inactive installation");
    const { admin } = await unauthenticated.admin(shop);
    return liveShopifyClient(admin);
  });
  if (!worked) await new Promise((resolve) => setTimeout(resolve, 1000));
}
