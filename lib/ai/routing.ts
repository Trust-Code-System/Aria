/**
 * Task-aware model routing with fallbacks.
 *
 * Picks a usable model by mode/complexity/intent role, then falls back across
 * providers when the preferred key is missing.
 */
import {
  LATEST_CHAT_MODELS,
  availableProviders,
  parseModelId,
  resolveUsableChatModelId,
  upgradeRetiredModelId,
  isModelCompatible,
  type ProviderName,
} from "@/lib/ai/providers";
import type { ChatMode } from "@/lib/ai/prompts";
import type { ChatIntent } from "@/lib/orchestration/intent";
import { env } from "@/lib/env";

export type RouteComplexity = "low" | "medium" | "high";

export type ModelRole =
  | "fast"
  | "default"
  | "reasoning"
  | "research"
  | "action"
  | "coding"
  | "vision";

export interface RouteInput {
  mode: ChatMode;
  message: string;
  preferred?: string;
  intent?: ChatIntent;
  hasImages?: boolean;
}

/** Rough complexity heuristic — no LLM call. */
export function estimateComplexity(mode: ChatMode, message: string): RouteComplexity {
  if (mode === "code" || mode === "report" || mode === "research") return "high";
  if (mode === "knowledge" || mode === "improve") return "medium";
  if (message.length > 4000) return "high";
  if (message.length > 800) return "medium";
  return "low";
}

/** Map intent + mode → model role (before provider resolution). */
export function modelRoleForRoute(input: RouteInput): ModelRole {
  if (input.hasImages) return "vision";
  if (input.intent === "instant" || input.intent === "simple_generation") return "fast";
  if (input.intent === "action") return "action";
  if (input.intent === "research" || input.mode === "research") return "research";
  if (input.mode === "code" || input.intent === "complex_reasoning") return "coding";
  if (input.mode === "report") return "reasoning";
  const complexity = estimateComplexity(input.mode, input.message);
  if (complexity === "high") return "reasoning";
  if (complexity === "low") return "fast";
  return "default";
}

function envModelForRole(role: ModelRole): string | null {
  const map: Record<ModelRole, string> = {
    fast: env.fastModel,
    default: env.defaultModel || env.defaultChatModel,
    reasoning: env.reasoningModel,
    research: env.researchModelRole || env.defaultResearchModel,
    action: env.actionModel,
    coding: env.codingModel,
    vision: env.visionModel,
  };
  const id = (map[role] || "").trim();
  // Research role may be perplexity:sonar — chat path should not use that as streamText model.
  if (role === "research" && id.startsWith("perplexity:")) return "";
  return id || null;
}

/**
 * Preferred provider order by complexity. Cheap/fast for low; frontier for high.
 * Still constrained by which keys are configured.
 */
function preferredProviders(complexity: RouteComplexity): ProviderName[] {
  if (complexity === "low") return ["google", "openai", "anthropic", "custom"];
  if (complexity === "medium") return ["openai", "google", "anthropic", "custom"];
  return ["anthropic", "openai", "google", "custom"];
}

function modelForProvider(provider: ProviderName): string | null {
  switch (provider) {
    case "openai":
      return LATEST_CHAT_MODELS.openai;
    case "google":
      return LATEST_CHAT_MODELS.google;
    case "anthropic":
      return LATEST_CHAT_MODELS.anthropic;
    case "custom":
      return "custom:llama3.2";
    default:
      return null;
  }
}

function providerAvailableForId(id: string): boolean {
  const { provider } = parseModelId(id);
  const avail = availableProviders();
  return Boolean(avail[provider]);
}

function modelCompatibleForRole(id: string, role: ModelRole): boolean {
  return isModelCompatible(id, {
    streaming: true,
    tools: role === "action",
    images: role === "vision",
    structuredOutput: false,
  });
}

/**
 * Resolve a chat model id for this turn. Always returns a configured provider
 * when any LLM key exists; otherwise null.
 */
export function resolveRoutedChatModelId(input: RouteInput): string | null {
  const role = modelRoleForRoute(input);
  const complexity =
    role === "fast"
      ? "low"
      : role === "reasoning" || role === "coding" || role === "research"
        ? "high"
        : estimateComplexity(input.mode, input.message);
  const avail = availableProviders();

  // Role env override (FAST_MODEL, ACTION_MODEL, …)
  const roleModel = envModelForRole(role);
  if (roleModel) {
    const upgraded = upgradeRetiredModelId(roleModel);
    if (providerAvailableForId(upgraded) && modelCompatibleForRole(upgraded, role)) return upgraded;
  }

  // Action (connected-app) turns run a multi-step tool loop. Prefer Anthropic:
  // Claude handles the AI SDK v3 tool loop reliably, Gemini cannot (it 400s on a
  // missing thought_signature at round 2), and OpenAI may be quota-blocked. Only
  // fall back to other tool-capable providers if Anthropic is unavailable.
  if (role === "action") {
    if (avail.anthropic && modelCompatibleForRole(LATEST_CHAT_MODELS.anthropic, role)) {
      return LATEST_CHAT_MODELS.anthropic;
    }
    const fast = (env.fastModel || "").trim();
    if (fast && providerAvailableForId(fast) && modelCompatibleForRole(fast, role)) return upgradeRetiredModelId(fast);
    if (avail.openai && modelCompatibleForRole(LATEST_CHAT_MODELS.openai, role)) return LATEST_CHAT_MODELS.openai;
    if (avail.google && modelCompatibleForRole(LATEST_CHAT_MODELS.google, role)) return LATEST_CHAT_MODELS.google;
  }

  // Honor explicit preferred if its provider is available.
  if (input.preferred) {
    const upgraded = upgradeRetiredModelId(input.preferred);
    const { provider } = parseModelId(upgraded);
    // Skip preferred OpenAI for action when we already tried role/fast above —
    // still allow preferred for other roles.
    if (avail[provider] && modelCompatibleForRole(upgraded, role)) return upgraded;
  }

  const fallbackDefault = resolveUsableChatModelId(input.preferred);
  if (fallbackDefault && complexity !== "high") {
    if (complexity === "low") {
      for (const p of preferredProviders("low")) {
        if (avail[p]) {
          const id = modelForProvider(p);
          if (id && modelCompatibleForRole(id, role)) return id;
        }
      }
    }
    return fallbackDefault && modelCompatibleForRole(fallbackDefault, role) ? fallbackDefault : null;
  }

  for (const p of preferredProviders(complexity)) {
    if (!avail[p]) continue;
    const id = modelForProvider(p);
    if (id && modelCompatibleForRole(id, role)) return id;
  }

  return fallbackDefault && modelCompatibleForRole(fallbackDefault, role) ? fallbackDefault : null;
}

/** Soft budget estimate in "units" for admin/cost awareness (not billed). */
export function estimateTurnBudgetUnits(mode: ChatMode, message: string): number {
  const c = estimateComplexity(mode, message);
  const base = c === "high" ? 3 : c === "medium" ? 2 : 1;
  return base + Math.floor(message.length / 2000);
}
