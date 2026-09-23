import type { GraphqlTransport } from "./graphql";
import { GraphqlAdminClient } from "./graphql";
import { GraphqlQueryError, HttpRetriableError, HttpResponseError } from "@shopify/shopify-api";
import { AppError } from "../domain";

// The caller obtains `admin` through authenticate.admin(request) or
// unauthenticated.admin(shop), so Shopify's framework owns token selection.
type AuthenticatedAdmin = { graphql: (query: string, options: { variables: Record<string, unknown>; tries: number }) => Promise<Response> };
export function liveShopifyClient(admin: AuthenticatedAdmin): GraphqlAdminClient {
  const transport: GraphqlTransport = async (query, variables) => {
    try { return await admin.graphql(query, { variables, tries: 1 }); }
    catch (error) {
      if (error instanceof GraphqlQueryError) {
        const errors: unknown = error.body?.errors;
        const throttled = Array.isArray(errors) && errors.some((item: unknown) => typeof item === "object" && item !== null && "extensions" in item && typeof item.extensions === "object" && item.extensions !== null && "code" in item.extensions && item.extensions.code === "THROTTLED");
        throw new AppError(error.message, throttled ? "SHOPIFY_THROTTLED" : "SHOPIFY_GRAPHQL", throttled);
      }
      if (error instanceof HttpRetriableError) throw new AppError(error.message, "SHOPIFY_HTTP", true);
      if (error instanceof HttpResponseError) throw new AppError(error.message, "SHOPIFY_HTTP");
      throw error;
    }
  };
  return new GraphqlAdminClient(transport);
}
