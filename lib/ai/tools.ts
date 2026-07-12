import { z } from "zod";

/**
 * Tool / MCP integration registry.
 *
 * Every integration is declared here with a typed schema, a permission list,
 * a danger flag, and lethal-trifecta capability flags (see lib/agent/trifecta.ts).
 * Tools whose provider is configured expose a real `execute`; everything else
 * stays a typed, disabled stub — the UI and permission model never pretend an
 * integration works when it doesn't.
 *
 * Execution safety, layered:
 *  - `enabled` only says the provider is configured. Composio-backed tools
 *    additionally require an ACTIVE per-workspace connection at execute time.
 *  - `dangerous: true` tools throw unless `ctx.confirmed === true` — the flag
 *    is set only by the approval inbox / explicit confirmation UI, never by
 *    model output.
 *  - Composio slugs live ONLY in this file and in lib/connectors/gmail.ts, so
 *    they can be verified against the live API in one place. A wrong slug
 *    fails with an honest AppError — it never silently no-ops.
 */

import { runResearch, researchProviderAvailable } from "@/lib/ai/research";
import { executeTool as composioExecute, authConfigIdFor } from "@/lib/connectors/composio";
import { getActiveConnection } from "@/lib/connectors/connections";
import { fetchRecentEmails, createDraft, sendEmail } from "@/lib/connectors/gmail";
import { configured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { CapabilityFlags } from "@/lib/agent/trifecta";

export type ToolCategory =
  | "search"
  | "email"
  | "calendar"
  | "storage"
  | "code"
  | "social"
  | "database"
  | "browser"
  | "chat";

export interface ToolPermission {
  scope: string;
  description: string;
}

export interface ToolDefinition<I = any, O = any> {
  name: string;
  category: ToolCategory;
  description: string;
  /** Whether an API key / auth config is configured for this tool. */
  enabled: boolean;
  /** Requires explicit user confirmation before running. */
  dangerous: boolean;
  /** Lethal-trifecta budget flags — enforced by the agent runtime. */
  capabilities: CapabilityFlags;
  permissions: ToolPermission[];
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  /** Only present when enabled; stubs omit this. */
  execute?: (input: I, ctx: ToolExecContext) => Promise<O>;
}

export interface ToolExecContext {
  workspaceId: string;
  userId: string;
  /** Set true only after the user confirmed a dangerous action in the UI. */
  confirmed?: boolean;
}

function requireConfirmed(ctx: ToolExecContext, action: string) {
  if (!ctx.confirmed) {
    throw new AppError({
      area: "tools",
      category: "auth",
      statusCode: 403,
      userMessage: `"${action}" needs your explicit confirmation before it runs.`,
    });
  }
}

async function requireConnection(ctx: ToolExecContext, provider: string) {
  const conn = await getActiveConnection(ctx.workspaceId, provider);
  if (!conn) {
    throw new AppError({
      area: "tools",
      category: "config_missing",
      userMessage: `${provider} is not connected. Connect it on the Connections page first.`,
    });
  }
  return conn;
}

/** Composio-backed tools are "enabled" when the key + per-app auth config exist. */
function composioConfigured(provider: string): boolean {
  return configured.connectors && Boolean(authConfigIdFor(provider));
}

// --- Web search (read-only) ------------------------------------------------
const webSearchTool: ToolDefinition = {
  name: "web_search",
  category: "search",
  description: "Search the public web and return an answer with citations.",
  enabled: Boolean(researchProviderAvailable()),
  dangerous: false,
  // Read-only, but everything it returns is attacker-authorable content.
  capabilities: { readsPrivate: false, acceptsUntrusted: true, communicatesExternally: false },
  permissions: [{ scope: "web:read", description: "Read public web content" }],
  inputSchema: z.object({ query: z.string().min(2) }),
  outputSchema: z.object({ answer: z.string(), citations: z.array(z.any()) }),
  async execute(input) {
    const r = await runResearch(input.query);
    return { answer: r.answer, citations: r.citations };
  },
};

// --- Gmail ------------------------------------------------------------------
const gmailReadTool: ToolDefinition = {
  name: "gmail_read",
  category: "email",
  description: "Read and search recent Gmail messages (read-only).",
  enabled: composioConfigured("gmail"),
  dangerous: false,
  // Private data AND untrusted content — email bodies are attacker-authorable.
  capabilities: { readsPrivate: true, acceptsUntrusted: true, communicatesExternally: false },
  permissions: [{ scope: "gmail.readonly", description: "Read email" }],
  inputSchema: z.object({ max: z.number().int().min(1).max(50).optional() }),
  outputSchema: z.object({ emails: z.array(z.any()) }),
  async execute(input, ctx) {
    const conn = await requireConnection(ctx, "gmail");
    const emails = await fetchRecentEmails(
      conn.entityId,
      input.max ?? 8,
      conn.connectedAccountId,
    );
    return { emails };
  },
};

const gmailDraftTool: ToolDefinition = {
  name: "gmail_draft",
  category: "email",
  description: "Create a Gmail draft in your own mailbox (never sends).",
  enabled: composioConfigured("gmail"),
  dangerous: false,
  // A draft stays inside the user's mailbox — no external communication yet.
  capabilities: { readsPrivate: true, acceptsUntrusted: false, communicatesExternally: false },
  permissions: [{ scope: "gmail.compose", description: "Create drafts" }],
  inputSchema: z.object({ to: z.string().email(), subject: z.string().min(1), body: z.string().min(1) }),
  outputSchema: z.object({ draftId: z.string() }),
  async execute(input, ctx) {
    const conn = await requireConnection(ctx, "gmail");
    return await createDraft({
      entityId: conn.entityId,
      connectedAccountId: conn.connectedAccountId,
      ...input,
    });
  },
};

const gmailSendTool: ToolDefinition = {
  name: "gmail_send",
  category: "email",
  description: "Send an email via Gmail. Always requires explicit confirmation.",
  enabled: composioConfigured("gmail"),
  dangerous: true,
  capabilities: { readsPrivate: true, acceptsUntrusted: false, communicatesExternally: true },
  permissions: [{ scope: "gmail.send", description: "Send email on your behalf" }],
  inputSchema: z.object({ to: z.string().email(), subject: z.string().min(1), body: z.string().min(1) }),
  outputSchema: z.object({ ok: z.boolean() }),
  async execute(input, ctx) {
    requireConfirmed(ctx, "Send email");
    const conn = await requireConnection(ctx, "gmail");
    return await sendEmail({
      entityId: conn.entityId,
      connectedAccountId: conn.connectedAccountId,
      ...input,
      confirmed: true,
    });
  },
};

// --- Google Calendar ---------------------------------------------------------
const calendarCreateTool: ToolDefinition = {
  name: "calendar_create",
  category: "calendar",
  description: "Create a Google Calendar event (invites reach attendees). Requires confirmation.",
  enabled: composioConfigured("google_calendar"),
  dangerous: true,
  capabilities: { readsPrivate: true, acceptsUntrusted: false, communicatesExternally: true },
  permissions: [{ scope: "calendar.events", description: "Create/modify events" }],
  inputSchema: z.object({
    summary: z.string().min(1),
    start_datetime: z.string().min(4),
    end_datetime: z.string().min(4),
    attendees: z.array(z.string().email()).optional(),
    description: z.string().optional(),
  }),
  outputSchema: z.object({ event: z.any() }),
  async execute(input, ctx) {
    requireConfirmed(ctx, "Create calendar event");
    const conn = await requireConnection(ctx, "google_calendar");
    const event = await composioExecute({
      toolSlug: "GOOGLECALENDAR_CREATE_EVENT",
      entityId: conn.entityId,
      connectedAccountId: conn.connectedAccountId,
      args: input as Record<string, unknown>,
    });
    return { event };
  },
};

// --- Google Drive (read-only) -------------------------------------------------
const driveTool: ToolDefinition = {
  name: "google_drive",
  category: "storage",
  description: "Find and read Google Drive files (read-only).",
  enabled: composioConfigured("google_drive"),
  dangerous: false,
  capabilities: { readsPrivate: true, acceptsUntrusted: true, communicatesExternally: false },
  permissions: [{ scope: "drive.readonly", description: "Read Drive files" }],
  inputSchema: z.object({ query: z.string().min(1) }),
  outputSchema: z.object({ files: z.any() }),
  async execute(input, ctx) {
    const conn = await requireConnection(ctx, "google_drive");
    const files = await composioExecute({
      toolSlug: "GOOGLEDRIVE_FIND_FILE",
      entityId: conn.entityId,
      connectedAccountId: conn.connectedAccountId,
      args: { query: input.query },
    });
    return { files };
  },
};

// --- Slack -------------------------------------------------------------------
const slackTool: ToolDefinition = {
  name: "slack",
  category: "chat",
  description: "Post a message to a Slack channel. Requires confirmation.",
  enabled: composioConfigured("slack"),
  dangerous: true,
  capabilities: { readsPrivate: true, acceptsUntrusted: false, communicatesExternally: true },
  permissions: [{ scope: "chat:write", description: "Post messages" }],
  inputSchema: z.object({ channel: z.string().min(1), text: z.string().min(1) }),
  outputSchema: z.object({ result: z.any() }),
  async execute(input, ctx) {
    requireConfirmed(ctx, "Post to Slack");
    const conn = await requireConnection(ctx, "slack");
    const result = await composioExecute({
      toolSlug: "SLACK_SEND_MESSAGE",
      entityId: conn.entityId,
      connectedAccountId: conn.connectedAccountId,
      args: { channel: input.channel, text: input.text },
    });
    return { result };
  },
};

// --- Notion (read-only) --------------------------------------------------------
const notionTool: ToolDefinition = {
  name: "notion",
  category: "storage",
  description: "Search and read Notion pages (read-only).",
  enabled: composioConfigured("notion"),
  dangerous: false,
  capabilities: { readsPrivate: true, acceptsUntrusted: true, communicatesExternally: false },
  permissions: [{ scope: "notion.read", description: "Read pages" }],
  inputSchema: z.object({ query: z.string().min(1) }),
  outputSchema: z.object({ pages: z.any() }),
  async execute(input, ctx) {
    const conn = await requireConnection(ctx, "notion");
    const pages = await composioExecute({
      toolSlug: "NOTION_SEARCH_NOTION_PAGE",
      entityId: conn.entityId,
      connectedAccountId: conn.connectedAccountId,
      args: { query: input.query },
    });
    return { pages };
  },
};

// --- GitHub (read-only issues/PRs) ----------------------------------------------
const githubTool: ToolDefinition = {
  name: "github",
  category: "code",
  description: "List issues in a GitHub repository (read-only; writes stay manual).",
  enabled: composioConfigured("github"),
  dangerous: false,
  // Issue/PR text is attacker-authorable (the GitHub-MCP exfil incident vector).
  capabilities: { readsPrivate: true, acceptsUntrusted: true, communicatesExternally: false },
  permissions: [{ scope: "repo:read", description: "Read repositories and issues" }],
  inputSchema: z.object({ owner: z.string().min(1), repo: z.string().min(1) }),
  outputSchema: z.object({ issues: z.any() }),
  async execute(input, ctx) {
    const conn = await requireConnection(ctx, "github");
    const issues = await composioExecute({
      toolSlug: "GITHUB_LIST_REPOSITORY_ISSUES",
      entityId: conn.entityId,
      connectedAccountId: conn.connectedAccountId,
      args: { owner: input.owner, repo: input.repo },
    });
    return { issues };
  },
};

// --- Deferred integrations (declared, not wired) ---------------------------
// These stay stubs because no safe execution path exists yet (no sandbox /
// no implementation) — enabling them without one would be a fake feature.
function stub(
  name: string,
  category: ToolCategory,
  description: string,
  dangerous: boolean,
  capabilities: CapabilityFlags,
  permissions: ToolPermission[],
): ToolDefinition {
  return {
    name,
    category,
    description,
    enabled: false,
    dangerous,
    capabilities,
    permissions,
    inputSchema: z.any(),
    outputSchema: z.any(),
  };
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  webSearchTool,
  gmailReadTool,
  gmailDraftTool,
  gmailSendTool,
  calendarCreateTool,
  driveTool,
  slackTool,
  notionTool,
  githubTool,
  stub(
    "browser",
    "browser",
    "Automate a browser (needs a sandbox before it can be enabled).",
    true,
    { readsPrivate: true, acceptsUntrusted: true, communicatesExternally: true },
    [{ scope: "browser.control", description: "Control a browser session" }],
  ),
  stub(
    "postgres",
    "database",
    "Run read queries against a connected Postgres DB (V2).",
    true,
    { readsPrivate: true, acceptsUntrusted: false, communicatesExternally: false },
    [{ scope: "db.read", description: "Query a database" }],
  ),
  stub(
    "reddit",
    "social",
    "Read Reddit as a sentiment/trend signal (V2).",
    false,
    { readsPrivate: false, acceptsUntrusted: true, communicatesExternally: false },
    [{ scope: "reddit.read", description: "Read public posts" }],
  ),
  stub(
    "x_twitter",
    "social",
    "Read X/Twitter as a sentiment/trend signal (V2).",
    false,
    { readsPrivate: false, acceptsUntrusted: true, communicatesExternally: false },
    [{ scope: "x.read", description: "Read public posts" }],
  ),
];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export function enabledTools(): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => t.enabled);
}
