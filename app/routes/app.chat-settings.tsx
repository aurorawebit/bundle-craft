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
import { syncAll, getSyncStatus } from "../services/store-sync.server";

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
  const [settings, syncStatus] = await Promise.all([
    getChatSettings(session.shop),
    getSyncStatus(session.shop),
  ]);
  const maskedKey = settings.aiApiKey
    ? settings.aiApiKey.slice(0, 8) + "••••••••" + settings.aiApiKey.slice(-4)
    : "";
  return {
    settings: { ...settings, aiApiKey: maskedKey },
    hasApiKey: !!settings.aiApiKey,
    syncStatus,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "sync") {
    const result = await syncAll(session.shop, admin);
    return {
      ok: true,
      synced: true,
      productCount: result.productCount,
      pageCount: result.pageCount,
    };
  }

  const aiApiKey = formData.get("aiApiKey") as string;
  const updateData: Parameters<typeof updateChatSettings>[1] = {
    welcomeMessage: (formData.get("welcomeMessage") as string) || undefined,
    aiEnabled: formData.get("aiEnabled") === "true",
    aiProvider: (formData.get("aiProvider") as string) || "claude",
    aiModel: (formData.get("aiModel") as string) || null,
    systemPrompt: (formData.get("systemPrompt") as string) || null,
  };

  if (aiApiKey && !aiApiKey.includes("••••")) {
    updateData.aiApiKey = aiApiKey;
  }

  await updateChatSettings(session.shop, updateData);

  return { ok: true };
};

export default function ChatSettingsPage() {
  const { settings, hasApiKey, syncStatus } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const syncFetcher = useFetcher();
  const shopify = useAppBridge();

  const [welcomeMessage, setWelcomeMessage] = useState(settings.welcomeMessage);
  const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
  const [aiProvider, setAiProvider] = useState(settings.aiProvider);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(settings.aiModel || "");
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt || "");

  const isSubmitting = fetcher.state !== "idle";
  const isSyncing = syncFetcher.state !== "idle";
  const models = MODEL_OPTIONS[aiProvider] || MODEL_OPTIONS.claude;

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

  useEffect(() => {
    const data = syncFetcher.data as {
      synced?: boolean;
      productCount?: number;
      pageCount?: number;
    } | undefined;
    if (data?.synced && syncFetcher.state === "idle") {
      shopify.toast.show(
        `Synced ${data.productCount} products and ${data.pageCount} pages`,
      );
    }
  }, [syncFetcher.data, syncFetcher.state, shopify]);

  const handleSubmit = useCallback(() => {
    fetcher.submit(
      {
        intent: "save",
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

  const handleSync = useCallback(() => {
    syncFetcher.submit({ intent: "sync" }, { method: "POST" });
  }, [syncFetcher]);

  const saveBtnRef = useRef<HTMLElement>(null);
  const syncBtnRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = saveBtnRef.current;
    if (!el) return;
    el.addEventListener("click", handleSubmit);
    return () => el.removeEventListener("click", handleSubmit);
  }, [handleSubmit]);

  useEffect(() => {
    const el = syncBtnRef.current;
    if (!el) return;
    el.addEventListener("click", handleSync);
    return () => el.removeEventListener("click", handleSync);
  }, [handleSync]);

  const lastSyncedText = syncStatus.lastSynced
    ? `Last synced: ${new Date(syncStatus.lastSynced).toLocaleString()}`
    : "Never synced";

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

      <s-section heading="Store knowledge">
        <s-paragraph>
          Sync your store's products and pages so the AI chatbot can answer
          questions about your products, recommend items, and provide store
          information (address, contact, policies, etc.).
        </s-paragraph>
        <s-box paddingBlockStart="200">
          <s-inline gap="400" blockAlign="center">
            <s-text variant="bodySm" tone="subdued">
              {syncStatus.productCount} products, {syncStatus.pageCount} pages
              cached
              <br />
              {lastSyncedText}
            </s-text>
            <s-button
              ref={syncBtnRef}
              {...(isSyncing ? { loading: true } : {})}
            >
              Sync now
            </s-button>
          </s-inline>
        </s-box>
      </s-section>

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
          The AI chatbot uses your synced store data to answer customer
          questions, recommend products with links, and provide store
          information like addresses and contact details.
        </s-paragraph>
        <s-paragraph>
          Click "Sync now" whenever you update products or pages. The chatbot
          will use the latest synced data.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
