import { env, configured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fetchWithRetry } from "@/lib/net/retry";

/**
 * Composio client (thin REST wrapper). One integration unlocks 500+ apps.
 *
 * IMPORTANT: Composio's HTTP surface evolves. All endpoint paths live ONLY in
 * this file so they can be verified/adjusted in one place against a live API
 * key. Everything above this layer (DB, UI, routes) is provider-agnostic.
 *
 * Concepts:
 *  - entity/user_id: we use the Aria user id as the Composio entity.
 *  - auth config: per-app OAuth config created in the Composio dashboard.
 *  - connected account: the user's authorized account for an app.
 *  - tool execution: run an action (e.g. GMAIL_FETCH_EMAILS) for that entity.
 */

const V3 = "/api/v3";

function assertConfigured() {
  if (!configured.connectors) {
    throw new AppError({
      area: "tools",
      category: "config_missing",
      userMessage:
        "Connectors are not configured. Add COMPOSIO_API_KEY to enable app connections.",
    });
  }
}

async function composio<T>(path: string, init?: RequestInit): Promise<T> {
  assertConfigured();
  // Only GETs are retried: tool executions / mutations must never run twice
  // because of a timeout (the action may have gone through).
  const method = (init?.method ?? "GET").toUpperCase();
  const doFetch = method === "GET" ? fetchWithRetry : fetch;
  const res = await doFetch(`${env.composioBaseUrl}${path}`, {
    ...init,
    headers: {
      "x-api-key": env.composioKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AppError({
      area: "tools",
      category: "provider_error",
      statusCode: res.status,
      userMessage: "The connector service returned an error. Please try again.",
      internal: `composio ${init?.method ?? "GET"} ${path} -> ${res.status}: ${body.slice(0, 300)}`,
    });
  }
  return (await res.json()) as T;
}

export interface InitiateResult {
  redirectUrl: string;
  connectedAccountId: string;
}

/**
 * Start an OAuth connection for an app. For Composio-managed OAuth we use the
 * `/connected_accounts/link` endpoint, which returns a hosted redirect URL and
 * the new connected-account id. The user completes consent on Composio's page;
 * we then poll status until it becomes active. (Verified live against v3.)
 */
export async function initiateConnection(params: {
  entityId: string;
  authConfigId: string;
  callbackUrl?: string;
}): Promise<InitiateResult> {
  const data = await composio<any>(`${V3}/connected_accounts/link`, {
    method: "POST",
    body: JSON.stringify({
      auth_config_id: params.authConfigId,
      user_id: params.entityId,
      ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
    }),
  });
  return {
    connectedAccountId: data.connected_account_id ?? data.id ?? "",
    redirectUrl: data.redirect_url ?? data.redirectUrl ?? "",
  };
}

import {
  mapComposioAccountStatus,
  type ConnectionStatus,
} from "@/lib/connectors/status";

/** Current status of a connected account (pending → connected after consent). */
export async function getConnectionStatus(connectedAccountId: string): Promise<{
  status: ConnectionStatus;
  label?: string;
  providerAccountId?: string;
  rawStatus?: string;
}> {
  const data = await composio<any>(`${V3}/connected_accounts/${connectedAccountId}`);
  const raw = String(data.status ?? data.data?.status ?? "");
  const status = mapComposioAccountStatus(raw);
  const label =
    data.data?.email ??
    data.meta?.email ??
    data.params?.account_email ??
    data.email ??
    undefined;
  const providerAccountId =
    data.data?.id ?? data.account_id ?? data.uuid ?? data.id ?? undefined;
  return {
    status,
    label: label ? String(label) : undefined,
    providerAccountId: providerAccountId ? String(providerAccountId) : undefined,
    rawStatus: raw || undefined,
  };
}

export async function deleteConnection(connectedAccountId: string): Promise<void> {
  await composio(`${V3}/connected_accounts/${connectedAccountId}`, { method: "DELETE" });
}

/**
 * Execute a Composio tool/action for an entity (e.g. GMAIL_FETCH_EMAILS).
 * Returns the raw tool result payload.
 */
export async function executeTool<T = any>(params: {
  toolSlug: string;
  entityId: string;
  /** Prefer this when available — avoids ambiguous multi-account lookups. */
  connectedAccountId?: string;
  args: Record<string, unknown>;
}): Promise<T> {
  const data = await composio<any>(`${V3}/tools/execute/${params.toolSlug}`, {
    method: "POST",
    body: JSON.stringify({
      user_id: params.entityId,
      ...(params.connectedAccountId
        ? { connected_account_id: params.connectedAccountId }
        : {}),
      arguments: params.args,
    }),
  });
  if (data.successful === false || data.error) {
    throw new AppError({
      area: "tools",
      category: "provider_error",
      userMessage: "That action could not be completed. Reconnect the app on Connections if this keeps happening.",
      internal: `composio tool ${params.toolSlug}: ${JSON.stringify(data.error ?? data).slice(0, 300)}`,
    });
  }
  return (data.data ?? data.response_data ?? data) as T;
}

/** App -> the env var holding its Composio auth-config id. */
export function authConfigIdFor(provider: string): string {
  const map: Record<string, string> = {
    gmail: env.composioGmailAuthConfigId,
    google_calendar: env.composioGoogleCalendarAuthConfigId,
    google_drive: env.composioGoogleDriveAuthConfigId,
    slack: env.composioSlackAuthConfigId,
    notion: env.composioNotionAuthConfigId,
    github: env.composioGithubAuthConfigId,
    linear: env.composioLinearAuthConfigId,
    jira: env.composioJiraAuthConfigId,
    trello: env.composioTrelloAuthConfigId,
    asana: env.composioAsanaAuthConfigId,
    hubspot: env.composioHubspotAuthConfigId,
    salesforce: env.composioSalesforceAuthConfigId,
    outlook: env.composioOutlookAuthConfigId,
  };
  return map[provider] ?? "";
}
