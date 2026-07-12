/**
 * Client-safe capability helpers (no Composio / next/headers imports).
 * Server probe lives in capabilities.ts.
 */
import type { ConnectionStatus } from "@/lib/connectors/status";

export interface ConnectorCapabilities {
  read: boolean;
  draft: boolean;
  send: boolean;
  write: boolean;
  probed_at: string;
  tool_count: number;
  sample_tools: string[];
  source: "composio_tools_get";
}

export interface StoredConnectionScopes {
  capabilities?: ConnectorCapabilities;
  /** Original OAuth scope strings if ever populated. */
  oauth_scopes?: string[];
}

export function parseStoredScopes(raw: unknown): StoredConnectionScopes | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return { oauth_scopes: raw.filter((x): x is string => typeof x === "string") };
  }
  if (typeof raw === "object") {
    return raw as StoredConnectionScopes;
  }
  return null;
}

export function capabilitiesFromScopes(raw: unknown): ConnectorCapabilities | null {
  const parsed = parseStoredScopes(raw);
  const caps = parsed?.capabilities;
  if (!caps || typeof caps !== "object") return null;
  if (typeof caps.read !== "boolean") return null;
  return caps;
}

/** Prefer dedicated 0013 `capabilities` column; fall back to scopes jsonb. */
export function resolveStoredCapabilities(row: {
  capabilities?: unknown;
  scopes?: unknown;
}): { read: boolean; draft: boolean; send: boolean; write: boolean } | null {
  const col = row.capabilities;
  if (col && typeof col === "object" && !Array.isArray(col)) {
    const c = col as Record<string, unknown>;
    if (typeof c.read === "boolean" || typeof c.send === "boolean") {
      return {
        read: Boolean(c.read),
        draft: Boolean(c.draft),
        send: Boolean(c.send),
        write: Boolean(c.write ?? c.send ?? c.draft),
      };
    }
  }
  const fromScopes = capabilitiesFromScopes(row.scopes);
  if (!fromScopes) return null;
  return {
    read: fromScopes.read,
    draft: fromScopes.draft,
    send: fromScopes.send,
    write: fromScopes.write,
  };
}

export function toolNamesFromRaw(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.values(raw as Record<string, unknown>)
      : [];
  const names: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const fn = o.function as Record<string, unknown> | undefined;
    const name = (typeof fn?.name === "string" && fn.name) || (typeof o.name === "string" && o.name) || "";
    if (name) names.push(name);
  }
  return names;
}

/** Infer capabilities from discovered Composio tool slugs (provider-aware). */
export function inferCapabilitiesFromTools(
  provider: string,
  toolNames: string[],
): Omit<ConnectorCapabilities, "probed_at" | "source"> {
  const upper = toolNames.map((n) => n.toUpperCase());
  const has = (re: RegExp) => upper.some((n) => re.test(n));

  if (provider === "gmail") {
    const read = has(/^GMAIL_(FETCH|GET|LIST|SEARCH|FIND)/) || has(/GMAIL_.*EMAILS?/);
    const draft = has(/GMAIL_CREATE_EMAIL_DRAFT|GMAIL_.*DRAFT/);
    const send = has(/GMAIL_SEND/);
    return {
      read: read || draft || send,
      draft,
      send,
      write: send || draft,
      tool_count: toolNames.length,
      sample_tools: toolNames.slice(0, 12),
    };
  }

  if (provider === "google_calendar") {
    const read = has(/GOOGLECALENDAR_.*(FIND|LIST|GET|EVENTS)/) || has(/CALENDAR_.*(LIST|GET)/);
    const write = has(/GOOGLECALENDAR_.*(CREATE|UPDATE|DELETE|PATCH)/);
    return {
      read: read || write || toolNames.length > 0,
      draft: false,
      send: false,
      write,
      tool_count: toolNames.length,
      sample_tools: toolNames.slice(0, 12),
    };
  }

  const write = has(/_(CREATE|UPDATE|DELETE|SEND|POST|PUT|PATCH|MERGE)_/) || has(/(CREATE|DELETE|SEND)$/);
  return {
    read: toolNames.length > 0,
    draft: false,
    send: false,
    write,
    tool_count: toolNames.length,
    sample_tools: toolNames.slice(0, 12),
  };
}

/**
 * If tools are missing while Composio says connected, refine Aria status.
 * Read-only Gmail stays "connected" — UI uses capabilityHint for send gaps.
 */
export function refineStatusAfterProbe(
  current: ConnectionStatus,
  provider: string,
  caps: ConnectorCapabilities | null,
): ConnectionStatus {
  if (current !== "connected" && current !== "active") return current;
  if (!caps || caps.tool_count === 0) return "setup_incomplete";
  if (provider === "gmail" && caps.read && !caps.send && !caps.draft) {
    return "connected";
  }
  return "connected";
}

export function scopesPayloadForPersist(
  previous: unknown,
  caps: ConnectorCapabilities,
): StoredConnectionScopes {
  const prev = parseStoredScopes(previous) ?? {};
  return {
    ...prev,
    capabilities: caps,
  };
}
