import { z } from "zod";

/**
 * Tool / MCP integration architecture.
 *
 * This is the extension point for future integrations (GitHub, Gmail, Drive,
 * Calendar, Slack, Notion, browser automation, Reddit, X, Postgres, ...).
 * The MVP registers only the safe, read-only ones that are actually wired up
 * (web search). Everything else is declared as a typed, disabled stub so the UI
 * and permission model exist without pretending the integration works.
 *
 * Dangerous actions (send email, delete, write to GitHub, schedule events,
 * submit forms, payments, social posts) MUST set `dangerous: true`, which forces
 * an explicit user-confirmation step before execution.
 */

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

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  category: ToolCategory;
  description: string;
  /** Whether an API key / connection is configured for this tool. */
  enabled: boolean;
  /** Requires explicit user confirmation before running. */
  dangerous: boolean;
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

import { runResearch, researchProviderAvailable } from "@/lib/ai/research";

// --- Working tool: web search (read-only, safe) ---------------------------
const webSearchTool: ToolDefinition = {
  name: "web_search",
  category: "search",
  description: "Search the public web and return an answer with citations.",
  enabled: Boolean(researchProviderAvailable()),
  dangerous: false,
  permissions: [{ scope: "web:read", description: "Read public web content" }],
  inputSchema: z.object({ query: z.string().min(2) }),
  outputSchema: z.object({ answer: z.string(), citations: z.array(z.any()) }),
  async execute(input: any) {
    const r = await runResearch(input.query);
    return { answer: r.answer, citations: r.citations };
  },
};

// --- Deferred integrations (declared, not wired) --------------------------
function stub(
  name: string,
  category: ToolCategory,
  description: string,
  dangerous: boolean,
  permissions: ToolPermission[],
): ToolDefinition {
  return {
    name,
    category,
    description,
    enabled: false,
    dangerous,
    permissions,
    inputSchema: z.any(),
    outputSchema: z.any(),
  };
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  webSearchTool,
  stub("github", "code", "Read/write GitHub repos, issues, and PRs.", true, [
    { scope: "repo", description: "Access repositories" },
  ]),
  stub("gmail_send", "email", "Send an email via Gmail.", true, [
    { scope: "gmail.send", description: "Send email on your behalf" },
  ]),
  stub("gmail_read", "email", "Read and search Gmail.", false, [
    { scope: "gmail.readonly", description: "Read email" },
  ]),
  stub("google_drive", "storage", "Read/import Google Drive files.", false, [
    { scope: "drive.readonly", description: "Read Drive files" },
  ]),
  stub("calendar_create", "calendar", "Create calendar events.", true, [
    { scope: "calendar.events", description: "Create/modify events" },
  ]),
  stub("slack", "chat", "Read/post to Slack channels.", true, [
    { scope: "chat:write", description: "Post messages" },
  ]),
  stub("notion", "storage", "Read/import Notion pages.", false, [
    { scope: "notion.read", description: "Read pages" },
  ]),
  stub("browser", "browser", "Automate a browser (navigate, fill, scrape).", true, [
    { scope: "browser.control", description: "Control a browser session" },
  ]),
  stub("postgres", "database", "Run read queries against a connected Postgres DB.", true, [
    { scope: "db.read", description: "Query a database" },
  ]),
  stub("reddit", "social", "Read Reddit as a sentiment/trend signal (V2).", false, [
    { scope: "reddit.read", description: "Read public posts" },
  ]),
  stub("x_twitter", "social", "Read X/Twitter as a sentiment/trend signal (V2).", false, [
    { scope: "x.read", description: "Read public posts" },
  ]),
];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export function enabledTools(): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => t.enabled);
}
