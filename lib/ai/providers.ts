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
  get openai() {
    return env.openaiChatModel;
  },
  get google() {
    return env.googleChatModel;
  },
  get anthropic() {
    return env.anthropicChatModel;
  },
};

const RETIRED_MODEL_REPLACEMENTS: Record<string, string> = {
  "google:gemini-2.5-flash": LATEST_CHAT_MODELS.google,
  "openai:gpt-5.6": env.openaiChatModel,
  "anthropic:claude-3-5-sonnet-latest": env.anthropicChatModel,
};

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  images: boolean;
  structuredOutput: boolean;
  temperature: boolean;
  maxContextTokens: number;
}

export function modelCapabilities(modelId: string): ModelCapabilities {
  const { provider, model } = parseModelId(modelId);
  if (provider === "google") {
    return {
      streaming: true,
      // Gemini cannot complete the AI SDK v3 multi-step tool loop reliably: on
      // the 2nd function-call round it 400s on a missing `thought_signature`,
      // and every connected-app turn here runs multi-step (maxSteps > 1). Mark
      // Gemini non-tool-capable so action/tool turns route to Claude/OpenAI
      // instead of failing mid-loop. (Greetings/simple gen still use Gemini —
      // those never load tools.)
      tools: false,
      images: !/lite|embedding/i.test(model),
      structuredOutput: true,
      temperature: true,
      maxContextTokens: /gemini-3/i.test(model) ? 1_000_000 : 128_000,
    };
  }
  if (provider === "anthropic") {
    // All modern Claude models (3.x, 4.x, Opus 4.8, Sonnet 5, Haiku 4.5, Fable 5)
    // support tools and vision. The old /claude-(?:3|4)/ test failed on ids like
    // "claude-opus-4-8"/"claude-sonnet-5", wrongly disabling tools for them.
    const isClaude = /claude/i.test(model);
    // `temperature: false` means "does not accept a CUSTOM temperature" — Claude
    // 4.x/5.x (Opus 4.8, Sonnet 5, Haiku 4.5, Fable 5, Sonnet 4, …) use extended
    // thinking and only accept their default of 1; any other value (incl. the
    // SDK's forced 0) is rejected with "temperature is deprecated for this model"
    // (observed live on claude-opus-4-8, breaking connected-app sends). The chat
    // route passes 1 for these; only the older 3.x line accepts a custom value.
    const rejectsTemperature = /(?:opus|sonnet|haiku|fable)-[45]/i.test(model);
    return {
      streaming: true,
      tools: isClaude,
      images: isClaude,
      structuredOutput: false,
      temperature: isClaude ? !rejectsTemperature : true,
      maxContextTokens: /(?:fable-5|opus-4-8|sonnet-5)/i.test(model) ? 1_000_000 : 200_000,
    };
  }
  if (provider === "openai") {
    return {
      streaming: true,
      tools: /^(gpt-4o|gpt-4\.1|gpt-5|o[134])/i.test(model),
      images: /^(gpt-4o|gpt-4\.1|gpt-5)/i.test(model),
      structuredOutput: /^(gpt-4o|gpt-4\.1|gpt-5|o[134])/i.test(model),
      temperature: !/^(gpt-5|o[0-9])/i.test(model),
      maxContextTokens: /^(gpt-5|gpt-4\.1)/i.test(model) ? 400_000 : 128_000,
    };
  }
  return {
    streaming: true,
    tools: false,
    images: false,
    structuredOutput: false,
    temperature: true,
    maxContextTokens: 32_000,
  };
}

export function isModelCompatible(
  modelId: string,
  required: Partial<Pick<ModelCapabilities, "streaming" | "tools" | "images" | "structuredOutput">>,
): boolean {
  const caps = modelCapabilities(modelId);
  return Object.entries(required).every(([key, needed]) => !needed || caps[key as keyof ModelCapabilities] === true);
}

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
    custom: env.customApiConfigured,
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

/** Whether this model accepts a custom temperature in chat/completions. */
export function supportsTemperature(modelId: string): boolean {
  return modelCapabilities(modelId).temperature;
}

/**
 * The temperature to actually send for this model. The pinned AI SDK (ai@3.4)
 * FORCES `temperature: 0` whenever a caller omits it, but extended-thinking
 * models (Claude 4.x/5.x, GPT-5/o-series) reject any non-default value
 * ("temperature is deprecated for this model" / "does not support 0"). So we
 * must pass an explicit value: the caller's `desired` when the model accepts a
 * custom temperature, otherwise the only accepted value, 1. Every chat/agent/
 * report/memory model call must route its temperature through this.
 */
export function resolveTemperature(modelId: string, desired: number): number {
  return supportsTemperature(modelId) ? desired : 1;
}

/**
 * Ordered fallbacks when the primary model fails (rate limit, quota, etc.).
 */
export function fallbackChatModelIds(
  failedId: string,
  required: Partial<Pick<ModelCapabilities, "streaming" | "tools" | "images" | "structuredOutput">> = {},
): string[] {
  const avail = availableProviders();
  const failedProvider = parseModelId(failedId).provider;
  const out: string[] = [];
  for (const id of [
    LATEST_CHAT_MODELS.google,
    LATEST_CHAT_MODELS.openai,
    LATEST_CHAT_MODELS.anthropic,
  ]) {
    const { provider } = parseModelId(id);
    if (provider === failedProvider) continue;
    if (avail[provider] && isModelCompatible(id, required)) out.push(id);
  }
  return out;
}

