# Fibo Audit Report

Independent audit of the Aria Personal AI OS, cross-checking prior work by Claude Opus 4.8
and ChatGPT 5.5 against the full product spec. Date: 2026-07-09.

## 1. Project Summary

**Aria** — a Next.js 14 personal AI workspace: streaming chat with modes (general /
knowledge / research), project spaces, document upload → RAG with validated citations,
user-controlled memory, reports with PDF export, an agent task engine with a plan →
execute → pause-for-approval → resume loop, an Approval Inbox, Composio-based tool
connections (Gmail triage/draft/send live), browser voice (STT/TTS), and a privacy-safe
admin error portal. Multi-tenant-ready via workspaces + Postgres RLS. A sibling Python
repo (`personal-ai-empire`) holds the multi-agent/LangGraph work and is out of scope here.

## 2. Current Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 14 (App Router), React 18, Tailwind, custom shadcn-style UI kit |
| Backend | Next.js Route Handlers (Node runtime), Zod validation |
| Database | Supabase Postgres + pgvector, 8 migrations, RLS on every private table |
| Auth | Supabase SSR auth; workspace-scoped sessions; admin via `ADMIN_EMAIL` allowlist |
| AI | Vercel AI SDK, provider abstraction (OpenAI / Anthropic / Google), Perplexity/Tavily research |
| Connectors | Composio (OAuth vault external to the app) |
| Package manager | npm |
| Tests | Vitest — 37 unit tests (risk, approval policy, chunking, citations, sanitization, editor) |
| Deployment | Not configured yet (builds green locally; Vercel-shaped) |

## 3. What Is Already Good (verified, not rebuilt)

- **Error handling** — `AppError` + `apiError` wrappers on every route, global/route error
  boundaries, toasts, no raw stack traces to users. Genuinely consistent.
- **Security foundation** — RLS everywhere, service-role key server-only, secret/PII
  redaction before logging (`sanitizeForLog`), file validation, private storage bucket,
  memory secret-guard, fail-closed admin gate.
- **RAG pipeline** — upload → extract (PDF/DOCX/TXT/MD/CSV/JSON) → chunk (tested) →
  embed → pgvector retrieval → citation-validated answers.
- **Task engine data model** — `agent_tasks` / `agent_task_steps` / `approvals` with all
  required statuses (`queued`…`cancelled`), `max_steps` runaway guard, audit logging.
- **Graceful degradation** — every keyed feature checks `configured.*` and shows a clean
  "not configured" state. No fake-working integrations.
- **Honest docs** — README / ARCHITECTURE / SECURITY / MVP_CHECKLIST / HANDOFF match the
  code unusually well (claims spot-checked against source).

## 4. What Is Missing (vs. the Personal AI OS vision)

- Real execution of approved actions in the agent loop (simulated by design until wired
  to connectors — the Gmail connector already exists, so this is the natural next step).
- Background task runner (tasks run inline in the request; `maxDuration 120s`).
- Contacts / relationship manager (no tables or UI).
- MCP client + server registry.
- Admin analytics beyond errors (usage, cost, tool logs, approval log view).
- Rate limiting on chat/upload/research/task endpoints.
- E2E tests (fixtures exist; no specs).
- Level-3 approval step-up (2FA/re-auth) — level 3 currently behaves like level 2.

## 5. What Was Weak or Below Standard (found this audit)

1. **`changes_requested` executed the action** — `lib/agent/runtime.ts` treated any
   non-pending/non-rejected approval as approved, so clicking "Request changes" performed
   the risky step exactly like "Approve". **Safety bug — fixed.**
2. **Level 4 "Blocked" actions were approvable** — the runtime created a normal approval
   for level-4 (secret-exposure) steps and executed them on approve. The spec says level 4
   never runs. **Safety bug — fixed at three layers (runtime, API, UI).**
3. **Approval Inbox didn't resume tasks** — approving stamped the task `running` but
   nothing executed it, leaving a lying status. **Fixed** (approve → task `queued` +
   auto-resume call; the inbox now behaves like the task page).
4. **Fake demo components in the tree** — a mock "Live Technician Feed" with stock avatars,
   a fake map, fake job queue/stats/status/timeline (Stitch template leftovers), plus an
   unused Three.js viewer, WebGL shader, and a duplicate Sidebar/TopBar. None imported
   anywhere, but they violate the "no fake features" standard and dragged `three` (~1MB)
   as a production dependency. **Deleted 12 files, removed 2 dependencies.**
5. **Personal email committed in `.env.example`** as the ADMIN_EMAIL default. **Blanked.**

## 6. Duplicated or Conflicting Systems

- `components/Sidebar.tsx` + `components/TopBar.tsx` duplicated the real
  `components/app-sidebar.tsx` / `components/page-shell.tsx` — removed (unused).
- Two agent systems exist by design: `agent_runs` (pipeline/loop content agents) and
  `agent_tasks` (the approval-gated task engine). They serve different purposes and don't
  conflict, but long-term they should converge on the task engine. Documented, not merged.
- Root-level `convert_html.js` / `download_stitch.js` / `stitch-screens/` are one-off
  design-scrape tooling, not app code. Left in place (harmless), flagged as candidates
  for removal or a `design/` folder.

## 7. Security and Privacy Issues

- **Fixed:** the two approval-bypass paths above (items 1–2 in §5).
- **OK:** `.env.local` is git-ignored and untracked; no secrets in the repo (checked).
- **OK:** OAuth tokens never touch Aria's DB (held in Composio's vault).
- **Open (documented):** no rate limiting; no approval expiry job; prompt-injection
  guardrails on tool outputs not yet in place (matters once real tool execution lands);
  Level-3 lacks step-up auth. All tracked in `AI_AGENT_TODO.md`.

## 8. UX and Design Issues

- Approval Inbox previously dead-ended after approving (no resume) — fixed.
- Level-4 approvals showed a normal Approve button — now shows "Blocked by policy".
- Remaining (minor, tracked): no deep-link from an approval card to its task; no
  conversation rename/delete; research mode lacks confidence labels.

## 9. Reliability Issues

- Inline task execution can hit serverless timeouts on long tasks (queue is the fix, P1 on
  the roadmap). `max_steps` guard verified present.
- No retry/backoff around provider calls (documented next task).
- Tests: 37 unit tests pass; typecheck clean; production build green. No e2e yet.

## 10. Priority Fixes (recommended order)

1. Wire approved steps to real connector execution — start with Gmail **draft** (P1).
2. Background runner + rate limiting (P1).
3. Contacts + agent-role registry into chat (P2).
4. Admin usage/cost/approval analytics (P3).
5. MCP registry, browser automation, realtime voice (P4 — after the core loop is real).

## 11. What Fibo Improved (this session)

- **`lib/agent/approval-policy.ts` (new)** — single pure source of truth for "can this
  step run?": only `approved` executes; `changes_requested` skips with a note; `rejected`
  cancels; unknown statuses fail safe; level 4 always blocked. 11 new unit tests.
- **`lib/agent/runtime.ts`** — uses the policy; level-4 steps are skipped with a
  "blocked by policy" note and never create approvals.
- **`app/api/approvals/[id]/route.ts`** — refuses `approve` on level-4; `approve`/
  `request_changes` set the task to `queued` (honest status) instead of `running`.
- **`components/approvals/approvals-client.tsx`** — approving auto-resumes the linked
  task with progress toasts; level-4 cards show a blocked notice instead of Approve.
- **Deleted dead/fake UI** — 7 fake-data dashboard components, Shader, ThreeJSViewer,
  duplicate Sidebar/TopBar, orphaned glass-card; dropped `three` + `@types/three`.
- **Docs** — added `docs/APPROVAL_SYSTEM.md`, `MEMORY_SYSTEM.md`, `INTEGRATIONS.md`,
  `ADMIN_DASHBOARD.md`, `VOICE_SYSTEM.md` (was referenced but missing), `ROADMAP.md`.
  Root `ARCHITECTURE.md` / `SECURITY.md` already covered their ground — not duplicated.
- **Hygiene** — blanked the personal email in `.env.example`; updated `AI_AGENT_TODO.md`.

## 11b. Second pass (same day, on user request — "finish everything")

- **First real approved action:** `lib/agent/execute.ts` — approved email steps compose a
  draft and create a **real Gmail draft** when Gmail is connected (never auto-send;
  recipient must appear in the user's own task text; connector failures degrade to an
  honest note and are logged).
- **Rate limiting:** `lib/security/rate-limit.ts` on chat / research / upload / task-run /
  email-action routes, friendly 429s, 4 unit tests.
- **Contacts foundation:** migration `0009_contacts.sql`, CRUD API, `/contacts` page with
  search, tags, relationship notes, follow-up nudges; sidebar link.
- **Approval UX:** Level-3 two-step confirm (inbox + task page); approval → task deep-link.
- **Admin overview:** tasks-by-status, approvals-by-status, recent audit actions
  (metadata only — no content).
- **Retry/backoff:** `lib/net/retry.ts` on idempotent calls only (embeddings, research,
  Composio GETs); side-effecting calls deliberately never retried.

## 12. What Still Remains

See §4 and §10; per-item status with files and priorities lives in
[`AI_AGENT_TODO.md`](./AI_AGENT_TODO.md). Remaining top items: background task runner,
non-email action execution, role registry wired into chat, e2e tests. The user-facing
test checklist is in [`docs/HANDOFF.md`](./docs/HANDOFF.md).

> Note: during this session another AI agent was concurrently editing the landing page
> (`app/page.tsx` → `components/landing/eyes-gate`). That work is theirs and was left
> untouched; final verification was run after their component landed.
