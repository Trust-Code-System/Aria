import type { SupabaseClient } from "@supabase/supabase-js";

export function shouldSearchChatHistory(message: string): boolean {
  return /\b(earlier|previous(?:ly)?|last time|before|we discussed|i decided|did i decide|what did i|prior conversation|past chat)\b/i.test(
    message,
  );
}
function searchTerms(message: string): string {
  return (
    message
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g)
      ?.filter((word) => !["what", "when", "where", "earlier", "previous", "about", "decide", "decided"].includes(word))
      .slice(0, 8)
      .join(" ") ?? ""
  );
}

/** Bounded, RLS-scoped recall from prior completed conversation messages. */
export async function searchChatHistory(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  currentConversationId: string;
  message: string;
  enabled: boolean;
}): Promise<string | null> {
  if (!params.enabled || !shouldSearchChatHistory(params.message)) return null;
  const terms = searchTerms(params.message);
  if (!terms) return null;

  let result = await params.supabase
    .from("messages")
    .select("content, conversation_id, created_at, conversations(title)")
    .eq("workspace_id", params.workspaceId)
    .eq("status", "completed")
    .neq("conversation_id", params.currentConversationId)
    .textSearch("content", terms, { config: "simple", type: "websearch" })
    .order("created_at", { ascending: false })
    .limit(6);

  if (result.error) {
    const first = terms.split(" ")[0];
    result = await params.supabase
      .from("messages")
      .select("content, conversation_id, created_at, conversations(title)")
      .eq("workspace_id", params.workspaceId)
      .neq("conversation_id", params.currentConversationId)
      .ilike("content", `%${first}%`)
      .order("created_at", { ascending: false })
      .limit(6);
  }
  if (result.error || !result.data?.length) return null;

  return result.data
    .map((row, index) => {
      const relation = row.conversations as unknown;
      const title =
        relation && typeof relation === "object" && "title" in relation
          ? String((relation as { title?: unknown }).title ?? "Prior conversation")
          : "Prior conversation";
      const excerpt = String(row.content ?? "").replace(/\s+/g, " ").trim().slice(0, 700);
      return `[History ${index + 1}: ${title}] ${excerpt}`;
    })
    .join("\n");
}
