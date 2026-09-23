import { AppError, type ShopifyAdminClient } from "../domain";
import type { OperationsStore } from "../store/types";

const TAG = "merchant-ops:featured";
export async function featureProduct(store: OperationsStore, client: ShopifyAdminClient, shop: string, productId: string) {
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) throw new AppError("Invalid product ID", "VALIDATION");
  const account = await store.shop(shop);
  if (account?.installationStatus !== "INSTALLED") throw new AppError("Shop is not installed", "SHOP_NOT_INSTALLED");
  if (!(await store.product(shop, productId))) throw new AppError("Product is not in the local mirror", "VALIDATION");
  const product = await client.addMerchandisingTag(productId, TAG);
  await store.upsertProducts(shop, [product]);
  await store.audit(shop, "PRODUCT_FEATURED", productId, { tag: TAG });
  return product;
}
