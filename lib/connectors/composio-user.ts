/**
 * Stable Composio user identity.
 *
 * OAuth (Connections) and chat tool execution MUST use the exact same ID.
 * We use the Supabase auth user UUID — never a per-request, per-chat, or
 * per-device ephemeral value.
 */
export function stableComposioUserId(supabaseUserId: string): string {
  const id = (supabaseUserId ?? "").trim();
  if (!id) {
    throw new Error("Cannot resolve Composio user id: missing Supabase user id.");
  }
  return id;
}

/** Partially redacted id for logs (never log full credentials; user ids are semi-sensitive). */
export function redactComposioUserId(userId: string): string {
  if (userId.length <= 8) return "***";
  return `${userId.slice(0, 4)}…${userId.slice(-4)}`;
}
