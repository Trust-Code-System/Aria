# Roadmap

Priorities follow the Personal AI OS spec: stability → core loop → personal usefulness →
admin/monitoring → advanced. Detailed per-feature status lives in
[`AI_AGENT_TODO.md`](../AI_AGENT_TODO.md).

## Now (core loop hardening)

1. ~~Real tool execution for approved email steps~~ **done** — approved email steps create
   real Gmail drafts via `lib/agent/execute.ts` (needs Composio Gmail config). Next:
   calendar_write and other action types through the same gate.
2. **Background task runner** — move task execution off the request path (queue + retries
   + timeout + cost guards). Tasks currently run inline (fine for short tasks).
3. ~~Rate limiting~~ **done** — `lib/security/rate-limit.ts` on chat/research/upload/
   task-run/email routes (in-memory, single-instance).

## Next (personal usefulness)

4. ~~Contacts foundation~~ **done** (migration `0009_contacts.sql`, `/contacts`, follow-up
   nudges). Next: link contacts to email/task history; draft-message action per contact.
5. Agent-role registry wired into chat (roles with allowed/blocked tools + approval policy —
   schema exists in `0005_agents.sql`).
6. Auto-memory suggestions (post-chat extraction → `suggested` → user approves).
7. Document depth: doc-vs-doc comparison, action-item extraction, signed-URL previews.

## Later (admin + advanced)

8. Admin analytics: usage/cost/model/tool dashboards, approval log view, health checks.
9. MCP client + server registry with risk levels and approval enforcement.
10. Browser automation (Playwright) behind approval stops and CAPTCHA halts.
11. Realtime voice (Deepgram/ElevenLabs/OpenAI Realtime) — env vars already scaffolded.
12. Company role packs (HR / Customer Care / Sales / Finance) on top of the role registry.

## Deliberately deferred

Multi-user team SaaS, billing, native mobile, fine-tuning, plugin marketplace,
always-on recording. The schema is tenant-ready (workspaces + RLS) so none of these
require a rewrite.
