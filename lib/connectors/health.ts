import type { SupabaseClient } from "@supabase/supabase-js";

import { getConnectionStatus } from "@/lib/connectors/composio";
import {
  isUsableConnectionStatus,
  persistableConnectionStatus,
  statusDetailForStorage,
  type ConnectionStatus,
} from "@/lib/connectors/status";
import { sanitizeForLog } from "@/lib/security/sanitize";

/**
 * How long a live Composio validation is trusted before a chat turn re-checks
 * it. Short enough to catch a revoked/expired token mid-session, long enough
 * that back-to-back action turns don't each pay a Composio round-trip.
 */
export const CONNECTION_FRESHNESS_MS = 10 * 60_000;

/** Pure: does this connection need a live re-check before we expose its tools? */
export function needsRevalidation(
  lastValidatedAt: string | null | undefined,
  now: number = Date.now(),
  freshnessMs: number = CONNECTION_FRESHNESS_MS,
): boolean {
  if (!lastValidatedAt) return true;
  const ms = Date.parse(lastValidatedAt);
  if (Number.isNaN(ms)) return true;
  return now - ms >= freshnessMs;
}

export interface ConnectionHealthResult {
  /** Whether the connector may be exposed to the model this turn. */
  healthy: boolean;
  status: ConnectionStatus;
  /** True when a live probe actually ran (vs. trusting fresh cache). */
  revalidated: boolean;
}

type StatusProbe = (connectedAccountId: string) => Promise<{ status: ConnectionStatus; label?: string }>;

/**
 * Verify a connector's live health before its tools are exposed in a chat turn.
 *
 * Fail-open by design: a transient probe error never blocks a connection the DB
 * already considers usable — execution-time errors already degrade honestly
 * ("nothing was sent"). Tools are blocked only when a probe *definitively*
 * reports a non-usable status (expired/revoked/disconnected), and that
 * correction is persisted so the Connections UI reflects reality.
 */
export async function verifyConnectionHealth(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  provider: string;
  connectedAccountId?: string | null;
  dbStatus?: string | null;
  lastValidatedAt?: string | null;
  now?: number;
  probe?: StatusProbe;
}): Promise<ConnectionHealthResult> {
  const now = params.now ?? Date.now();
  const dbUsable = isUsableConnectionStatus(params.dbStatus);
  const cachedStatus = (params.dbStatus ?? "connected") as ConnectionStatus;

  // No account id to probe, or still fresh → trust the stored status.
  if (!params.connectedAccountId || !needsRevalidation(params.lastValidatedAt, now)) {
    return { healthy: dbUsable, status: cachedStatus, revalidated: false };
  }

  const probe = params.probe ?? ((id: string) => getConnectionStatus(id));
  let live: { status: ConnectionStatus; label?: string };
  try {
    live = await probe(params.connectedAccountId);
  } catch {
    // Fail-open: don't break a working connector on a transient probe failure.
    return { healthy: dbUsable, status: cachedStatus, revalidated: false };
  }

  const healthy = isUsableConnectionStatus(live.status);
  const persistStatus = persistableConnectionStatus(live.status);
  const detail = statusDetailForStorage(live.status);
  await params.supabase
    .from("connections")
    .update({
      status: persistStatus,
      last_validated_at: new Date(now).toISOString(),
      account_label: live.label ?? undefined,
      error_message: detail ? sanitizeForLog(`${detail}: pre-turn validation`) : null,
    })
    .eq("workspace_id", params.workspaceId)
    .eq("provider", params.provider);

  return { healthy, status: live.status, revalidated: true };
}
