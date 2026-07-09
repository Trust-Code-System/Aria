import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch approved memories to inject into chat context. Returns short strings.
 * Global (project_id null) + the active project's memories are included.
 * Only 'approved' status is used — 'suggested' memories require user approval
 * and 'disabled' are ignored.
 */
export async function getContextMemories(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId?: string | null,
): Promise<string[]> {
  let query = supabase
    .from("memories")
    .select("content, project_id, type")
    .eq("workspace_id", workspaceId)
    .eq("approval_status", "approved")
    .order("updated_at", { ascending: false })
    .limit(40);

  const { data, error } = await query;
  if (error || !data) return [];

  return data
    .filter((m) => m.project_id === null || m.project_id === projectId)
    .map((m) => m.content as string)
    .slice(0, 25);
}
