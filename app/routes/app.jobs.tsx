import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticatedLive } from "../route-context.server";
export const loader = async ({ request }: LoaderFunctionArgs) => { const { shop, store } = await authenticatedLive(request); return (await store.dashboard(shop)).jobs; };
export default function Jobs() {
  const jobs = useLoaderData<typeof loader>();
  return <s-page heading="Sync jobs"><s-section>{jobs.length ? jobs.map((job) => <s-box key={job.id} padding="base" borderWidth="base"><s-heading>{job.kind} · {job.status}</s-heading><s-paragraph>Attempts {job.attempts} · Bulk ID {job.shopifyBulkOperationId ?? "Pending"}</s-paragraph>{job.error && <s-paragraph>{job.error}</s-paragraph>}</s-box>) : <s-paragraph>No jobs yet.</s-paragraph>}</s-section></s-page>;
}
