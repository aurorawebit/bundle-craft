import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";

function corsHeaders(origin?: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = request.headers.get("origin") ?? undefined;
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const sessionId = url.searchParams.get("sessionId");

  if (!shop || !sessionId) {
    return Response.json(
      { error: "Missing shop or sessionId" },
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

  const conversation = await db.conversation.findFirst({
    where: { shop, sessionId, status: { not: "closed" } },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true,
          content: true,
          senderType: true,
          createdAt: true,
        },
      },
    },
  });

  return Response.json(
    {
      conversationId: conversation?.id ?? null,
      messages: conversation?.messages ?? [],
    },
    { headers },
  );
};
