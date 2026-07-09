# Integrations

How Aria connects to external tools, and the safety model around them.

## Architecture

One connector platform (Composio) instead of N bespoke OAuth flows:

- **Registry/state:** `connections` table (migration `0007_connections.sql`) — provider,
  status (`pending`/`active`/`error`), account label. Workspace-scoped, RLS.
- **Client:** `lib/connectors/composio.ts` — the ONLY file that touches Composio's REST
  API (initiate OAuth, poll status, execute a tool, disconnect).
- **Routes:** `app/api/connections/*` — initiate (returns a hosted OAuth redirect),
  callback (refreshes status, always redirects, never shows raw JSON), disconnect.
- **UI:** `/connections` — connection status per provider, clean "not configured" states.
- **Tokens:** OAuth tokens live in Composio's vault, **not in Aria's database**. Aria
  stores only connection ids and status. Nothing token-shaped is logged.

## Supported providers (env-gated)

Gmail, Google Drive, Slack, Notion, GitHub, Linear, Jira, Trello, Asana, HubSpot,
Salesforce, Outlook — each enabled by setting its `COMPOSIO_*_AUTH_CONFIG_ID` plus
`COMPOSIO_API_KEY` (see `.env.example`). Missing config → the provider shows a
"not set up yet" state; nothing pretends to work.

## Write-action safety

- Read actions (fetch emails for triage) run on demand.
- Gmail **draft** is the default write (creates a draft, sends nothing).
- Gmail **send** requires explicit confirmation at three layers: UI checkbox → API
  schema (`confirmed: true` required) → `sendEmail()` throws without it. Audit-logged.
- Agent-task actions go through the Approval Inbox (see `APPROVAL_SYSTEM.md`).

## Adding a provider

1. Create the auth config in the Composio dashboard; put its id in `.env.local`.
2. Add the mapping line in `authConfigIdFor()` (`lib/connectors/composio.ts`).
3. Add tool wrappers (like `lib/connectors/gmail.ts`) with explicit-confirmation guards
   on anything that writes.

## MCP

Not yet in Aria. The planned path: an `mcp_servers` registry table + client abstraction,
with the same risk-level + approval enforcement as Composio tools. The sibling
`personal-ai-empire` repo already exposes an MCP server that could become the first entry.
