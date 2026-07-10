import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { env, configured } from "@/lib/env";
import { configMissing, type FeatureArea } from "@/lib/errors";

/**
 * Provider-agnostic model resolver. A model id is "<provider>:<model>".
 * Adding a provider = one case here. No provider is hard-coded elsewhere.
 */
export type ProviderName = "openai" | "anthropic" | "google" | "perplexity" | "custom";

/** Current production-ready chat models, centralized to avoid stale fallbacks. */
export const LATEST_CHAT_MODELS = {
  openai: "openai:gpt-5.6",
  google: "google:gemini-3.5-flash",
  anthropic: "anthropic:claude-opus-4-8",
} as const;

const RETIRED_MODEL_REPLACEMENTS: Record<string, string> = {
  "google:gemini-2.5-flash": LATEST_CHAT_MODELS.google,
  "openai:gpt-4o-mini": LATEST_CHAT_MODELS.openai,
  "anthropic:claude-3-5-sonnet-latest": LATEST_CHAT_MODELS.anthropic,
};

export function parseModelId(id: string): { provider: ProviderName; model: string } {
  const [provider, ...rest] = id.split(":");
  const model = rest.join(":");
  if (!provider || !model) {
    // Fall back to treating the whole string as an OpenAI model.
    return { provider: "openai", model: id };
  }
  return { provider: provider as ProviderName, model };
}

/** Translate known retired provider identifiers before issuing a request. */
export function upgradeRetiredModelId(id: string): string {
  return RETIRED_MODEL_REPLACEMENTS[id] ?? id;
}

/** Which providers currently have a usable key. Powers the settings UI. */
export function availableProviders(): Record<ProviderName, boolean> {
  return {
    openai: Boolean(env.openaiKey),
    anthropic: Boolean(env.anthropicKey),
    google: Boolean(env.googleKey),
    perplexity: Boolean(env.perplexityKey),
    custom: true, // Always available (local endpoint or VPS)
  };
}

/**
 * Resolve a chat/completion LanguageModel for the Vercel AI SDK.
 * Throws a friendly AppError if the required key is missing.
 */
export function getChatModel(modelId?: string, area: FeatureArea = "chat"): LanguageModel {
  const id = modelId || env.defaultChatModel;
  const { provider, model } = parseModelId(id);

  switch (provider) {
    case "openai": {
      if (!env.openaiKey) throw configMissing(area, "OpenAI");
      return createOpenAI({ apiKey: env.openaiKey })(model);
    }
    case "anthropic": {
      if (!env.anthropicKey) throw configMissing(area, "Anthropic");
      return createAnthropic({ apiKey: env.anthropicKey })(model);
    }
    case "google": {
      if (!env.googleKey) throw configMissing(area, "Google Generative AI");
      return createGoogleGenerativeAI({ apiKey: env.googleKey })(model);
    }
    case "custom": {
      // Custom Open-Source model running on Ollama, vLLM, etc.
      // We assume it's OpenAI-compatible and don't enforce an API key (as local servers often don't need one)
      return createOpenAI({
        apiKey: env.openaiKey || "custom-local",
        baseURL: env.customApiUrl,
      })(model);
    }
    case "perplexity": {
      // Perplexity exposes an OpenAI-compatible endpoint.
      if (!env.perplexityKey) throw configMissing(area, "Perplexity");
      return createOpenAI({
        apiKey: env.perplexityKey,
        baseURL: "https://api.perplexity.ai",
      })(model);
    }
    default:
      throw configMissing(area, provider);
  }
}

/** Pick the best available chat model if the default's key is missing. */
export function resolveUsableChatModelId(preferred?: string): string | null {
  const configuredId = preferred || env.defaultChatModel;
  // Existing .env.local files can keep a retired default. Upgrade the known
  // identifiers at runtime so a deploy does not need a manual env change.
  const id = upgradeRetiredModelId(configuredId);
  const { provider } = parseModelId(id);
  const avail = availableProviders();
  if (avail[provider]) return id;

  if (avail.openai) return LATEST_CHAT_MODELS.openai;
  if (avail.google) return LATEST_CHAT_MODELS.google;
  if (avail.anthropic) return LATEST_CHAT_MODELS.anthropic;
  return null;
}

export { configured };
