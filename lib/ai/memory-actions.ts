import type { SupabaseClient } from "@supabase/supabase-js";

import type { ExplicitMemoryCommand } from "@/lib/ai/memory-commands";
import { looksLikeSecret } from "@/lib/ai/memory-safety";
import { AppError } from "@/lib/errors";
import { getContextMemories } from "@/lib/ai/memory";
import { getCoreProfile, renderCoreProfile } from "@/lib/ai/core-profile";
import { suggestMemoriesFromTurn } from "@/lib/ai/memory-suggest";
import type { ChatStreamEvent } from "@/lib/chat/stream-protocol";

const normalizeMemory = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

function memoryType(content: string): string {
  if (/\b(writing|tone|style|detailed|concise|beginner-readable)\b/i.test(content)) return "writing_style";
  if (/\b(codex|grok|claude|chatgpt|tool|model)\b/i.test(content)) return "tool_preference";
  if (/\b(company|business|project|role|works? at|development company)\b/i.test(content)) return "project_fact";
  return "preference";
}

function profilePatch(content: string): Record<string, unknown> {
  const patterns: Array<[string, RegExp]> = [
    ["preferred_name", /^(?:my name is|call me)\s+(.+)$/i],
    ["company", /^(?:my company is|.+ is my (?:development )?company)\s*(.*)$/i],
    ["role_title", /^my role is\s+(.+)$/i],
    ["signature", /^my signature is\s+(.+)$/i],
    ["timezone", /^my timezone is\s+(.+)$/i],
  ];
  for (const [field, pattern] of patterns) {
    const match = content.match(pattern);
    if (match) {
      const value = (match[1] || content.split(/\s+is\s+/i)[0]).trim();
      if (value) return { [field]: value };
    }
  }
  return {};
}

export async function executeExplicitMemoryCommand(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  projectId: string | null;
  sourceMessageId: string;
  command: ExplicitMemoryCommand;
  userMessage: string;
  attachmentText?: string;
}): Promise<{ text: string; events: ChatStreamEvent[] }> {
  const { command } = params;
  if (command.kind === "recall") {
    const [profile, memories] = await Promise.all([
      getCoreProfile(params.supabase, params.userId),
      getContextMemories(params.supabase, params.workspaceId, params.projectId, params.userMessage),
    ]);
    const renderedProfile = renderCoreProfile(profile);
    const sections = [
      renderedProfile ? `Core profile:\n${renderedProfile}` : null,
      memories.length ? `Approved memories:\n${memories.map((item) => `- ${item}`).join("\n")}` : null,
    ].filter(Boolean);
    return {
      text: sections.length ? sections.join("\n\n") : "I do not have any approved memories about you yet.",
      events: [],
    };
  }

  if (command.kind === "extract_attachment") {
    const source = `${params.userMessage}\n\n${params.attachmentText ?? ""}`.slice(0, 12_000);
    const outcome = await suggestMemoriesFromTurn({
      supabase: params.supabase,
      workspaceId: params.workspaceId,
      userId: params.userId,
      projectId: params.projectId,
      userMessage: source,
      assistantMessage: "",
      sourceMessageId: params.sourceMessageId,
    });
    const events: ChatStreamEvent[] = outcome.suggestions.map((suggestion) => ({
      type: "memory_suggestion",
      memoryId: suggestion.id,
      content: suggestion.content,
      memoryType: suggestion.type,
    }));
    if (outcome.status === "failed") {
      return {
        text: `I could not extract memory suggestions from the attachment. Nothing was saved. Trace ID: ${outcome.traceId ?? "unavailable"}.`,
        events,
      };
    }
    return {
      text: outcome.suggestions.length
        ? `I extracted ${outcome.suggestions.length} durable memory suggestion${outcome.suggestions.length === 1 ? "" : "s"}. Review each one below before it becomes active.`
        : "I did not find durable personal facts worth saving from that attachment. Nothing was saved.",
      events,
    };
  }

  if (command.kind === "forget") {
    const query = command.query.replace(/[%_]/g, "").trim();
    if (!query) {
      throw new AppError({ area: "memory", category: "validation", userMessage: "Tell me which memory to forget." });
    }
    const { data, error } = await params.supabase
      .from("memories")
      .select("id, content")
      .eq("workspace_id", params.workspaceId)
      .eq("active", true)
      .ilike("content", `%${query}%`)
      .limit(20);
    if (error) {
      throw new AppError({ area: "memory", category: "internal", userMessage: "I could not search memory.", internal: error });
    }
    const ids = (data ?? []).map((row) => row.id);
    if (!ids.length) return { text: `I could not find an active memory matching “${command.query}”.`, events: [] };
    const { error: updateError } = await params.supabase
      .from("memories")
      .update({ active: false, approval_status: "disabled" })
      .in("id", ids)
      .eq("workspace_id", params.workspaceId);
    if (updateError) {
      throw new AppError({ area: "memory", category: "internal", userMessage: "I could not disable that memory.", internal: updateError });
    }
    return {
      text: `Forgot ${ids.length} matching memor${ids.length === 1 ? "y" : "ies"}.`,
      events: [],
    };
  }

  const content = command.content.trim();
  if (looksLikeSecret(content)) {
    throw new AppError({
      area: "memory",
      category: "validation",
      userMessage: "That looks like a password, token, key, or credential, so I did not save it.",
    });
  }
  const normalized = normalizeMemory(content);
  const type = memoryType(content);
  const { data: existing } = await params.supabase
    .from("memories")
    .select("id, content, type, approval_status, active")
    .eq("workspace_id", params.workspaceId)
    .eq("normalized_content", normalized)
    .in("approval_status", ["approved", "suggested"])
    .limit(1)
    .maybeSingle();
  if (existing) {
    await params.supabase
      .from("memories")
      .update({ type, category: type, approval_status: "approved", active: true })
      .eq("id", existing.id)
      .eq("workspace_id", params.workspaceId);
    const duplicateProfilePatch = profilePatch(content);
    if (Object.keys(duplicateProfilePatch).length) {
      await params.supabase.from("profiles").update(duplicateProfilePatch).eq("id", params.userId);
    }
    return {
      text: `Already saved in memory: “${existing.content}”.`,
      events: [{ type: "memory_saved", memoryId: existing.id, content: existing.content }],
    };
  }

  const { data: inserted, error } = await params.supabase
    .from("memories")
    .insert({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      project_id: params.projectId,
      type,
      category: type,
      content,
      normalized_content: normalized,
      source: "explicit_chat_command",
      source_message_id: params.sourceMessageId,
      provenance: { kind: "explicit_user_command", source_message_id: params.sourceMessageId },
      confidence: 1,
      importance: 4,
      sensitivity: "low",
      approval_status: "approved",
      active: true,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    throw new AppError({ area: "memory", category: "internal", userMessage: "I could not save that memory.", internal: error });
  }

  if (command.update) {
    const { data: superseded } = await params.supabase
      .from("memories")
      .select("id")
      .eq("workspace_id", params.workspaceId)
      .eq("type", type)
      .eq("active", true)
      .neq("id", inserted.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (superseded) {
      await params.supabase
        .from("memories")
        .update({ active: false, approval_status: "disabled", superseded_by: inserted.id })
        .eq("id", superseded.id)
        .eq("workspace_id", params.workspaceId);
    }
  }

  const patch = profilePatch(content);
  if (Object.keys(patch).length) {
    await params.supabase.from("profiles").update(patch).eq("id", params.userId);
  }

  return {
    text: `Saved to memory: “${content}”. You can undo this below.`,
    events: [{ type: "memory_saved", memoryId: inserted.id, content }],
  };
}
