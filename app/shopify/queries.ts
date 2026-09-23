export const PRODUCTS = `#graphql
query ListProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT) {
    nodes { id title status vendor tags updatedAt }
    pageInfo { endCursor hasNextPage }
  }
}`;
export const PRODUCT = `#graphql
query GetProduct($id: ID!) { product(id: $id) { id title status vendor tags updatedAt } }`;
export const ORDERS = `#graphql
query ListOrders($first: Int!, $after: String) {
  orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true) {
    nodes { id name displayFinancialStatus displayFulfillmentStatus processedAt updatedAt currentTotalPriceSet { shopMoney { amount currencyCode } } }
    pageInfo { endCursor hasNextPage }
  }
}`;
export const ORDER = `#graphql
query GetOrder($id: ID!) { order(id: $id) { id name displayFinancialStatus displayFulfillmentStatus processedAt updatedAt currentTotalPriceSet { shopMoney { amount currencyCode } } } }`;
export const ADD_TAG = `#graphql
mutation AddMerchandisingTag($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { node { ... on Product { id title status vendor tags updatedAt } } userErrors { field message } }
}`;
export const START_BULK = `#graphql
mutation StartBulk($query: String!, $groupObjects: Boolean!) {
  bulkOperationRunQuery(query: $query, groupObjects: $groupObjects) { bulkOperation { id status } userErrors { field message } }
}`;
export const GET_BULK = `#graphql
query GetBulk($id: ID!) { bulkOperation(id: $id) { id status url errorCode } }`;
export const BULK_PRODUCTS = `{ products { edges { node { id title status vendor tags updatedAt } } } }`;
export const BULK_ORDERS = `{ orders { edges { node { id name displayFinancialStatus displayFulfillmentStatus processedAt updatedAt currentTotalPriceSet { shopMoney { amount currencyCode } } } } } }`;
