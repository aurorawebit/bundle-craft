import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import {
  getOrCreateConversation,
  addMessage,
  getChatSettings,
} from "../models/chat.server";
import { generateChatResponse } from "../services/ai.server";
import {
  lookupOrderByNumber,
  lookupOrdersByEmail,
} from "../services/orders.server";

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxPerMinute = 20): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}

function corsHeaders(origin?: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Handle CORS preflight
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get("origin") ?? undefined),
    });
  }
  return new Response("Method not allowed", { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const origin = request.headers.get("origin") ?? undefined;
  const headers = corsHeaders(origin);

  try {
    const body = await request.json();
    const { shop, sessionId, message, customerEmail } = body;

    if (!shop || !sessionId || !message) {
      return Response.json(
        { error: "Missing required fields: shop, sessionId, message" },
        { status: 400, headers },
      );
    }

    if (typeof message !== "string" || message.length > 2000) {
      return Response.json(
        { error: "Message must be a string under 2000 characters" },
        { status: 400, headers },
      );
    }

    // Verify shop has installed the app
    const session = await db.session.findFirst({
      where: { shop, isOnline: false },
    });
    if (!session) {
      return Response.json(
        { error: "Shop not found" },
        { status: 404, headers },
      );
    }

    // Rate limit by sessionId
    if (!checkRateLimit(sessionId)) {
      return Response.json(
        { error: "Too many messages. Please wait a moment." },
        { status: 429, headers },
      );
    }

    // Get or create conversation
    const conversation = await getOrCreateConversation(
      shop,
      sessionId,
      customerEmail,
    );

    // Save customer message
    await addMessage(conversation.id, "customer", message);

    // Get chat settings
    const settings = await getChatSettings(shop);

    if (!settings.aiEnabled) {
      const autoMsg = await addMessage(
        conversation.id,
        "ai",
        "Thanks for your message! Our team will get back to you shortly.",
      );
      return Response.json(
        {
          conversationId: conversation.id,
          message: {
            id: autoMsg.id,
            content: autoMsg.content,
            senderType: autoMsg.senderType,
            createdAt: autoMsg.createdAt,
          },
        },
        { headers },
      );
    }

    // Look up order data if message contains order number or email
    let orderContext = null;
    const orderNumberMatch = message.match(/#?\d{4,}/);
    if (orderNumberMatch) {
      const order = await lookupOrderByNumber(
        shop,
        orderNumberMatch[0],
      );
      if (order) orderContext = [order];
    }

    // If customer provided email, look up their orders
    const emailToLookup =
      customerEmail || conversation.customerEmail;
    if (!orderContext && emailToLookup) {
      const orders = await lookupOrdersByEmail(shop, emailToLookup);
      if (orders.length > 0) orderContext = orders;
    }

    // Also check if message contains an email
    if (!orderContext) {
      const emailMatch = message.match(
        /[\w.-]+@[\w.-]+\.\w+/,
      );
      if (emailMatch) {
        // Update conversation with email
        if (!conversation.customerEmail) {
          await db.conversation.update({
            where: { id: conversation.id },
            data: { customerEmail: emailMatch[0] },
          });
        }
        const orders = await lookupOrdersByEmail(shop, emailMatch[0]);
        if (orders.length > 0) orderContext = orders;
      }
    }

    // Build message history for AI
    const allMessages = [
      ...conversation.messages.map((m) => ({
        senderType: m.senderType,
        content: m.content,
      })),
      { senderType: "customer", content: message },
    ];

    const aiResponse = await generateChatResponse(
      allMessages,
      orderContext,
      settings.systemPrompt,
      {
        provider: settings.aiProvider,
        apiKey: settings.aiApiKey || "",
        model: settings.aiModel,
      },
    );

    const aiMessage = await addMessage(
      conversation.id,
      "ai",
      aiResponse,
      orderContext ? JSON.stringify(orderContext) : undefined,
    );

    return Response.json(
      {
        conversationId: conversation.id,
        message: {
          id: aiMessage.id,
          content: aiMessage.content,
          senderType: aiMessage.senderType,
          createdAt: aiMessage.createdAt,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers },
    );
  }
};
