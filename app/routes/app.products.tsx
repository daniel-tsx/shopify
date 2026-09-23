import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { authenticatedLive } from "../route-context.server";
import { liveShopifyClient } from "../shopify/live.server";
import { featureProduct } from "../services/merchandising";
import { AppError } from "../domain";
import { log } from "../observability";

export const loader = async ({ request }: LoaderFunctionArgs) => { const { shop, store } = await authenticatedLive(request); return store.products(shop); };
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, store, admin } = await authenticatedLive(request);
  const form = await request.formData();
  try { await featureProduct(store, liveShopifyClient(admin), shop, String(form.get("productId") ?? "")); log("info", "product.featured", { requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(), shop }); return { message: "Featured tag added in Shopify and local mirror." }; }
  catch (error) { if (error instanceof AppError) return { message: error.message }; throw error; }
};
export default function Products() {
  const products = useLoaderData<typeof loader>(); const result = useActionData<typeof action>();
  return <s-page heading="Products"><s-section><s-paragraph>These rows come from the local mirror. Start a bulk sync in Settings to refresh them.</s-paragraph>{result?.message && <s-paragraph>{result.message}</s-paragraph>}{products.length ? products.map((product) => <s-box key={product.id} padding="base" borderWidth="base"><s-heading>{product.title}</s-heading><s-paragraph>{product.vendor ?? "No vendor"} · {product.status} · {product.tags.join(", ") || "No tags"}</s-paragraph><Form method="post"><input type="hidden" name="productId" value={product.id} /><button type="submit">Add featured tag</button></Form></s-box>) : <s-paragraph>No mirrored products yet. Start an initial sync.</s-paragraph>}</s-section></s-page>;
}
