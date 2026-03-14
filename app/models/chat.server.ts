import db from "../db.server";

export async function getOrCreateConversation(
  shop: string,
  sessionId: string,
  customerEmail?: string,
) {
  // Try to find existing active conversation for this session
  const existing = await db.conversation.findFirst({
    where: { shop, sessionId, status: { not: "closed" } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (existing) {
    // Update email if newly provided
    if (customerEmail && !existing.customerEmail) {
      await db.conversation.update({
        where: { id: existing.id },
        data: { customerEmail },
      });
    }
    return existing;
  }

  return db.conversation.create({
    data: { shop, sessionId, customerEmail },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function addMessage(
  conversationId: string,
  senderType: "customer" | "ai" | "agent",
  content: string,
  metadata?: string,
) {
  const message = await db.message.create({
    data: { conversationId, senderType, content, metadata },
  });

  await db.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return message;
}

export async function getConversation(id: string, shop: string) {
  return db.conversation.findFirst({
    where: { id, shop },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getConversations(
  shop: string,
  status?: string,
  page = 1,
  limit = 20,
) {
  const where: Record<string, unknown> = { shop };
  if (status && status !== "all") {
    where.status = status;
  }

  const [conversations, total] = await Promise.all([
    db.conversation.findMany({
      where,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.conversation.count({ where }),
  ]);

  return { conversations, total, page, limit };
}

export async function updateConversationStatus(
  id: string,
  shop: string,
  status: "active" | "closed" | "escalated",
) {
  return db.conversation.updateMany({
    where: { id, shop },
    data: { status },
  });
}

export async function getConversationMessages(
  conversationId: string,
  limit = 50,
) {
  return db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function getChatSettings(shop: string) {
  const settings = await db.chatSettings.findUnique({ where: { shop } });
  return (
    settings ?? {
      id: "",
      shop,
      welcomeMessage: "Hi! How can I help you today?",
      aiEnabled: true,
      aiProvider: "claude",
      aiApiKey: null,
      aiModel: null,
      systemPrompt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  );
}

export async function updateChatSettings(
  shop: string,
  data: {
    welcomeMessage?: string;
    aiEnabled?: boolean;
    aiProvider?: string;
    aiApiKey?: string | null;
    aiModel?: string | null;
    systemPrompt?: string | null;
  },
) {
  return db.chatSettings.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });
}

export async function getConversationStats(shop: string) {
  const [total, active, escalated] = await Promise.all([
    db.conversation.count({ where: { shop } }),
    db.conversation.count({ where: { shop, status: "active" } }),
    db.conversation.count({ where: { shop, status: "escalated" } }),
  ]);
  return { total, active, escalated };
}
