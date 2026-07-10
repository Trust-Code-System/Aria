/**
 * Task-aware model routing with fallbacks.
 *
 * Picks a usable model by mode/complexity, then falls back across providers
 * when the preferred key is missing. Budgets are soft guards (logged via
 * estimate only) — hard token caps belong at the provider/gateway layer later.
 */
import {
  LATEST_CHAT_MODELS,
  availableProviders,
  parseModelId,
  resolveUsableChatModelId,
  upgradeRetiredModelId,
  type ProviderName,
} from "@/lib/ai/providers";
import type { ChatMode } from "@/lib/ai/prompts";

export type RouteComplexity = "low" | "medium" | "high";

export interface RouteInput {
  mode: ChatMode;
  message: string;
  preferred?: string;
}

/** Rough complexity heuristic — no LLM call. */
export function estimateComplexity(mode: ChatMode, message: string): RouteComplexity {
  if (mode === "code" || mode === "report" || mode === "research") return "high";
  if (mode === "knowledge" || mode === "improve") return "medium";
  if (message.length > 4000) return "high";
  if (message.length > 800) return "medium";
  return "low";
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

/**
 * Resolve a chat model id for this turn. Always returns a configured provider
 * when any LLM key exists; otherwise null.
 */
export function resolveRoutedChatModelId(input: RouteInput): string | null {
  const complexity = estimateComplexity(input.mode, input.message);
  const avail = availableProviders();

  // Honor explicit preferred if its provider is available.
  if (input.preferred) {
    const upgraded = upgradeRetiredModelId(input.preferred);
    const { provider } = parseModelId(upgraded);
    if (avail[provider]) return upgraded;
  }

  // Default env model via existing resolver (already upgrades retired ids).
  const fallbackDefault = resolveUsableChatModelId(input.preferred);
  if (fallbackDefault && complexity !== "high") {
    // For low/medium, prefer cheaper providers when default is expensive.
    if (complexity === "low") {
      for (const p of preferredProviders("low")) {
        if (avail[p]) {
          const id = modelForProvider(p);
          if (id) return id;
        }
      }
    }
    return fallbackDefault;
  }

  for (const p of preferredProviders(complexity)) {
    if (!avail[p]) continue;
    const id = modelForProvider(p);
    if (id) return id;
  }

  return fallbackDefault;
}

/** Soft budget estimate in "units" for admin/cost awareness (not billed). */
export function estimateTurnBudgetUnits(mode: ChatMode, message: string): number {
  const c = estimateComplexity(mode, message);
  const base = c === "high" ? 3 : c === "medium" ? 2 : 1;
  return base + Math.floor(message.length / 2000);
}
