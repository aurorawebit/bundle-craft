import Anthropic from "@anthropic-ai/sdk";

interface ChatMessage {
  senderType: string;
  content: string;
}

interface OrderInfo {
  name: string;
  email?: string;
  createdAt: string;
  financialStatus: string;
  fulfillmentStatus: string;
  trackingNumbers: string[];
  lineItems: { title: string; quantity: number }[];
}

interface AiConfig {
  provider: string; // claude | openai | gemini
  apiKey: string;
  model?: string | null;
}

const DEFAULT_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
};

function buildSystemPrompt(
  orderContext: OrderInfo[] | null,
  customSystemPrompt?: string | null,
): string {
  const parts = [
    "You are a friendly and helpful customer support assistant for an online store.",
    "Keep your responses concise and helpful. Be warm but professional.",
    "If the customer asks about an order, use the order data provided to give accurate answers.",
    "Never fabricate order information. If you don't have order data, ask the customer for their order number or email.",
    "You can answer general questions about products, shipping, returns, etc.",
    "Respond in the same language the customer uses.",
  ];

  if (customSystemPrompt) {
    parts.push(`Store-specific instructions: ${customSystemPrompt}`);
  }

  if (orderContext && orderContext.length > 0) {
    const orderSummary = orderContext
      .map((o) => {
        const items = o.lineItems
          .map((li) => `${li.title} x${li.quantity}`)
          .join(", ");
        const tracking =
          o.trackingNumbers.length > 0
            ? `Tracking: ${o.trackingNumbers.join(", ")}`
            : "No tracking yet";
        return [
          `Order ${o.name}:`,
          `  Status: ${o.financialStatus}`,
          `  Fulfillment: ${o.fulfillmentStatus}`,
          `  ${tracking}`,
          `  Items: ${items}`,
          `  Placed: ${o.createdAt}`,
        ].join("\n");
      })
      .join("\n\n");
    parts.push(`\nCustomer order data:\n${orderSummary}`);
  }

  return parts.join("\n");
}

function prepareMessages(messages: ChatMessage[]) {
  const mapped = messages.map((m) => ({
    role: (m.senderType === "customer" ? "user" : "assistant") as
      | "user"
      | "assistant",
    content: m.content,
  }));

  // Merge consecutive same-role messages
  const cleaned: { role: "user" | "assistant"; content: string }[] = [];
  for (const msg of mapped) {
    if (
      cleaned.length === 0 ||
      cleaned[cleaned.length - 1].role !== msg.role
    ) {
      cleaned.push(msg);
    } else {
      cleaned[cleaned.length - 1].content += "\n" + msg.content;
    }
  }

  return cleaned;
}

async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 500,
    system: systemPrompt,
    messages,
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const body = {
    model,
    max_tokens: 500,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: 500 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function generateChatResponse(
  messages: ChatMessage[],
  orderContext: OrderInfo[] | null,
  customSystemPrompt?: string | null,
  aiConfig?: AiConfig,
): Promise<string> {
  const cleaned = prepareMessages(messages);
  if (cleaned.length === 0 || cleaned[0].role !== "user") {
    return "Hi! How can I help you today?";
  }

  const systemPrompt = buildSystemPrompt(orderContext, customSystemPrompt);
  const provider = aiConfig?.provider || "claude";
  const apiKey = aiConfig?.apiKey || "";
  const model = aiConfig?.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.claude;

  if (!apiKey) {
    return "Chat AI is not configured yet. Please set up your API key in the app settings.";
  }

  try {
    switch (provider) {
      case "openai":
        return await callOpenAI(apiKey, model, systemPrompt, cleaned);
      case "gemini":
        return await callGemini(apiKey, model, systemPrompt, cleaned);
      case "claude":
      default:
        return await callClaude(apiKey, model, systemPrompt, cleaned);
    }
  } catch (error) {
    console.error(`AI provider (${provider}) error:`, error);
    return "Sorry, I'm having trouble connecting right now. Please try again in a moment.";
  }
}
