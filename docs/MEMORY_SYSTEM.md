# Memory System

User-controlled memory: Aria remembers useful preferences and facts, never secrets,
and nothing silently.

## What exists

- **Storage:** `memories` table (migration `0001_init.sql`), workspace-scoped with RLS.
  Fields: `type`, `content`, `source`, `sensitivity`, `approval_status`, optional `project_id`.
- **Types:** `preference`, `project_fact`, `writing_style`, `tool_preference`, `workflow`.
- **API:** `app/api/memory/route.ts` — create / update / enable / disable / delete.
- **UI:** `/memory` (`components/memory/memory-client.tsx`) — full CRUD, filter by
  global vs project.
- **Injection:** `lib/ai/memory.ts` — only `approved` memories (global + active project)
  are folded into the chat system prompt.

## Safety rules

- **Secret guard:** the create endpoint rejects content matching credential patterns
  (password / api key / secret / token / ssn / credit card / cvv) with a friendly message.
- **No silent writes:** memories are created manually or arrive as `suggested` and require
  approval before they influence anything.
- **Tenant isolation:** RLS scopes every row to the workspace; project memories only load
  for that project.
- Admin never sees memory contents (the admin portal reads sanitized error metadata only).

## Known gaps (tracked in AI_AGENT_TODO.md)

- ~~Auto-suggestion extraction after chats~~ **Done (P1):** `lib/ai/memory-suggest.ts`
  inserts `suggested` rows after chat; approve from `/memory` (Suggested filter).
- Explicit relationship/contact memory types (waiting on deeper CRM linking).
- Memory-write audit trail surfaced in the UI.
