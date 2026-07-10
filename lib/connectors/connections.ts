import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabase } from "@/lib/supabase/server";
import { configured } from "@/lib/env";

/**
 * Resolve the workspace's ACTIVE connection for a provider. Uses the caller's
 * RLS-scoped client, so it can only ever see the caller's own workspace rows.
 * Returns null when connectors are unconfigured or the app isn't connected —
 * callers must degrade honestly (clear "connect it first" message), never fake.
 */
export async function getActiveConnection(
  workspaceId: string,
  provider: string,
  supabase?: SupabaseClient,
): Promise<{ entityId: string } | null> {
  if (!configured.connectors) return null;
  const client = supabase ?? createServerSupabase();
  const { data } = await client
    .from("connections")
    .select("status, composio_entity_id, user_id")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return { entityId: data.composio_entity_id ?? data.user_id };
}
