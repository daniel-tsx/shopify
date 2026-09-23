import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticatedLive } from "../route-context.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, store } = await authenticatedLive(request);
  return store.dashboard(shop);
};
export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  return <s-page heading="Merchant operations"><s-section heading="Installation"><s-paragraph>{data.shop?.domain} · {data.shop?.installationStatus.toLowerCase()}</s-paragraph><s-paragraph>Last successful sync: {data.shop?.lastSuccessfulSyncAt ? new Date(data.shop.lastSuccessfulSyncAt).toLocaleString() : "Never"}</s-paragraph></s-section><s-section heading="Local mirror"><s-stack direction="inline" gap="base"><s-box padding="base" borderWidth="base" borderRadius="base"><s-heading>Products</s-heading><s-paragraph>{data.productCount}</s-paragraph></s-box><s-box padding="base" borderWidth="base" borderRadius="base"><s-heading>Orders</s-heading><s-paragraph>{data.orderCount}</s-paragraph></s-box></s-stack></s-section><s-section heading="Recent sync jobs">{data.jobs.length ? data.jobs.map((job) => <s-paragraph key={job.id}>{job.kind} · {job.status} · attempts {job.attempts}</s-paragraph>) : <s-paragraph>No sync jobs yet.</s-paragraph>}</s-section><s-section heading="Recent webhooks">{data.deliveries.length ? data.deliveries.map((delivery) => <s-paragraph key={delivery.id}>{delivery.topic} · {delivery.status}</s-paragraph>) : <s-paragraph>No webhook deliveries yet.</s-paragraph>}</s-section></s-page>;
}
