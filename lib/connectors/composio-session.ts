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
import { verifyConnectionHealth } from "@/lib/connectors/health";
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
  | "trello"
  | "asana"
  | "hubspot"
  | "salesforce"
  | "outlook"
  | "googlesheets"
  | "googledocs"
  | "dropbox"
  | "airtable"
  | "todoist"
  | "discord"
  | "twitter"
  | "whatsapp"
  | "telegram";

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
  asana: "asana",
  hubspot: "hubspot",
  salesforce: "salesforce",
  outlook: "outlook",
  google_sheets: "googlesheets",
  google_docs: "googledocs",
  dropbox: "dropbox",
  airtable: "airtable",
  todoist: "todoist",
  discord: "discord",
  twitter: "twitter",
  whatsapp: "whatsapp",
  telegram: "telegram",
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
  googledrive: [
    "GOOGLEDRIVE_FIND_FILE",
    "GOOGLEDRIVE_FIND_FOLDER",
    "GOOGLEDRIVE_LIST_FILES",
    "GOOGLEDRIVE_DOWNLOAD_FILE",
    "GOOGLEDRIVE_CREATE_FILE",
    "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT",
    "GOOGLEDRIVE_CREATE_FOLDER",
    "GOOGLEDRIVE_EDIT_FILE",
    "GOOGLEDRIVE_COPY_FILE",
  ],
  slack: [
    "SLACK_SEND_MESSAGE",
    "SLACK_SEARCH_MESSAGES",
    "SLACK_FIND_CHANNELS",
    "SLACK_LIST_UNREAD_CHANNEL_MESSAGES",
    "SLACK_CREATE_CHANNEL",
  ],
  notion: [
    "NOTION_CREATE_NOTION_PAGE",
    "NOTION_RETRIEVE_PAGE",
    "NOTION_GET_PAGE_MARKDOWN",
    "NOTION_QUERY_DATABASE",
    "NOTION_ADD_PAGE_CONTENT",
    "NOTION_UPDATE_PAGE",
    "NOTION_SEARCH_NOTION_PAGE",
    "NOTION_FETCH_ALL_BLOCK_CONTENTS",
  ],
  github: [
    "GITHUB_CREATE_AN_ISSUE",
    "GITHUB_CREATE_AN_ISSUE_COMMENT",
    "GITHUB_CREATE_A_PULL_REQUEST",
    "GITHUB_FIND_PULL_REQUESTS",
    "GITHUB_GET_A_PULL_REQUEST",
    "GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST",
  ],
  linear: [
    "LINEAR_CREATE_LINEAR_ISSUE",
    "LINEAR_CREATE_LINEAR_COMMENT",
    "LINEAR_SEARCH_ISSUES",
    "LINEAR_LIST_LINEAR_ISSUES",
    "LINEAR_LIST_COMMENTS",
  ],
  jira: [
    "JIRA_CREATE_ISSUE",
    "JIRA_SEARCH_ISSUES",
    "JIRA_LIST_COMMENTS",
    "JIRA_CREATE_ISSUE_LINK",
    "JIRA_CREATE_PROJECT",
    "JIRA_CREATE_SPRINT",
    "JIRA_SEND_NOTIFICATION_FOR_ISSUE",
  ],
  trello: [
    "TRELLO_ADD_CARDS",
    "TRELLO_ADD_BOARDS",
    "TRELLO_ADD_CARDS_ACTIONS_COMMENTS_BY_ID_CARD",
    "TRELLO_ADD_CHECKLIST_ITEM",
    "TRELLO_ADD_MEMBER_TO_CARD",
    "TRELLO_ADD_LISTS_CARDS_BY_ID_LIST",
  ],
  asana: [
    "ASANA_CREATE_A_TASK",
    "ASANA_CREATE_SUBTASK",
    "ASANA_CREATE_TASK_COMMENT",
    "ASANA_SEARCH_TASKS_IN_WORKSPACE",
    "ASANA_CREATE_ATTACHMENT_FOR_TASK",
    "ASANA_CREATE_TAG",
    "ASANA_CREATE_TEAM",
  ],
  hubspot: [
    "HUBSPOT_CREATE_CONTACT",
    "HUBSPOT_CREATE_DEAL",
    "HUBSPOT_CREATE_TASK",
    "HUBSPOT_CREATE_TICKET",
    "HUBSPOT_CREATE_EMAIL",
    "HUBSPOT_SEARCH_EMAILS",
  ],
  salesforce: [
    "SALESFORCE_SEND_EMAIL",
    "SALESFORCE_CREATE_CONTACT",
    "SALESFORCE_CREATE_LEAD",
    "SALESFORCE_CREATE_TASK",
    "SALESFORCE_CREATE_A_RECORD",
    "SALESFORCE_CREATE_OPPORTUNITY_RECORD",
    "SALESFORCE_SEARCH_CONTACTS",
    "SALESFORCE_SEND_EMAIL_FROM_TEMPLATE",
  ],
  outlook: [
    "OUTLOOK_SEND_EMAIL",
    "OUTLOOK_CREATE_DRAFT_REPLY",
    "OUTLOOK_FORWARD_MESSAGE",
    "OUTLOOK_GET_MAIL_FOLDER_MESSAGE",
    "OUTLOOK_LIST_MAIL_FOLDERS",
    "OUTLOOK_CREATE_USER_MESSAGE",
  ],
  googlesheets: [
    "GOOGLESHEETS_CREATE_GOOGLE_SHEET1",
    "GOOGLESHEETS_GET_SPREADSHEET_INFO",
    "GOOGLESHEETS_BATCH_GET",
    "GOOGLESHEETS_BATCH_UPDATE",
    "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
    "GOOGLESHEETS_VALUES_GET",
    "GOOGLESHEETS_VALUES_UPDATE",
    "GOOGLESHEETS_SEARCH_SPREADSHEETS",
    "GOOGLESHEETS_CLEAR_VALUES",
  ],
  googledocs: [
    "GOOGLEDOCS_CREATE_DOCUMENT",
    "GOOGLEDOCS_GET_DOCUMENT_BY_ID",
    "GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT",
    "GOOGLEDOCS_INSERT_TEXT_ACTION",
    "GOOGLEDOCS_REPLACE_ALL_TEXT",
    "GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT",
    "GOOGLEDOCS_SEARCH_DOCUMENTS",
  ],
  dropbox: [
    "DROPBOX_FILES_SEARCH",
    "DROPBOX_CREATE_FOLDER",
    "DROPBOX_LIST_FOLDERS",
    "DROPBOX_GET_METADATA",
    "DROPBOX_GET_FILE_PREVIEW",
    "DROPBOX_GET_SHARED_LINK_FILE",
    "DROPBOX_DOWNLOAD_ZIP",
  ],
  airtable: [
    "AIRTABLE_CREATE_RECORD",
    "AIRTABLE_CREATE_MULTIPLE_RECORDS",
    "AIRTABLE_LIST_RECORDS",
    "AIRTABLE_CREATE_TABLE",
    "AIRTABLE_CREATE_FIELD",
    "AIRTABLE_CREATE_BASE",
    "AIRTABLE_LIST_COMMENTS",
    "AIRTABLE_CREATE_RECORD_FROM_NATURAL_LANGUAGE",
  ],
  todoist: [
    "TODOIST_CREATE_TASK",
    "TODOIST_CLOSE_TASK",
    "TODOIST_UPDATE_TASK",
    "TODOIST_CREATE_PROJECT",
    "TODOIST_SEARCH_PROJECTS",
    "TODOIST_LIST_COMPLETED_TASKS",
  ],
  twitter: [
    "TWITTER_CREATION_OF_A_POST",
    "TWITTER_RETWEET_POST",
    "TWITTER_USER_LIKE_POST",
    "TWITTER_ADD_POST_TO_BOOKMARKS",
    "TWITTER_SEND_A_NEW_MESSAGE_TO_A_USER",
    "TWITTER_SEARCH_SPACES",
  ],
  whatsapp: [
    "WHATSAPP_SEND_MESSAGE",
    "WHATSAPP_SEND_TEMPLATE_MESSAGE",
    "WHATSAPP_SEND_MEDIA",
    "WHATSAPP_SEND_LOCATION",
    "WHATSAPP_SEND_CONTACTS",
    "WHATSAPP_CREATE_MESSAGE_TEMPLATE",
    "WHATSAPP_SEND_INTERACTIVE_BUTTONS",
  ],
  telegram: [
    "TELEGRAM_SEND_MESSAGE",
    "TELEGRAM_SEND_DOCUMENT",
    "TELEGRAM_SEND_PHOTO",
    "TELEGRAM_SEND_LOCATION",
    "TELEGRAM_SEND_POLL",
    "TELEGRAM_GET_CHAT",
    "TELEGRAM_GET_UPDATES",
    "TELEGRAM_CREATE_CHAT_INVITE_LINK",
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
  if (/\basana\b/.test(text)) selected.add("asana");
  if (/\b(hubspot|crm)\b/.test(text)) selected.add("hubspot");
  if (/\bsalesforce\b/.test(text)) selected.add("salesforce");
  if (/\boutlook\b/.test(text)) selected.add("outlook");
  if (/\b(google sheet|spreadsheet|sheets?)\b/.test(text)) selected.add("googlesheets");
  if (/\b(google doc|docs?)\b/.test(text)) selected.add("googledocs");
  if (/\bdropbox\b/.test(text)) selected.add("dropbox");
  if (/\bairtable\b/.test(text)) selected.add("airtable");
  if (/\btodoist\b/.test(text)) selected.add("todoist");
  if (/\bdiscord\b/.test(text)) selected.add("discord");
  if (/\b(twitter|tweet|post on x)\b/.test(text)) selected.add("twitter");
  if (/\bwhatsapp\b/.test(text)) selected.add("whatsapp");
  if (/\btelegram\b/.test(text)) selected.add("telegram");

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
  blockedToolkits?: string[];
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
  const blockedToolkits: string[] = [];

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
    // Re-verify the connection is live before exposing its tools this turn.
    // Freshness-gated + fail-open, so a recently-validated or transiently
    // unreachable connector is never wrongly blocked — but a token revoked or
    // expired since the last refresh stops its tools from reaching the model.
    const health = await verifyConnectionHealth({
      supabase: params.supabase,
      workspaceId: params.workspaceId,
      provider,
      connectedAccountId: conn.connectedAccountId,
      dbStatus: conn.status,
      lastValidatedAt: conn.lastValidatedAt,
    });
    if (!health.healthy) {
      connectedAccounts[toolkit] = null;
      blockedToolkits.push(`${toolkit}:${health.status}`);
      continue;
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
    blockedToolkits: blockedToolkits.length ? blockedToolkits : undefined,
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
