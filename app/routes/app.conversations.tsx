import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getConversations, getConversationStats } from "../models/chat.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const page = Number(url.searchParams.get("page") || "1");

  const [result, stats] = await Promise.all([
    getConversations(session.shop, status, page),
    getConversationStats(session.shop),
  ]);

  return { ...result, stats, status };
};

export default function Conversations() {
  const { conversations, total, page, limit, stats, status } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [filter, setFilter] = useState(status);

  // Poll for new conversations every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [revalidator]);

  const handleFilterChange = useCallback(
    (e: Event) => {
      const value = (e.currentTarget as HTMLSelectElement).value;
      setFilter(value);
      navigate(`/app/conversations?status=${value}`);
    },
    [navigate],
  );

  const totalPages = Math.ceil(total / limit);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <s-page heading="Conversations">
      <s-box paddingBlockEnd="400">
        <s-inline gap="400">
          <s-box
            padding="400"
            background="bg-surface"
            borderRadius="200"
            borderWidth="025"
            borderColor="border"
          >
            <s-text variant="headingMd">{stats.total}</s-text>
            <s-text variant="bodySm" tone="subdued">
              Total
            </s-text>
          </s-box>
          <s-box
            padding="400"
            background="bg-surface"
            borderRadius="200"
            borderWidth="025"
            borderColor="border"
          >
            <s-text variant="headingMd">{stats.active}</s-text>
            <s-text variant="bodySm" tone="subdued">
              Active
            </s-text>
          </s-box>
          <s-box
            padding="400"
            background="bg-surface"
            borderRadius="200"
            borderWidth="025"
            borderColor="border"
          >
            <s-text variant="headingMd">{stats.escalated}</s-text>
            <s-text variant="bodySm" tone="subdued">
              Escalated
            </s-text>
          </s-box>
        </s-inline>
      </s-box>

      <s-section>
        <s-box paddingBlockEnd="400">
          <s-select
            label="Filter"
            value={filter}
            onChange={handleFilterChange}
          >
            <s-option value="all">All conversations</s-option>
            <s-option value="active">Active</s-option>
            <s-option value="escalated">Escalated</s-option>
            <s-option value="closed">Closed</s-option>
          </s-select>
        </s-box>

        {conversations.length === 0 ? (
          <s-empty-state heading="No conversations yet">
            <s-text>
              Conversations will appear here when customers start chatting on
              your store.
            </s-text>
          </s-empty-state>
        ) : (
          <s-box>
            {conversations.map((conv) => {
              const lastMessage = conv.messages[0];
              return (
                <s-box
                  key={conv.id}
                  padding="400"
                  background="bg-surface"
                  borderRadius="200"
                  borderWidth="025"
                  borderColor="border"
                  cursor="pointer"
                  onClick={() => navigate(`/app/conversations/${conv.id}`)}
                  style={{ marginBottom: "8px" }}
                >
                  <s-inline align="space-between" blockAlign="start">
                    <s-box>
                      <s-inline gap="200" blockAlign="center">
                        <s-text variant="headingSm">
                          {conv.customerEmail || conv.customerName || "Anonymous"}
                        </s-text>
                        <s-badge
                          tone={
                            conv.status === "escalated"
                              ? "warning"
                              : conv.status === "closed"
                                ? undefined
                                : "info"
                          }
                        >
                          {conv.status}
                        </s-badge>
                      </s-inline>
                      {lastMessage && (
                        <s-text variant="bodySm" tone="subdued">
                          {lastMessage.content.length > 80
                            ? lastMessage.content.slice(0, 80) + "…"
                            : lastMessage.content}
                        </s-text>
                      )}
                    </s-box>
                    <s-text variant="bodySm" tone="subdued">
                      {formatTime(conv.updatedAt)}
                    </s-text>
                  </s-inline>
                </s-box>
              );
            })}

            {totalPages > 1 && (
              <s-box paddingBlockStart="400">
                <s-inline align="center" gap="200">
                  {page > 1 && (
                    <s-button
                      onClick={() =>
                        navigate(
                          `/app/conversations?status=${filter}&page=${page - 1}`,
                        )
                      }
                    >
                      Previous
                    </s-button>
                  )}
                  <s-text>
                    Page {page} of {totalPages}
                  </s-text>
                  {page < totalPages && (
                    <s-button
                      onClick={() =>
                        navigate(
                          `/app/conversations?status=${filter}&page=${page + 1}`,
                        )
                      }
                    >
                      Next
                    </s-button>
                  )}
                </s-inline>
              </s-box>
            )}
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
