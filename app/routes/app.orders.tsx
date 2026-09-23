import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticatedLive } from "../route-context.server";
export const loader = async ({ request }: LoaderFunctionArgs) => { const { shop, store } = await authenticatedLive(request); return store.orders(shop); };
export default function Orders() {
  const orders = useLoaderData<typeof loader>();
  return <s-page heading="Orders"><s-section><s-paragraph>Only operational status and totals are mirrored. Customer PII stays in Shopify.</s-paragraph>{orders.length ? orders.map((order) => <s-box key={order.id} padding="base" borderWidth="base"><s-heading>{order.name}</s-heading><s-paragraph>{order.displayFinancialStatus} · {order.displayFulfillmentStatus} · {order.totalAmount} {order.currencyCode}</s-paragraph></s-box>) : <s-paragraph>No mirrored orders yet. Start an initial sync.</s-paragraph>}</s-section></s-page>;
}
