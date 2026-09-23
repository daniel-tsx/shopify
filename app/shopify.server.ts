import "@shopify/shopify-app-react-router/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { PrismaOperationsStore } from "./store/prisma.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? "",
  appUrl: process.env.SHOPIFY_APP_URL ?? "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  authPathPrefix: "/auth",
  distribution: AppDistribution.AppStore,
  sessionStorage: new PrismaSessionStorage(prisma),
  future: { expiringOfflineAccessTokens: true },
  hooks: { afterAuth: async ({ session }) => {
    await new PrismaOperationsStore(prisma).install(session.shop, session.scope ?? "");
  } }
});
export default shopify;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
