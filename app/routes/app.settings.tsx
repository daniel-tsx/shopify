import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { authenticatedLive } from "../route-context.server";
import { requestInitialSync } from "../services/sync";
export const loader = async ({ request }: LoaderFunctionArgs) => { const { shop, store } = await authenticatedLive(request); return { shop, syncEnabled: await store.syncEnabled(shop) }; };
export const action = async ({ request }: ActionFunctionArgs) => { const { shop, store } = await authenticatedLive(request); await requestInitialSync(store, shop); return { message: "Product and order bulk jobs queued. Run the worker process to advance them." }; };
export default function Settings() {
  const data = useLoaderData<typeof loader>(); const result = useActionData<typeof action>();
  return <s-page heading="Settings"><s-section heading="Synchronization"><s-paragraph>Shop: {data.shop}</s-paragraph><s-paragraph>Incremental sync: {data.syncEnabled ? "Enabled" : "Not enabled"}</s-paragraph><Form method="post"><button type="submit">Start full synchronization</button></Form>{result?.message && <s-paragraph>{result.message}</s-paragraph>}</s-section></s-page>;
}
