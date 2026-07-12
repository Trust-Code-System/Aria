/**
 * Truthful connection status model.
 *
 * DB historically used `active` / `pending` / `error` / `disconnected`.
 * UI and runtime must not treat a row as usable merely because it exists —
 * Composio (or a future health check) must confirm the account is live.
 */

export const CONNECTION_STATUSES = [
  "connected",
  "action_required",
  "expired",
  "missing_permission",
  "reconnecting",
  "disconnected",
  "provider_unavailable",
  "setup_incomplete",
  "pending",
  // Legacy DB value — treated as connected by readers until fully migrated.
  "active",
  "error",
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Statuses that mean the connector may be used for tool execution. */
const USABLE = new Set<ConnectionStatus>(["connected", "active"]);

export function isUsableConnectionStatus(status: string | null | undefined): boolean {
  return USABLE.has((status ?? "") as ConnectionStatus);
}

/** Map any stored / provider string into a canonical Aria status. */
export function normalizeConnectionStatus(raw: string | null | undefined): ConnectionStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (!s) return "disconnected";
  if (s === "active" || s === "connected" || s === "success") return "connected";
  if (s === "pending" || s === "initiated" || s === "initializing" || s === "reconnecting") {
    return s === "reconnecting" ? "reconnecting" : "pending";
  }
  if (s.includes("expired") || s === "expired") return "expired";
  if (s.includes("missing_permission") || s.includes("insufficient") || s.includes("scope")) {
    return "missing_permission";
  }
  if (s === "action_required" || s === "needs_reauth" || s === "reauth") return "action_required";
  if (s === "provider_unavailable" || s === "unavailable") return "provider_unavailable";
  if (s === "setup_incomplete" || s === "setup_needed") return "setup_incomplete";
  if (s === "disconnected" || s === "revoked" || s === "deleted") return "disconnected";
  if (s === "error" || s.includes("fail")) return "action_required";
  return "action_required";
}

/**
 * Value persisted to DB after migration 0013.
 * Canonical statuses are allowed; legacy `active`/`error` still accepted by readers.
 */
export function persistableConnectionStatus(status: ConnectionStatus): string {
  const n = normalizeConnectionStatus(status);
  // Keep legacy synonyms out of new writes.
  if (n === "active") return "connected";
  if (n === "error") return "action_required";
  return n;
}

/** Detail string for error_message when status is not healthy. */
export function statusDetailForStorage(status: ConnectionStatus): string | null {
  const n = normalizeConnectionStatus(status);
  if (n === "connected" || n === "pending" || n === "reconnecting") return null;
  return n;
}

export function connectionStatusLabel(status: string | null | undefined): string {
  switch (normalizeConnectionStatus(status)) {
    case "connected":
      return "Connected";
    case "pending":
      return "Connecting…";
    case "reconnecting":
      return "Reconnecting";
    case "expired":
      return "Expired";
    case "missing_permission":
      return "Missing permission";
    case "action_required":
      return "Action required";
    case "provider_unavailable":
      return "Provider unavailable";
    case "setup_incomplete":
      return "Setup incomplete";
    case "disconnected":
      return "Disconnected";
    default:
      return "Action required";
  }
}

export type StatusBadgeTone = "success" | "warning" | "destructive" | "muted";

export function connectionStatusTone(status: string | null | undefined): StatusBadgeTone {
  switch (normalizeConnectionStatus(status)) {
    case "connected":
      return "success";
    case "pending":
    case "reconnecting":
      return "warning";
    case "disconnected":
    case "setup_incomplete":
      return "muted";
    default:
      return "destructive";
  }
}

/**
 * Map a raw Composio connected-account payload status into Aria status.
 * Does not imply scopes were verified — callers should refine with capability checks.
 */
export function mapComposioAccountStatus(rawStatus: string | null | undefined): ConnectionStatus {
  const upper = String(rawStatus ?? "").toUpperCase();
  if (!upper) return "action_required";
  if (upper.includes("ACTIVE") || upper.includes("SUCCESS")) return "connected";
  if (upper.includes("EXPIRED")) return "expired";
  if (upper.includes("INIT") || upper.includes("PENDING") || upper.includes("WAIT")) return "pending";
  if (upper.includes("REVOK") || upper.includes("DELETE") || upper.includes("DISCONN")) {
    return "disconnected";
  }
  if (upper.includes("FAIL") || upper.includes("ERROR")) return "action_required";
  return "pending";
}

/** Advertised capability copy must not claim send/write when we only know "connected". */
export function capabilityHint(
  provider: string,
  status: string | null | undefined,
  capabilities?: { read?: boolean; draft?: boolean; send?: boolean; write?: boolean } | null,
): string | null {
  if (!isUsableConnectionStatus(status) && normalizeConnectionStatus(status) !== "setup_incomplete") {
    return null;
  }
  if (normalizeConnectionStatus(status) === "setup_incomplete") {
    return "Account linked, but no tools were discovered. Reconnect or check Composio auth config.";
  }
  if (provider === "gmail") {
    if (!capabilities) {
      return "Connected. Refresh to verify read/draft/send capabilities. Sends always need approval.";
    }
    if (capabilities.read && !capabilities.send && !capabilities.draft) {
      return "Connected for reading only — draft and send tools were not found. Reconnect with send scopes.";
    }
    if (capabilities.read && capabilities.draft && !capabilities.send) {
      return "Connected for reading and drafts — sending permission/tools missing.";
    }
    if (capabilities.send) {
      return "Connected for read, draft, and send (send requires approval).";
    }
    return "Connected, but Gmail capabilities could not be verified.";
  }
  if (provider === "google_calendar") {
    if (!capabilities) return "Connected. Refresh to verify create/read calendar tools.";
    if (capabilities.read && !capabilities.write) {
      return "Connected for reading calendar — create/update tools were not found.";
    }
    if (capabilities.write) {
      return "Connected for read and create (creates require approval).";
    }
  }
  if (!capabilities) {
    return "Connected. Chat can use this app’s tools when you ask for an action (writes need approval).";
  }
  if (capabilities.write) {
    return "Connected with write tools available (writes require approval).";
  }
  if (capabilities.read) {
    return "Connected for reading — write tools were not found.";
  }
  return null;
}
