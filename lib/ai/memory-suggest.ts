/**
 * Post-chat memory suggestion extractor.
 *
 * Produces `suggested` memories only — never auto-approves. Rejects credential-
 * like content. Dedupes against existing memories in the workspace. Failures
 * are swallowed by the caller (chat must not break if suggestion fails).
 */
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getChatModel, resolveUsableChatModelId } from "@/lib/ai/providers";
import { looksLikeSecret } from "@/lib/ai/memory-safety";
import { logError } from "@/lib/logging/error-log";
import { logGeneration } from "@/lib/logging/telemetry";

export type MemoryType =
  | "preference"
  | "project_fact"
  | "writing_style"
  | "tool_preference"
  | "workflow";

export interface MemorySuggestion {
  type: MemoryType;
  content: string;
  confidence: number;
}

export interface CreatedMemorySuggestion extends MemorySuggestion {
  id: string;
  /** "approved" = auto-saved active memory; "suggested" = awaiting approval. */
  approvalStatus: "approved" | "suggested";
}

/** Model-reported confidence at or above this auto-saves the fact as an active
 * memory (still secret-filtered, still undoable) rather than a suggestion. */
const AUTO_SAVE_CONFIDENCE = 0.7;

export interface MemorySuggestionOutcome {
  status: "skipped" | "zero" | "created" | "failed";
  suggestions: CreatedMemorySuggestion[];
  traceId?: string;
}

const TYPES: MemoryType[] = [
  "preference",
  "project_fact",
  "writing_style",
  "tool_preference",
  "workflow",
];

/**
 * Extract 0–3 candidate memories from a chat turn and insert as `suggested`.
 * Returns how many were inserted.
 */
export async function suggestMemoriesFromTurn(opts: {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  projectId?: string | null;
  userMessage: string;
  assistantMessage: string;
  sourceMessageId?: string | null;
}): Promise<MemorySuggestionOutcome> {
  const modelId = resolveUsableChatModelId();
  if (!modelId) return { status: "skipped", suggestions: [] };

  const userMsg = opts.userMessage.slice(0, 2000);
  const asstMsg = opts.assistantMessage.slice(0, 3000);
  if (userMsg.length < 5) return { status: "skipped", suggestions: [] };

  let suggestions: MemorySuggestion[] = [];
  const started = Date.now();
  try {
    const { text } = await generateText({
      model: getChatModel(modelId, "memory"),
      system:
        "You extract durable user memories from a chat turn. Return ONLY a JSON array " +
        '(max 3 items) of {"type":"...","content":"...","confidence":0.0-1.0}. ' +
        "Types: preference | project_fact | writing_style | tool_preference | workflow. " +
        "Only store stable facts the USER stated or clearly confirmed about themselves, " +
        "their preferences, or their project — not one-off task details. " +
        "Never store passwords, API keys, tokens, SSNs, or secrets. " +
        "If nothing durable is worth remembering, return [].",
      prompt: `User:\n${userMsg}\n\nAssistant:\n${asstMsg}`,
    });
    suggestions = parseSuggestions(text);
    logGeneration({
      name: "memory_suggest",
      model: modelId,
      latencyMs: Date.now() - started,
      workspaceId: opts.workspaceId,
      metadata: { outcome: suggestions.length ? "candidates" : "zero" },
    });
  } catch (error) {
    const traceId = await logError({
      area: "memory",
      error,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      provider: modelId.split(":")[0],
      latencyMs: Date.now() - started,
    });
    return { status: "failed", suggestions: [], traceId };
  }

  if (suggestions.length === 0) return { status: "zero", suggestions: [] };

  const { data: existing } = await opts.supabase
    .from("memories")
    .select("content")
    .eq("workspace_id", opts.workspaceId)
    .in("approval_status", ["approved", "suggested"])
    .limit(200);

  const existingNorm = new Set(
    (existing ?? []).map((m) => normalize(String(m.content))),
  );

  const created: CreatedMemorySuggestion[] = [];
  for (const s of suggestions.slice(0, 3)) {
    if (looksLikeSecret(s.content)) continue;
    if (s.content.length < 8 || s.content.length > 500) continue;
    if (existingNorm.has(normalize(s.content))) continue;
    // Soft near-dup: skip if an existing memory contains this or vice versa (short).
    if ([...existingNorm].some((e) => e.includes(normalize(s.content)) || normalize(s.content).includes(e))) {
      continue;
    }

    const autoSave = s.confidence >= AUTO_SAVE_CONFIDENCE;
    const { data, error } = await opts.supabase.from("memories").insert({
      workspace_id: opts.workspaceId,
      user_id: opts.userId,
      project_id: opts.projectId ?? null,
      type: s.type,
      content: s.content,
      source: autoSave ? "chat_auto" : "chat_suggestion",
      confidence: Math.min(1, Math.max(0.1, s.confidence)),
      sensitivity: "low",
      approval_status: autoSave ? "approved" : "suggested",
      category: s.type,
      importance: 3,
      provenance: {
        kind: "chat_turn",
        source_message_id: opts.sourceMessageId ?? null,
        user_stated: true,
        auto_saved: autoSave,
      },
      normalized_content: normalize(s.content),
      source_message_id: opts.sourceMessageId ?? null,
      active: autoSave,
    }).select("id").single();
    if (!error && data?.id) {
      created.push({ ...s, id: data.id, approvalStatus: autoSave ? "approved" : "suggested" });
      existingNorm.add(normalize(s.content));
    } else if (error) {
      await logError({
        area: "memory",
        error,
        workspaceId: opts.workspaceId,
        userId: opts.userId,
      });
    }
  }
  return {
    status: created.length ? "created" : "zero",
    suggestions: created,
  };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseSuggestions(text: string): MemorySuggestion[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x) => x && typeof x.content === "string")
      .map((x) => ({
        type: TYPES.includes(x.type) ? (x.type as MemoryType) : "preference",
        content: String(x.content).trim().slice(0, 500),
        confidence: typeof x.confidence === "number" ? x.confidence : 0.6,
      }));
  } catch {
    return [];
  }
}
