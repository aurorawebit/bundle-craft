import { useState, useEffect, useRef, useCallback } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getConversation,
  addMessage,
  updateConversationStatus,
} from "../models/chat.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversation = await getConversation(params.id!, session.shop);

  if (!conversation) {
    throw new Response("Conversation not found", { status: 404 });
  }

  return { conversation };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "reply") {
    const content = formData.get("content") as string;
    if (!content?.trim()) return { error: "Message cannot be empty" };

    await addMessage(params.id!, "agent", content.trim());
    // Reactivate if escalated
    await updateConversationStatus(params.id!, session.shop, "active");
    return { ok: true };
  }

  if (intent === "close") {
    await updateConversationStatus(params.id!, session.shop, "closed");
    return { ok: true, closed: true };
  }

  if (intent === "escalate") {
    await updateConversationStatus(params.id!, session.shop, "escalated");
    return { ok: true };
  }

  return { error: "Unknown intent" };
};

export default function ConversationDetail() {
  const { conversation } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Poll for new messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [revalidator]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.messages.length]);

  // Show toast on reply success
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if ((fetcher.data as { ok?: boolean }).ok) {
        if ((fetcher.data as { closed?: boolean }).closed) {
          shopify.toast.show("Conversation closed");
        } else {
          setReplyText("");
          shopify.toast.show("Reply sent");
        }
      }
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const handleSendReply = useCallback(() => {
    if (!replyText.trim()) return;
    fetcher.submit(
      { intent: "reply", content: replyText },
      { method: "POST" },
    );
  }, [fetcher, replyText]);

  const handleClose = useCallback(() => {
    fetcher.submit({ intent: "close" }, { method: "POST" });
  }, [fetcher]);

  const handleEscalate = useCallback(() => {
    fetcher.submit({ intent: "escalate" }, { method: "POST" });
  }, [fetcher]);

  const sendBtnRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLElement>(null);
  const escalateBtnRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sendEl = sendBtnRef.current;
    const closeEl = closeBtnRef.current;
    const escalateEl = escalateBtnRef.current;

    if (sendEl) sendEl.addEventListener("click", handleSendReply);
    if (closeEl) closeEl.addEventListener("click", handleClose);
    if (escalateEl) escalateEl.addEventListener("click", handleEscalate);

    return () => {
      if (sendEl) sendEl.removeEventListener("click", handleSendReply);
      if (closeEl) closeEl.removeEventListener("click", handleClose);
      if (escalateEl)
        escalateEl.removeEventListener("click", handleEscalate);
    };
  }, [handleSendReply, handleClose, handleEscalate]);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const senderLabel = (type: string) => {
    switch (type) {
      case "customer":
        return "Customer";
      case "ai":
        return "AI";
      case "agent":
        return "You";
      default:
        return type;
    }
  };

  const customerInfo =
    conversation.customerEmail || conversation.customerName || "Anonymous";
  const isClosed = conversation.status === "closed";

  return (
    <s-page
      heading={`Conversation with ${customerInfo}`}
      backAction={{ url: "/app/conversations" }}
    >
      <s-inline slot="secondary-actions" gap="200">
        {!isClosed && conversation.status !== "escalated" && (
          <s-button ref={escalateBtnRef} variant="tertiary">
            Escalate
          </s-button>
        )}
        {!isClosed && (
          <s-button ref={closeBtnRef} tone="critical" variant="tertiary">
            Close
          </s-button>
        )}
      </s-inline>

      <s-section>
        <s-box paddingBlockEnd="200">
          <s-inline gap="200">
            <s-badge
              tone={
                conversation.status === "escalated"
                  ? "warning"
                  : conversation.status === "closed"
                    ? undefined
                    : "info"
              }
            >
              {conversation.status}
            </s-badge>
            {conversation.customerEmail && (
              <s-text variant="bodySm" tone="subdued">
                {conversation.customerEmail}
              </s-text>
            )}
            <s-text variant="bodySm" tone="subdued">
              Started {formatTime(conversation.createdAt)}
            </s-text>
          </s-inline>
        </s-box>

        <s-box
          padding="400"
          background="bg-surface-secondary"
          borderRadius="200"
          style={{
            maxHeight: "500px",
            overflowY: "auto",
          }}
        >
          {conversation.messages.map((msg) => (
            <s-box
              key={msg.id}
              paddingBlockEnd="300"
              style={{
                textAlign: msg.senderType === "customer" ? "left" : "right",
              }}
            >
              <s-text variant="bodySm" tone="subdued">
                {senderLabel(msg.senderType)} · {formatTime(msg.createdAt)}
              </s-text>
              <s-box
                padding="300"
                background={
                  msg.senderType === "customer"
                    ? "bg-surface"
                    : msg.senderType === "ai"
                      ? "bg-surface-info"
                      : "bg-surface-success"
                }
                borderRadius="200"
                style={{
                  display: "inline-block",
                  maxWidth: "80%",
                  textAlign: "left",
                }}
              >
                <s-text>{msg.content}</s-text>
              </s-box>
            </s-box>
          ))}
          <div ref={messagesEndRef} />
        </s-box>

        {!isClosed && (
          <s-box paddingBlockStart="400">
            <s-inline gap="200" blockAlign="end">
              <s-box style={{ flex: 1 }}>
                <s-text-field
                  label="Reply"
                  labelHidden
                  placeholder="Type a reply..."
                  value={replyText}
                  onChange={(e: Event) =>
                    setReplyText((e.currentTarget as HTMLInputElement).value)
                  }
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                />
              </s-box>
              <s-button
                ref={sendBtnRef}
                variant="primary"
                disabled={!replyText.trim() || fetcher.state !== "idle"}
              >
                Send
              </s-button>
            </s-inline>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
