import { unauthenticated } from "../shopify.server";

interface OrderInfo {
  name: string;
  email?: string;
  createdAt: string;
  financialStatus: string;
  fulfillmentStatus: string;
  trackingNumbers: string[];
  lineItems: { title: string; quantity: number }[];
}

export async function lookupOrderByNumber(
  shop: string,
  orderNumber: string,
): Promise<OrderInfo | null> {
  try {
    const { admin } = await unauthenticated.admin(shop);

    // Remove # prefix if present
    const cleanNumber = orderNumber.replace(/^#/, "");

    const response = await admin.graphql(
      `#graphql
      query OrderByName($query: String!) {
        orders(first: 1, query: $query) {
          nodes {
            name
            email
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            fulfillments {
              trackingInfo {
                number
              }
            }
            lineItems(first: 20) {
              nodes {
                title
                quantity
              }
            }
          }
        }
      }`,
      { variables: { query: `name:#${cleanNumber}` } },
    );

    const data = await response.json();
    const order = data.data?.orders?.nodes?.[0];
    if (!order) return null;

    return {
      name: order.name,
      email: order.email ?? undefined,
      createdAt: order.createdAt,
      financialStatus: order.displayFinancialStatus ?? "UNKNOWN",
      fulfillmentStatus: order.displayFulfillmentStatus ?? "UNFULFILLED",
      trackingNumbers: (order.fulfillments ?? []).flatMap(
        (f: { trackingInfo: { number: string }[] }) =>
          f.trackingInfo.map((t) => t.number),
      ),
      lineItems: (order.lineItems?.nodes ?? []).map(
        (li: { title: string; quantity: number }) => ({
          title: li.title,
          quantity: li.quantity,
        }),
      ),
    };
  } catch (error) {
    console.error("Error looking up order by number:", error);
    return null;
  }
}

export async function lookupOrdersByEmail(
  shop: string,
  email: string,
): Promise<OrderInfo[]> {
  try {
    const { admin } = await unauthenticated.admin(shop);

    const response = await admin.graphql(
      `#graphql
      query OrdersByEmail($query: String!) {
        orders(first: 5, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes {
            name
            email
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            fulfillments {
              trackingInfo {
                number
              }
            }
            lineItems(first: 10) {
              nodes {
                title
                quantity
              }
            }
          }
        }
      }`,
      { variables: { query: `email:${email}` } },
    );

    const data = await response.json();
    const orders = data.data?.orders?.nodes ?? [];

    return orders.map(
      (order: {
        name: string;
        email?: string;
        createdAt: string;
        displayFinancialStatus: string;
        displayFulfillmentStatus: string;
        fulfillments: { trackingInfo: { number: string }[] }[];
        lineItems: { nodes: { title: string; quantity: number }[] };
      }) => ({
        name: order.name,
        email: order.email ?? undefined,
        createdAt: order.createdAt,
        financialStatus: order.displayFinancialStatus ?? "UNKNOWN",
        fulfillmentStatus: order.displayFulfillmentStatus ?? "UNFULFILLED",
        trackingNumbers: (order.fulfillments ?? []).flatMap(
          (f) => f.trackingInfo.map((t) => t.number),
        ),
        lineItems: (order.lineItems?.nodes ?? []).map((li) => ({
          title: li.title,
          quantity: li.quantity,
        })),
      }),
    );
  } catch (error) {
    console.error("Error looking up orders by email:", error);
    return [];
  }
}
