/**
 * Fast request intent classification — deterministic, no LLM.
 * Used before expensive retrieval / connector loading.
 */

import { looksLikeDurablePersonalStatement, recognizeMemoryCommand } from "@/lib/ai/memory-commands";

export type ChatIntent =
  | "instant"
  | "simple_generation"
  | "personal_context"
  | "knowledge"
  | "research"
  | "action"
  | "complex_reasoning";

const INSTANT_RE =
  /^(hi|hello|hey|yo|sup|thanks|thank you|thx|ok|okay|k|sure|yes|yep|yeah|no|nope|cool|great|good morning|good afternoon|good evening|gm|who are you\??|what can you do\??|help)$/i;

const ACTION_RE =
  /\b(send|email|mail|draft|schedule|calendar|invite|post|slack|notion|github|create (an? )?(event|issue|page|task)|forward|reply to)\b/i;

const RESEARCH_RE = /\b(research|look up|search the web|latest|current events|competitors?)\b/i;

const PERSONAL_RE =
  /\b(my name|my email|my company|my (preferred )?style|my signature|what did i|remember|about me)\b/i;

export interface IntentInput {
  mode: string;
  message: string;
  hasAttachments?: boolean;
}

export function classifyChatIntent(input: IntentInput): ChatIntent {
  const text = input.message.trim();
  if (input.mode === "knowledge") return "knowledge";
  if (input.mode === "research") return "research";
  if (input.mode === "code" || input.mode === "report") return "complex_reasoning";
  if (input.hasAttachments && recognizeMemoryCommand(text, true)) return "personal_context";
  if (input.hasAttachments) return "simple_generation";

  if (text.length <= 80 && INSTANT_RE.test(text)) return "instant";
  if (recognizeMemoryCommand(text)) return "personal_context";
  if (ACTION_RE.test(text)) return "action";
  if (RESEARCH_RE.test(text) && input.mode === "general") return "research";
  if (PERSONAL_RE.test(text)) return "personal_context";
  if (text.length < 400 && input.mode === "improve") return "simple_generation";
  if (text.length < 280) return "simple_generation";
  return "complex_reasoning";
}

/** Whether this intent should load connector tools into the model call. */
export function intentNeedsTools(intent: ChatIntent): boolean {
  return intent === "action";
}

/** Whether this intent should load approved memories. */
export function intentNeedsMemories(intent: ChatIntent): boolean {
  return intent !== "instant";
}

/** Whether post-turn memory suggestion should run. */
export function intentNeedsMemorySuggest(
  intent: ChatIntent,
  message = "",
  hasAttachments = false,
): boolean {
  if (intent === "instant") return false;
  if (recognizeMemoryCommand(message, hasAttachments)) return false;
  if (intent === "personal_context") return true;
  if (intent === "simple_generation") return looksLikeDurablePersonalStatement(message);
  return true;
}
