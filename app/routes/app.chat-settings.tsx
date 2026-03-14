import { useState, useEffect, useRef, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getChatSettings, updateChatSettings } from "../models/chat.server";

const MODEL_OPTIONS: Record<string, { label: string; value: string }[]> = {
  claude: [
    { label: "Claude Sonnet 4 (recommended)", value: "claude-sonnet-4-20250514" },
    { label: "Claude Haiku 3.5 (faster, cheaper)", value: "claude-haiku-4-5-20251001" },
  ],
  openai: [
    { label: "GPT-4o (recommended)", value: "gpt-4o" },
    { label: "GPT-4o Mini (faster, cheaper)", value: "gpt-4o-mini" },
  ],
  gemini: [
    { label: "Gemini 2.0 Flash (recommended)", value: "gemini-2.0-flash" },
    { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro-preview-06-05" },
  ],
};

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  gemini: "Gemini (Google)",
};

const API_KEY_HELP: Record<string, string> = {
  claude: "Get your API key from console.anthropic.com",
  openai: "Get your API key from platform.openai.com/api-keys",
  gemini: "Get your API key from aistudio.google.com/apikey",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getChatSettings(session.shop);
  // Mask the API key for display
  const maskedKey = settings.aiApiKey
    ? settings.aiApiKey.slice(0, 8) + "••••••••" + settings.aiApiKey.slice(-4)
    : "";
  return {
    settings: { ...settings, aiApiKey: maskedKey },
    hasApiKey: !!settings.aiApiKey,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const aiApiKey = formData.get("aiApiKey") as string;
  const updateData: Parameters<typeof updateChatSettings>[1] = {
    welcomeMessage: (formData.get("welcomeMessage") as string) || undefined,
    aiEnabled: formData.get("aiEnabled") === "true",
    aiProvider: (formData.get("aiProvider") as string) || "claude",
    aiModel: (formData.get("aiModel") as string) || null,
    systemPrompt: (formData.get("systemPrompt") as string) || null,
  };

  // Only update API key if a new one was provided (not the masked value)
  if (aiApiKey && !aiApiKey.includes("••••")) {
    updateData.aiApiKey = aiApiKey;
  }

  await updateChatSettings(session.shop, updateData);

  return { ok: true };
};

export default function ChatSettingsPage() {
  const { settings, hasApiKey } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [welcomeMessage, setWelcomeMessage] = useState(settings.welcomeMessage);
  const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
  const [aiProvider, setAiProvider] = useState(settings.aiProvider);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(settings.aiModel || "");
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt || "");

  const isSubmitting = fetcher.state !== "idle";
  const models = MODEL_OPTIONS[aiProvider] || MODEL_OPTIONS.claude;

  // Reset model when provider changes
  useEffect(() => {
    const providerModels = MODEL_OPTIONS[aiProvider];
    if (providerModels && !providerModels.some((m) => m.value === aiModel)) {
      setAiModel(providerModels[0].value);
    }
  }, [aiProvider, aiModel]);

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      shopify.toast.show("Chat settings saved");
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const handleSubmit = useCallback(() => {
    fetcher.submit(
      {
        welcomeMessage,
        aiEnabled: String(aiEnabled),
        aiProvider,
        aiApiKey,
        aiModel,
        systemPrompt,
      },
      { method: "POST" },
    );
  }, [fetcher, welcomeMessage, aiEnabled, aiProvider, aiApiKey, aiModel, systemPrompt]);

  const saveBtnRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = saveBtnRef.current;
    if (!el) return;
    el.addEventListener("click", handleSubmit);
    return () => el.removeEventListener("click", handleSubmit);
  }, [handleSubmit]);

  return (
    <s-page heading="Chat Settings">
      <s-button
        ref={saveBtnRef}
        slot="primary-action"
        variant="primary"
        {...(isSubmitting ? { loading: true } : {})}
      >
        Save
      </s-button>

      <s-section heading="Chat behavior">
        <s-text-field
          label="Welcome message"
          value={welcomeMessage}
          onChange={(e: Event) =>
            setWelcomeMessage((e.currentTarget as HTMLInputElement).value)
          }
          details="Shown to customers when they open the chat widget"
        />

        <s-checkbox
          label="Enable AI auto-reply"
          checked={aiEnabled}
          onChange={(e: Event) =>
            setAiEnabled((e.currentTarget as HTMLInputElement).checked)
          }
        />
      </s-section>

      {aiEnabled && (
        <s-section heading="AI provider">
          <s-select
            label="Provider"
            value={aiProvider}
            onChange={(e: Event) =>
              setAiProvider((e.currentTarget as HTMLSelectElement).value)
            }
          >
            {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
              <s-option key={value} value={value}>
                {label}
              </s-option>
            ))}
          </s-select>

          <s-text-field
            label="API Key"
            type="password"
            value={aiApiKey}
            placeholder={hasApiKey ? settings.aiApiKey : "Paste your API key here"}
            onChange={(e: Event) =>
              setAiApiKey((e.currentTarget as HTMLInputElement).value)
            }
            details={API_KEY_HELP[aiProvider]}
          />

          <s-select
            label="Model"
            value={aiModel}
            onChange={(e: Event) =>
              setAiModel((e.currentTarget as HTMLSelectElement).value)
            }
          >
            {models.map((m) => (
              <s-option key={m.value} value={m.value}>
                {m.label}
              </s-option>
            ))}
          </s-select>

          <s-text-field
            label="Custom AI instructions"
            value={systemPrompt}
            onChange={(e: Event) =>
              setSystemPrompt((e.currentTarget as HTMLInputElement).value)
            }
            multiline={4}
            details="Tell the AI about your store's policies, tone, or specific instructions. For example: 'We offer free returns within 30 days. Our shipping takes 3-5 business days.'"
          />
        </s-section>
      )}

      <s-section slot="aside" heading="About">
        <s-paragraph>
          Configure how the chat widget behaves on your storefront. When AI is
          enabled, customers get instant responses powered by your chosen AI
          provider.
        </s-paragraph>
        <s-paragraph>
          You need to provide your own API key for the AI provider. The key is
          stored securely and only used for generating chat responses.
        </s-paragraph>
        <s-paragraph>
          You can always view and reply to conversations manually from the
          Conversations page.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
