import type { SupabaseClient } from "@supabase/supabase-js";

type MemoryRow = {
  id?: string;
  content: string;
  project_id: string | null;
  type: string;
  confidence?: number | null;
  importance?: number | null;
  updated_at?: string | null;
  expires_at?: string | null;
  active?: boolean | null;
  superseded_by?: string | null;
};

const words = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g)
      ?.filter((word) => !["the", "and", "that", "this", "with", "from", "have"].includes(word)) ?? [],
  );

function scoreMemory(row: MemoryRow, query: string, projectId: string | null): number {
  const queryWords = words(query);
  const memoryWords = words(row.content);
  let overlap = 0;
  for (const word of queryWords) if (memoryWords.has(word)) overlap += 1;
  const importance = Math.max(1, Math.min(5, Number(row.importance ?? 3)));
  const confidence = Math.max(0, Math.min(1, Number(row.confidence ?? 1)));
  const projectBoost = row.project_id && row.project_id === projectId ? 12 : 0;
  const instructionBoost = ["preference", "writing_style", "tool_preference", "workflow"].includes(row.type)
    ? 8
    : 0;
  const ageDays = row.updated_at
    ? Math.max(0, (Date.now() - Date.parse(row.updated_at)) / 86_400_000)
    : 365;
  const recency = Math.max(0, 6 - Math.log2(ageDays + 1));
  return overlap * 14 + importance * 5 + confidence * 8 + projectBoost + instructionBoost + recency;
}

/**
 * Retrieve a small relevance-ranked set of active approved memories. The query
 * falls back to the legacy columns when migration 0014 is not yet applied.
 */
export async function getContextMemories(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId?: string | null,
  query = "",
): Promise<string[]> {
  const scopedProject = projectId ?? null;
  const currentResult = await supabase
    .from("memories")
    .select(
      "id, content, project_id, type, confidence, importance, updated_at, expires_at, active, superseded_by",
    )
    .eq("workspace_id", workspaceId)
    .eq("approval_status", "approved")
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(80);

  const result = currentResult.error
    ? await supabase
      .from("memories")
      .select("id, content, project_id, type, confidence, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("approval_status", "approved")
      .order("updated_at", { ascending: false })
      .limit(60)
    : currentResult;
  if (result.error || !result.data) return [];

  const now = Date.now();
  const rows = (result.data as MemoryRow[])
    .filter((row) => row.project_id === null || row.project_id === scopedProject)
    .filter((row) => row.active !== false && !row.superseded_by)
    .filter((row) => !row.expires_at || Date.parse(row.expires_at) > now)
    .sort((a, b) => scoreMemory(b, query, scopedProject) - scoreMemory(a, query, scopedProject))
    .slice(0, 12);

  const ids = rows.map((row) => row.id).filter((id): id is string => Boolean(id));
  if (ids.length) {
    void supabase
      .from("memories")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", ids);
  }
  return rows.map((row) => row.content);
}
