import { MockShopifyAdminClient, fixtureProducts } from "../app/shopify/mock";
import { MemoryOperationsStore } from "../app/store/memory";
import { requestInitialSync, refreshProductsByCursor } from "../app/services/sync";
import { receiveWebhook } from "../app/services/webhooks";
import { runNextJob } from "../app/jobs/runner";

const shop = "northline-demo.myshopify.com";
const command = process.argv[2];
const variant = process.argv[3];
const store = new MemoryOperationsStore();
const client = new MockShopifyAdminClient({ attempts: 4, baseDelayMs: 0, sleep: async () => {} });
await store.install(shop, "read_products,write_products,read_orders");

async function drain() {
  for (let tick = 0; tick < 10; tick++) {
    const worked = await runNextJob(store, async () => client, new Date(Date.now() + tick * 6000));
    if (!worked) break;
  }
}
if (command === "seed") {
  await store.setSyncEnabled(shop, true);
  const count = await refreshProductsByCursor(store, client, shop, 2);
  process.stdout.write(JSON.stringify({ shop, count, products: await store.products(shop) }, null, 2) + "\n");
} else if (command === "sync") {
  await requestInitialSync(store, shop); await drain();
  process.stdout.write(JSON.stringify(await store.dashboard(shop), null, 2) + "\n");
} else if (command === "webhook") {
  await requestInitialSync(store, shop); await drain();
  const updated = { ...fixtureProducts[0]!, title: "Canvas Field Tote — Updated", updatedAt: new Date().toISOString() };
  client.updateProduct(updated);
  const delivery = { id: "demo-delivery-1", shopDomain: shop, topic: "PRODUCTS_UPDATE", resourceId: updated.id };
  const accepted = await receiveWebhook(store, delivery);
  const duplicate = variant === "duplicate" ? await receiveWebhook(store, delivery) : null;
  await drain();
  process.stdout.write(JSON.stringify({ accepted, duplicate, product: await store.product(shop, updated.id), deliveries: (await store.dashboard(shop)).deliveries }, null, 2) + "\n");
} else if (command === "throttle") {
  client.throttleOnce();
  const page = await client.listProducts(2);
  process.stdout.write(JSON.stringify({ recoveredAfterThrottle: true, page }, null, 2) + "\n");
} else {
  process.stderr.write("Use: seed | sync | webhook [product-update|duplicate] | throttle\n");
  process.exitCode = 1;
}
