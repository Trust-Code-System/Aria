import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabase } from "@/lib/supabase/server";
import { configured } from "@/lib/env";
import { isUsableConnectionStatus } from "@/lib/connectors/status";

/**
 * Resolve the workspace's usable connection for a provider. Uses the caller's
 * RLS-scoped client, so it can only ever see the caller's own workspace rows.
 * Returns null when connectors are unconfigured or the app isn't connected —
 * callers must degrade honestly (clear "connect it first" message), never fake.
 *
 * "Usable" means status is connected (or legacy `active`), not merely that a
 * row exists.
 */
export async function getActiveConnection(
  workspaceId: string,
  provider: string,
  supabase?: SupabaseClient,
): Promise<{
  entityId: string;
  connectedAccountId?: string;
  status?: string | null;
  lastValidatedAt?: string | null;
} | null> {
  if (!configured.connectors) return null;
  const client = supabase ?? createServerSupabase();
  const { data } = await client
    .from("connections")
    .select("status, composio_entity_id, composio_connection_id, user_id, last_validated_at")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data || !isUsableConnectionStatus(data.status)) return null;
  return {
    entityId: data.composio_entity_id ?? data.user_id,
    connectedAccountId: data.composio_connection_id ?? undefined,
    status: data.status ?? null,
    lastValidatedAt: data.last_validated_at ?? null,
  };
}
