import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A turn is "stuck" when its assistant message is still pending/streaming long
 * after any legitimate generation would have finished or errored. The client
 * visual timeout is 65s; the server aborts far sooner than this for normal
 * turns. This threshold is deliberately conservative (5 minutes) so genuinely
 * long research/tool turns are never flagged as stuck.
 */
export const STUCK_TURN_THRESHOLD_MS = 5 * 60_000;

export interface TurnActivity {
  status?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

const ACTIVE = new Set(["pending", "streaming"]);

/** Last moment we have evidence the turn was alive. */
function lastActivityMs(turn: TurnActivity): number | null {
  const stamp = turn.updated_at ?? turn.started_at ?? turn.created_at;
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Pure classifier: is this turn stuck as of `now`? Only active turns whose last
 * activity is older than the threshold qualify. Turns with no usable timestamp
 * are treated as not-stuck (we cannot prove staleness).
 */
export function isTurnStuck(
  turn: TurnActivity,
  now: number = Date.now(),
  thresholdMs: number = STUCK_TURN_THRESHOLD_MS,
): boolean {
  if (!turn.status || !ACTIVE.has(turn.status)) return false;
  const last = lastActivityMs(turn);
  if (last === null) return false;
  return now - last >= thresholdMs;
}

/** ISO cutoff before which an active turn is considered stuck. */
export function stuckTurnCutoffIso(
  now: number = Date.now(),
  thresholdMs: number = STUCK_TURN_THRESHOLD_MS,
): string {
  return new Date(now - thresholdMs).toISOString();
}

/** Count active turns whose last activity is older than the cutoff. */
export async function countStuckTurns(
  admin: SupabaseClient,
  now: number = Date.now(),
): Promise<number> {
  const cutoff = stuckTurnCutoffIso(now);
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "assistant")
    .in("status", ["pending", "streaming"])
    .lt("updated_at", cutoff);
  return count ?? 0;
}

/**
 * Move stuck turns to a terminal `failed` state with a safe, retryable message.
 * This is the recovery half of the "detectable and recoverable" requirement:
 * a crashed or abandoned stream can never leave a turn animating forever.
 * Returns the number of turns recovered.
 */
export async function recoverStuckTurns(
  admin: SupabaseClient,
  now: number = Date.now(),
): Promise<{ recovered: number }> {
  const cutoff = stuckTurnCutoffIso(now);
  const { data, error } = await admin
    .from("messages")
    .update({
      status: "failed",
      error_code: "stuck_recovered",
      error_message:
        "This response did not complete and was marked failed by recovery. You can retry it.",
      completed_at: new Date(now).toISOString(),
    })
    .eq("role", "assistant")
    .in("status", ["pending", "streaming"])
    .lt("updated_at", cutoff)
    .select("id");
  if (error) throw error;
  return { recovered: data?.length ?? 0 };
}
