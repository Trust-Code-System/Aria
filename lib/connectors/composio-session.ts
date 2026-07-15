/**
 * Composio runtime for Aria chat.
 *
 * Composio remains the source of truth for OAuth, connected accounts, token
 * refresh, toolkit discovery, schemas, and execution.
 *
 * Aria on AI SDK v3 cannot use `@composio/vercel` (peer ai@6+). We therefore:
 *  1. Use `@composio/core` with the same stable user_id as OAuth.
 *  2. Load toolkit tools via `composio.tools.get` (direct Gmail/Calendar/…).
 *  3. Wrap each tool as a Vercel AI SDK v3 CoreTool with a real `execute`.
 *  4. Gate dangerous tools through Aria approvals, then resume via
 *     `composio.tools.execute` with the locked args + connected account.
 *
 * Do not invent a parallel OAuth/token store.
 */
import { jsonSchema, tool, type CoreTool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Composio } from "@composio/core";

import { env, configured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { createChatToolApproval } from "@/lib/connectors/chat-approval";
import { getActiveConnection } from "@/lib/connectors/connections";
import {
  redactComposioUserId,
  stableComposioUserId,
} from "@/lib/connectors/composio-user";
import type { ChatIntent } from "@/lib/orchestration/intent";
import { sanitizeForLog } from "@/lib/security/sanitize";
import { classifyToolPolicy } from "@/lib/connectors/tool-policy";
import { extractVerifiedProviderReference, providerResultFailureReason, verifyProviderExecutionResult } from "@/lib/connectors/provider-result";
import { logError } from "@/lib/logging/error-log";

export type AriaToolkit =
  | "gmail"
  | "googlecalendar"
  | "googledrive"
  | "slack"
  | "notion"
  | "github"
  | "linear"
  | "jira"
  | "trello";

/** Map Aria connection provider keys → Composio toolkit slugs. */
export const PROVIDER_TO_TOOLKIT: Record<string, AriaToolkit> = {
  gmail: "gmail",
  google_calendar: "googlecalendar",
  google_drive: "googledrive",
  slack: "slack",
  notion: "notion",
  github: "github",
  linear: "linear",
  jira: "jira",
  trello: "trello",
};

const TOOLKIT_TO_PROVIDER: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_TO_TOOLKIT).map(([p, t]) => [t, p]),
);

/**
 * Curated action slugs fetched BY EXACT NAME for toolkits where the important
 * tools sort late alphabetically.
 *
 * Composio's `tools.get({ toolkits })` returns tools alphabetically and truncates
 * at `limit`. For Gmail that dropped GMAIL_SEND_EMAIL / GMAIL_SEND_DRAFT (they
 * sort after the cut), so "send" was silently unavailable at chat time even
 * though the connection had the scope. Requesting these slugs explicitly keeps
 * the set small (no schema flooding) AND guarantees send/reply are present.
 * Unknown slugs are ignored by Composio, so this is safe to over-list.
 */
export const ESSENTIAL_TOOL_SLUGS: Partial<Record<AriaToolkit, string[]>> = {
  gmail: [
    "GMAIL_SEND_EMAIL",
    "GMAIL_SEND_DRAFT",
    "GMAIL_CREATE_EMAIL_DRAFT",
    "GMAIL_REPLY_TO_THREAD",
    "GMAIL_FETCH_EMAILS",
    "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
    "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
    "GMAIL_LIST_THREADS",
    "GMAIL_GET_PROFILE",
  ],
  googlecalendar: [
    "GOOGLECALENDAR_CREATE_EVENT",
    "GOOGLECALENDAR_FIND_EVENT",
    "GOOGLECALENDAR_FIND_FREE_SLOTS",
    "GOOGLECALENDAR_GET_CURRENT_DATE_TIME",
  ],
};

/** Tools that must never auto-execute — approval required. */
let client: Composio | null = null;

export function getComposioClient(): Composio {
  if (!configured.connectors) {
    throw new AppError({
      area: "tools",
      category: "config_missing",
      userMessage: "Connectors are not configured. Add COMPOSIO_API_KEY.",
    });
  }
  if (!client) {
    client = new Composio({ apiKey: env.composioKey });
  }
  return client;
}

export function isDangerousComposioTool(slug: string): boolean {
  return classifyToolPolicy(slug).requiresApproval;
}

/**
 * Select Composio toolkits from chat intent + message (never load everything).
 */
export function toolkitsForIntent(intent: ChatIntent, message: string): AriaToolkit[] {
  if (intent === "instant" || intent === "simple_generation" || intent === "personal_context") {
    return [];
  }
  if (intent === "knowledge") return [];
  if (intent === "research") return []; // web research is Aria's Tavily/Perplexity path

  const text = message.toLowerCase();
  const selected = new Set<AriaToolkit>();

  if (/\b(email|gmail|inbox|draft|send.*(mail|email)|mail)\b/.test(text)) selected.add("gmail");
  if (/\b(calendar|schedule|meeting|invite|event)\b/.test(text)) selected.add("googlecalendar");
  if (/\b(drive|google doc|spreadsheet|file in drive)\b/.test(text)) selected.add("googledrive");
  if (/\bslack\b/.test(text)) selected.add("slack");
  if (/\bnotion\b/.test(text)) selected.add("notion");
  if (/\b(github|pull request|\bpr\b|repo)\b/.test(text)) selected.add("github");
  if (/\blinear\b/.test(text)) selected.add("linear");
  if (/\bjira\b/.test(text)) selected.add("jira");
  if (/\btrello\b/.test(text)) selected.add("trello");

  // Generic "send it" / action without app name → Gmail when connected later filtered.
  if (selected.size === 0 && intent === "action") {
    selected.add("gmail");
  }
  if (selected.size === 0 && intent === "complex_reasoning") {
    // Prefer not to load all toolkits; leave empty unless apps named.
    return [];
  }
  return Array.from(selected);
}

export interface ComposioDiag {
  ariaUserId: string;
  workspaceId: string;
  composioUserIdRedacted: string;
  toolkitsRequested: string[];
  toolsReturned: string[];
  connectedAccounts: Record<string, string | null>;
  layer?: string;
  note?: string;
}

function logComposioDiag(diag: ComposioDiag) {
  // Sanitized operational diagnostics only — no tokens, no email bodies.
  // eslint-disable-next-line no-console
  console.info(
    "[composio]",
    sanitizeForLog({
      ...diag,
      ariaUserId: redactComposioUserId(diag.ariaUserId),
    }),
  );
}

type OpenAiFnTool = {
  type?: string;
  function?: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

function normalizeOpenAiTools(raw: unknown): OpenAiFnTool[] {
  if (Array.isArray(raw)) return raw as OpenAiFnTool[];
  if (raw && typeof raw === "object") return Object.values(raw as Record<string, OpenAiFnTool>);
  return [];
}

export async function buildComposioAiSdkTools(params: {
  supabaseUserId: string;
  workspaceId: string;
  conversationId: string | null;
  assistantMessageId?: string | null;
  supabase: SupabaseClient;
  toolkits: AriaToolkit[];
}): Promise<{
  tools: Record<string, CoreTool>;
  toolNames: string[];
  capabilityLines: string[];
  diag: ComposioDiag;
}> {
  const composioUserId = stableComposioUserId(params.supabaseUserId);
  const connectedAccounts: Record<string, string | null> = {};
  const usableToolkits: AriaToolkit[] = [];

  for (const toolkit of params.toolkits) {
    const provider = TOOLKIT_TO_PROVIDER[toolkit];
    if (!provider) continue;
    const conn = await getActiveConnection(params.workspaceId, provider, params.supabase);
    if (!conn) {
      connectedAccounts[toolkit] = null;
      continue;
    }
    // Enforce identity continuity: connection row must map to this user.
    if (conn.entityId && conn.entityId !== composioUserId) {
      logComposioDiag({
        ariaUserId: params.supabaseUserId,
        workspaceId: params.workspaceId,
        composioUserIdRedacted: redactComposioUserId(composioUserId),
        toolkitsRequested: params.toolkits,
        toolsReturned: [],
        connectedAccounts,
        layer: "user_mapping",
        note: `Connection entity ${redactComposioUserId(conn.entityId)} != chat user`,
      });
      throw new AppError({
        area: "tools",
        category: "auth",
        userMessage:
          "Your Gmail connection is linked to a different account identity. Disconnect and reconnect Gmail on the Connections page.",
        internal: { expected: composioUserId, found: conn.entityId },
      });
    }
    connectedAccounts[toolkit] = conn.connectedAccountId ?? null;
    usableToolkits.push(toolkit);
  }

  const diag: ComposioDiag = {
    ariaUserId: params.supabaseUserId,
    workspaceId: params.workspaceId,
    composioUserIdRedacted: redactComposioUserId(composioUserId),
    toolkitsRequested: params.toolkits,
    toolsReturned: [],
    connectedAccounts,
  };

  if (usableToolkits.length === 0) {
    diag.layer = "connected_account";
    diag.note = "No usable connected accounts for requested toolkits";
    logComposioDiag(diag);
    return { tools: {}, toolNames: [], capabilityLines: [], diag };
  }

  const composio = getComposioClient();
  let rawTools: OpenAiFnTool[] = [];
  try {
    // Fetch curated action slugs by exact name (avoids the alphabetical
    // truncation that hid GMAIL_SEND_EMAIL); fall back to toolkit discovery
    // only for apps without a curated essential set.
    const explicitSlugs = usableToolkits.flatMap((tk) => ESSENTIAL_TOOL_SLUGS[tk] ?? []);
    const discoveryToolkits = usableToolkits.filter((tk) => !ESSENTIAL_TOOL_SLUGS[tk]);
    const collected: OpenAiFnTool[] = [];
    if (explicitSlugs.length) {
      collected.push(
        ...normalizeOpenAiTools(await composio.tools.get(composioUserId, { tools: explicitSlugs })),
      );
    }
    if (discoveryToolkits.length) {
      collected.push(
        ...normalizeOpenAiTools(
          await composio.tools.get(composioUserId, { toolkits: discoveryToolkits, limit: 40 }),
        ),
      );
    }
    const seenSlugs = new Set<string>();
    rawTools = collected.filter((item) => {
      const slug = (item.function?.name || item.name || "").toUpperCase();
      if (!slug || seenSlugs.has(slug)) return false;
      seenSlugs.add(slug);
      return true;
    });
  } catch (err) {
    diag.layer = "tool_discovery";
    diag.note = err instanceof Error ? err.message.slice(0, 200) : "tools.get failed";
    logComposioDiag(diag);
    throw new AppError({
      area: "tools",
      category: "provider_error",
      userMessage: "Could not load tools from Composio. Try reconnecting the app.",
      internal: err,
    });
  }

  // Prefer read/draft/send essentials for Gmail; still include discovered set.
  const tools: Record<string, CoreTool> = {};
  const capabilityLines: string[] = [];

  for (const toolkit of usableToolkits) {
    const names = rawTools
      .map((t) => t.function?.name || t.name || "")
      .filter((n) => {
        const u = n.toUpperCase();
        if (toolkit === "gmail") return u.startsWith("GMAIL");
        return u.startsWith(toolkit.toUpperCase());
      });
    capabilityLines.push(
      `${toolkit}: connected (account ${connectedAccounts[toolkit] ? "bound" : "default"}); tools available via Composio`,
    );
    void names;
  }

  // Prefer read/draft/send essentials for Gmail — full toolkit floods the model
  // and often breaks Google/OpenAI tool calling (too many schemas).
  const ESSENTIAL_GMAIL =
    /^(GMAIL_SEND_EMAIL|GMAIL_SEND_DRAFT|GMAIL_CREATE_EMAIL_DRAFT|GMAIL_REPLY_TO_THREAD|GMAIL_FETCH_EMAILS|GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID|GMAIL_GET_PROFILE|GMAIL_LIST_THREADS|GMAIL_FETCH_MESSAGE_BY_THREAD_ID)$/i;
  const ESSENTIAL_CALENDAR =
    /^(GOOGLECALENDAR_FIND_EVENT|GOOGLECALENDAR_LIST_EVENTS|GOOGLECALENDAR_CREATE_EVENT|GOOGLECALENDAR_FIND_FREE_SLOTS|GOOGLECALENDAR_GET_CURRENT_DATE_TIME)$/i;

  for (const item of rawTools) {
    const slug = item.function?.name || item.name;
    if (!slug) continue;
    const upper = slug.toUpperCase();
    if (upper.startsWith("GMAIL") && !ESSENTIAL_GMAIL.test(slug)) continue;
    if (upper.includes("CALENDAR") && !ESSENTIAL_CALENDAR.test(slug)) continue;
    // Cap non-gmail toolkits to avoid schema bloat
    if (!upper.startsWith("GMAIL") && !upper.includes("CALENDAR") && Object.keys(tools).length >= 12) {
      continue;
    }
    const description = item.function?.description || item.description || slug;
    const parameters = (item.function?.parameters || item.parameters || {
      type: "object",
      properties: {},
    }) as Record<string, unknown>;

    const connectedAccountId = resolveAccountForSlug(slug, connectedAccounts);
    const policy = classifyToolPolicy(slug);
    if (policy.risk === "prohibited") continue;

    if (policy.requiresApproval) {
      tools[slug] = tool({
        description: `${description}\n\nIMPORTANT: This action requires user approval. Calling it creates an approval request — it does NOT execute immediately.`,
        parameters: jsonSchema(parameters as any),
        execute: async (args) => {
          const { approvalId, summary } = await createChatToolApproval({
            supabase: params.supabase,
            workspaceId: params.workspaceId,
            userId: params.supabaseUserId,
            conversationId: params.conversationId,
            messageId: params.assistantMessageId ?? null,
            toolName: slug,
            args: {
              ...(args as Record<string, unknown>),
              __composio_user_id: composioUserId,
              __connected_account_id: connectedAccountId,
            },
            riskLevel: policy.risk === "destructive" ? 3 : 2,
          });
          logComposioDiag({
            ...diag,
            toolsReturned: Object.keys(tools),
            layer: "approval",
            note: `pending ${slug} approvalId=${approvalId}`,
          });
          return {
            status: "pending_approval",
            approvalId,
            summary,
            message: `Approval created for ${slug}. Ask the user to review the inline approval card. Nothing has been sent yet.`,
          };
        },
      });
      continue;
    }

    tools[slug] = tool({
      description,
      parameters: jsonSchema(parameters as any),
      execute: async (args) => {
        const startedAt = new Date().toISOString();
        try {
          const result = await composio.tools.execute(slug, {
            userId: composioUserId,
            arguments: args as Record<string, unknown>,
            ...(connectedAccountId ? { connectedAccountId } : {}),
            // Composio requires a toolkit version for manual execution; use the
            // latest (skip the pin check). Pin per toolkit later if you need
            // reproducible behavior across Composio toolkit releases.
            dangerouslySkipVersionCheck: true,
          });
          const reportedFailure = providerResultFailureReason(result);
          if (reportedFailure) {
            throw new AppError({
              area: "tools",
              category: "provider_error",
              userMessage: "The connected app reported that the operation failed. Nothing was marked as completed.",
              internal: reportedFailure,
            });
          }
          if (policy.risk === "reversible_write") {
            const verifiedWrite = verifyProviderExecutionResult(result);
            if (!verifiedWrite.ok) {
              throw new AppError({
                area: "tools",
                category: "provider_error",
                userMessage: "The connected provider did not confirm the draft or reversible write. Nothing was marked as completed.",
                internal: verifiedWrite.reason,
              });
            }
          }
          const completedAt = new Date().toISOString();
          const { error: receiptError } = await params.supabase.from("action_receipts").insert({
            approval_id: null,
            workspace_id: params.workspaceId,
            user_id: params.supabaseUserId,
            conversation_id: params.conversationId,
            message_id: params.assistantMessageId ?? null,
            provider: providerForToolSlug(slug),
            action_type: slug,
            destination: null,
            subject: null,
            provider_reference: extractVerifiedProviderReference(result),
            status: "succeeded",
            error_message: null,
            started_at: startedAt,
            completed_at: completedAt,
          });
          if (receiptError) {
            await logError({
              area: "tools",
              error: receiptError,
              workspaceId: params.workspaceId,
              userId: params.supabaseUserId,
              provider: providerForToolSlug(slug),
            });
          }
          logComposioDiag({
            ...diag,
            toolsReturned: Object.keys(tools),
            layer: "composio_execution",
            note: `ok ${slug}`,
          });
          return result;
        } catch (err) {
          const completedAt = new Date().toISOString();
          await params.supabase.from("action_receipts").insert({
            approval_id: null,
            workspace_id: params.workspaceId,
            user_id: params.supabaseUserId,
            conversation_id: params.conversationId,
            message_id: params.assistantMessageId ?? null,
            provider: providerForToolSlug(slug),
            action_type: slug,
            destination: null,
            subject: null,
            provider_reference: null,
            status: "failed",
            error_message: "The connected provider reported an execution failure.",
            started_at: startedAt,
            completed_at: completedAt,
          });
          logComposioDiag({
            ...diag,
            toolsReturned: Object.keys(tools),
            layer: "composio_execution",
            note: `fail ${slug}: ${err instanceof Error ? err.message.slice(0, 120) : "error"}`,
          });
          throw err instanceof AppError
            ? err
            : new AppError({
                area: "tools",
                category: "provider_error",
                userMessage:
                  "Composio could not complete that action. Reconnect the app on Connections if this keeps happening.",
                internal: err instanceof Error ? err.message : err,
              });
        }
      },
    });
  }

  diag.toolsReturned = Object.keys(tools);
  diag.layer = "tool_discovery";
  diag.note = `loaded ${diag.toolsReturned.length} tools for ${usableToolkits.join(",")}`;
  logComposioDiag(diag);

  return {
    tools,
    toolNames: Object.keys(tools),
    capabilityLines,
    diag,
  };
}

function providerForToolSlug(slug: string): string {
  const upper = slug.toUpperCase();
  if (upper.startsWith("GMAIL")) return "gmail";
  if (upper.includes("CALENDAR")) return "google_calendar";
  if (upper.includes("DRIVE")) return "google_drive";
  return slug.split("_")[0].toLowerCase();
}

function resolveAccountForSlug(
  slug: string,
  connectedAccounts: Record<string, string | null>,
): string | undefined {
  const upper = slug.toUpperCase();
  for (const [toolkit, accountId] of Object.entries(connectedAccounts)) {
    if (!accountId) continue;
    if (upper.startsWith(toolkit.toUpperCase()) || (toolkit === "gmail" && upper.startsWith("GMAIL"))) {
      return accountId;
    }
    if (toolkit === "googlecalendar" && upper.includes("CALENDAR")) return accountId;
    if (toolkit === "googledrive" && upper.includes("DRIVE")) return accountId;
  }
  return undefined;
}

/** Execute a previously approved Composio tool with locked args. */
export async function executeComposioToolFromApproval(params: {
  toolSlug: string;
  supabaseUserId: string;
  args: Record<string, unknown>;
}): Promise<unknown> {
  const composioUserId =
    (typeof params.args.__composio_user_id === "string" && params.args.__composio_user_id) ||
    stableComposioUserId(params.supabaseUserId);
  const connectedAccountId =
    typeof params.args.__connected_account_id === "string"
      ? params.args.__connected_account_id
      : undefined;

  const { __composio_user_id, __connected_account_id, ...arguments_ } = params.args;
  void __composio_user_id;
  void __connected_account_id;

  // Identity continuity check
  if (composioUserId !== stableComposioUserId(params.supabaseUserId)) {
    throw new AppError({
      area: "tools",
      category: "auth",
      userMessage: "Approval user mapping mismatch — reconnect and try again.",
    });
  }

  const composio = getComposioClient();
  try {
    const result = await composio.tools.execute(params.toolSlug, {
      userId: composioUserId,
      arguments: arguments_,
      ...(connectedAccountId ? { connectedAccountId } : {}),
      // Composio requires a toolkit version for manual execution; use latest.
      dangerouslySkipVersionCheck: true,
    });
    const verified = verifyProviderExecutionResult(result);
    if (!verified.ok) {
      throw new AppError({
        area: "tools",
        category: "provider_error",
        userMessage:
          "The connected provider did not confirm the action. Nothing was marked as sent or completed.",
        internal: verified.reason,
      });
    }
    logComposioDiag({
      ariaUserId: params.supabaseUserId,
      workspaceId: "",
      composioUserIdRedacted: redactComposioUserId(composioUserId),
      toolkitsRequested: [],
      toolsReturned: [params.toolSlug],
      connectedAccounts: { [params.toolSlug]: connectedAccountId ?? null },
      layer: "composio_execution",
      note: "approval_resume_ok",
    });
    return result;
  } catch (err) {
    logComposioDiag({
      ariaUserId: params.supabaseUserId,
      workspaceId: "",
      composioUserIdRedacted: redactComposioUserId(composioUserId),
      toolkitsRequested: [],
      toolsReturned: [params.toolSlug],
      connectedAccounts: {},
      layer: "composio_execution",
      note: `approval_resume_fail: ${err instanceof Error ? err.message.slice(0, 160) : "error"}`,
    });
    throw new AppError({
      area: "tools",
      category: "provider_error",
      userMessage:
        "Approved, but Composio/Gmail failed to complete the send. Nothing was faked as success. Check Connections and try again.",
      internal: err instanceof Error ? err.message : err,
    });
  }
}
