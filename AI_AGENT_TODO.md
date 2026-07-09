# Personal AI OS — Implementation TODO

## Legend
- `[x]` Done / verified in the codebase
- `[~]` Partial / needs improvement
- `[ ]` Missing / not started
- `[!]` Blocked / requires credentials or a product decision

## Audit Summary
- **Date:** 2026-07-09
- **App:** Aria — "a private, source-grounded personal AI workspace (Chief of Staff + Second Brain)"
- **Frontend:** Next.js 14.2 (App Router) + React 18 + TailwindCSS 3.4, custom `components/ui` design system (glass tokens), `lucide-react` icons
- **Backend:** Next.js Route Handlers (`app/api/**`, Node runtime). No separate Python service — LangGraph/CrewAI live in the sibling `personal-ai-empire` repo.
- **AI layer:** Vercel AI SDK (`ai@3.4`) with `@ai-sdk/anthropic|openai|google`; model routing in `lib/ai/providers.ts`
- **Database:** Supabase Postgres + pgvector; migrations `0001_init`→`0007_connections`; RLS enabled (`0002_rls`)
- **Auth:** Supabase SSR auth (`lib/auth/guards.ts`, `middleware.ts`); multi-tenant via `workspace_id`
- **Vector/RAG:** pgvector + `0003_match_chunks` RPC; retrieval in `lib/ai/rag`, ingestion in `lib/ingestion/*`
- **Storage:** Supabase Storage private `documents` bucket (`0004_storage`)
- **Tests:** Vitest (`tests/unit.test.ts`, `vitest.config.ts`)
- **Missing core systems vs. the Personal AI OS spec:** structured multi-step task engine, approval inbox, background task runner, contacts/CRM, agent-role registry UI, voice, admin dashboard beyond error log, notifications.

> **Note:** This app is already a strong *source-grounded chat workspace*. It is NOT yet a
> multi-agent, task-oriented "AI OS". Many groups below are `[~]` because a solid primitive
> exists (auth, RAG, memory, uploads, error logging) but the agentic task/approval loop is absent.

---

## Feature Checklist

### Group 1 — Core Agent Engine
`[~]` Partial — **data/state layer now exists; execution runtime still to build.**
- **Exists:** single-shot streaming chat with modes — `app/api/chat/route.ts`, `lib/ai/prompts.ts`; `research` tool + `lib/ai/tools.ts`; per-mode RAG/web context; `llm_training_logs` distillation.
- **Added this session:** durable task model — `agent_tasks` + `agent_task_steps` tables
  (`supabase/migrations/0008_agent_tasks.sql`) with status states, `max_steps` runaway guard,
  and cost columns; types in `lib/agent/types.ts`; API `POST/GET /api/agent/tasks`,
  `GET/PATCH /api/agent/tasks/:id`; Tasks dashboard at `/tasks`.
- **Added (runtime):** `lib/agent/runtime.ts` — Planner (LLM → JSON step plan, heuristic
  fallback) + Executor that runs safe steps via the app's LLM/research, **creates an approval
  and parks the task at a risky step**, resumes on approve (auto-continues), skips on reject,
  and honors the `max_steps` guard. Pure risk classifier `lib/agent/risk.ts` (7 unit tests).
  `POST /api/agent/tasks/:id/run`; task detail timeline at `/tasks/:id`.
- **Missing:** real tool *execution* of approved actions (currently simulated — no real
  send/charge until Group 6 connectors land); async/background execution (runs inline in the
  request today); evaluation agent; multi-agent delegation to `personal-ai-empire` over MCP.
- **Priority:** V1 · **Difficulty:** Very High · **Status:** loop works end-to-end (safe by construction)

### Group 2 — TODO & Roadmap System
`[x]` Done — this file. Kept updated as work proceeds.

### Group 3 — Human-in-the-Loop Approval System
`[~]` **Data layer + inbox implemented** (needs migration 0008 applied + an agent runtime to generate approvals).
- **Done:** `approvals` table with risk levels 0–4 (`supabase/migrations/0008_agent_tasks.sql`),
  `lib/agent/types.ts` (risk ladder), API `GET /api/approvals` + `POST /api/approvals/:id`
  (approve / reject / request_changes, audit-logged, safe_metadata only), Approval Inbox UI
  at `/approvals` (`components/approvals/approvals-client.tsx`), sidebar link.
- **Missing:** an agent runtime that actually *creates* approvals mid-task; Level-3 admin/2FA
  step-up; deep-link from an approval to its task/step.
- **Priority:** MVP · **Difficulty:** High

### Group 4 — Background Task Runner
`[~]` Partial.
- **Exists:** a `jobs` concept referenced in `app/api/upload/route.ts` comments; ingestion runs inline.
- **Missing:** queue, task states, progress timeline, retries, timeout/max-step/max-cost guards, resume-after-approval.
- **Priority:** V1 · **Difficulty:** High

### Group 5 — Memory System
`[~]` Partial — good foundation.
- **Exists:** `lib/ai/memory.ts` (`getContextMemories`), `memories` surfaced in chat, `app/api/memory/route.ts`, memory UI (`components/memory/memory-client.tsx`).
- **Missing:** explicit memory *types* (relationship/company/tool), sensitivity levels, tenant-vs-personal split, memory-write audit, "don't store secrets" guard.
- **Priority:** V1 · **Difficulty:** Medium

### Group 6 — Tool Integrations
`[~]` Partial — scaffolding present.
- **Exists:** `0007_connections.sql` migration + `app/(app)/connections/` + `lib/connectors/` + `app/api/connections/` (untracked, in progress). Research/web tool in `lib/ai/research.ts`.
- **Missing:** concrete Gmail/Calendar/Drive/Slack/GitHub connectors, read/write approval boundaries, tool-usage logging.
- **Priority:** V1 · **Difficulty:** High · **Blocked bits:** `[!]` OAuth client IDs/secrets per provider.

### Group 7 — MCP Support
`[ ]` Not in Aria. (The sibling repo exposes an MCP server.)
- **To build:** MCP client + `mcp_servers` registry table + admin health view.
- **Priority:** V2 · **Difficulty:** High

### Group 8 — Email Agent
`[!]` Blocked — needs Gmail/Outlook OAuth. No email code yet.
- **Priority:** V1 · **Difficulty:** High

### Group 9 — Calendar Agent
`[!]` Blocked — needs Google/Microsoft Calendar OAuth. No calendar code yet.
- **Priority:** V1 · **Difficulty:** High

### Group 10 — File / Document Agent
`[x]` Done (core) / `[~]` for advanced.
- **Exists & verified:** upload → validate (`lib/security/sanitize.ts`) → store → extract (`lib/ingestion/extract.ts`: PDF via pdf-parse, DOCX via mammoth, txt/md/csv/json) → chunk (`lib/ingestion/chunk.ts`) → embed → RAG. UI: `components/knowledge/upload-zone.tsx`, `document-list.tsx`, `app/api/documents`, `app/api/upload`, `app/api/ingest`.
- **Missing:** doc-vs-doc comparison, action-item extraction, richer document detail page.
- **Priority:** V1 (advanced) · **Difficulty:** Medium

### Group 11 — Web Research Agent
`[~]` Partial.
- **Exists:** `lib/ai/research.ts` + `app/api/research/route.ts` + research chat mode with citations.
- **Missing:** reliability labels, confidence, gaps section, export-to-report from research, topic monitoring.
- **Priority:** V1 · **Difficulty:** Medium

### Group 12 — Browser Automation Agent
`[~]` Partial (dependency only).
- **Exists:** `playwright` in devDependencies; `tests/e2e/` present.
- **Missing:** any runtime browser-agent, approval stops, screenshots/step logs.
- **Priority:** V2 · **Difficulty:** High

### Group 13 — Voice Assistant
`[~]` Partial — **implemented this session (baseline).**
- **Added:** mic push-to-talk speech-to-text (Web Speech API) in the composer; "read aloud" TTS on assistant messages (`speechSynthesis`); provider abstraction `lib/voice/providers.ts`.
- **Blocked upgrade:** `[!]` realtime/high-quality voice (OpenAI Realtime, Deepgram, ElevenLabs, LiveKit) — env vars added to `.env.example`, integration pending keys.
- **Priority:** V1 · **Difficulty:** Medium

### Group 14 — Contact / Relationship Manager
`[ ]` Not implemented. No `contacts` tables/UI.
- **Priority:** V1 · **Difficulty:** Medium

### Group 15 — Company Role Agents
`[~]` Partial (schema only).
- **Exists:** `0005_agents.sql` migration + `app/(app)/agents/` + `lib/ai/agents.ts` + `components/agents/` (untracked/in progress).
- **Missing:** role registry with allowed/blocked tools + approval policy + prompt routing wired into chat.
- **Priority:** V1 · **Difficulty:** High

### Groups 16–20 — HR / Customer Care / Sales-CRM / Admin-Ops / Software Engineer agents
`[ ]` Not implemented as distinct roles. Depend on Group 15 registry + Group 6 integrations.
- **Priority:** V2 · **Difficulty:** High

### Group 21 — Admin Dashboard
`[~]` Partial.
- **Exists:** admin error surface — `app/(app)/admin/page.tsx`, `app/api/admin/errors/route.ts`, `components/admin/admin-errors.tsx`, privacy-safe logging (`lib/logging/error-log.ts`, `sanitizeForLog`).
- **Missing:** usage/cost/model/tool analytics, approvals log view, workspace management, feature flags, health.
- **Priority:** V1 · **Difficulty:** Medium

### Group 22 — UI / UX
`[~]` Partial — **chat composer upgraded this session.**
- **Exists:** dashboard, chat, reports, projects, memory, connections, agents pages; design system; toasts; empty/loading states.
- **Added this session:** Claude-app-style composer (single rounded bar, attachment button, mic, auto-growing textarea), attachment chips, list auto-continue.
- **Missing:** task dashboard, approval inbox, contacts page, voice page.
- **Priority:** MVP · **Difficulty:** Medium

#### Group 22a — Claude-style chat UX (requested)
`[x]` **Implemented** (composer + thread).
- **Done:** thread restyled to match Claude — assistant messages are full-width and
  borderless; user messages sit in a right-aligned rounded bubble; per-message action
  buttons reveal on hover (`sm:group-hover`); avatars and hard dividers removed for a
  clean reading column (`components/chat/message-item.tsx`, `components/chat/chat.tsx`).
- **Optional later:** message-enter transitions, refined empty state, inline model picker.
- **Priority:** V1 · **Difficulty:** Medium · **Status:** shipped this session

#### Group 22b — Progressive "typing" answer animation (requested)
`[x]` **Implemented.** Real token streaming already existed (`app/api/chat/route.ts`
streams; client reads incrementally). Added a client-side smoothing layer so the
answer always *reads* as typing regardless of how bursty the network chunks are.
- **Done:** `components/chat/use-typewriter.ts` — decouples displayed text from received
  text; reveals at an adaptive cadence (~45–1800 cps, clears backlog in ~0.35s) with an
  inline block cursor (`▌`). Wired into `components/chat/message-item.tsx`; `TypingDots`
  still covers the pre-first-token wait.
- **Optional polish later:** blinking (vs steady) cursor; per-token fade-in.
- **Priority:** V1 · **Difficulty:** Low · **Status:** shipped this session

### Group 23 — Error Handling & Reliability
`[x]` Done (core).
- **Verified:** `lib/errors.ts` (`AppError`), `lib/api.ts` (`apiError/apiOk`), user-safe messages, `app/(app)/error.tsx`, `app/global-error.tsx`, `not-found.tsx`, toast surface. No raw stack traces to users.
- **Missing:** retry/rate-limit wrappers around tool/model calls.
- **Priority:** MVP · **Difficulty:** Low

### Group 24 — Security & Privacy
`[x]`/`[~]` Strong foundation.
- **Verified:** Supabase auth, RLS (`0002_rls`), workspace tenant isolation, secrets via `lib/env.ts`, filename/type/size validation, secret/PII redaction for logs (`sanitizeForLog`), private storage bucket.
- **Missing:** OAuth token encryption at rest (needed once Group 6 lands), explicit prompt-injection guardrails for tool outputs, data-retention/memory-deletion controls surfaced in UI.
- **Priority:** MVP/ongoing · **Difficulty:** Medium

### Group 25 — Industry Packs
`[ ]` Not started. Create config-driven pack structure later.
- **Priority:** Advanced · **Difficulty:** Medium

---

## This Session — Scope
Implementing the four concrete chat requests (they all target the Aria composer):
- `[~]→` **Attachments** (images + documents) with a Claude-style attach button — Group 10/22
- `[ ]→` **List auto-continue** in the composer — Group 22
- `[~]→` **Voice** (STT mic + TTS read-aloud) — Group 13
- `[~]→` **Claude-app-like chat UI** (composer redesign) — Group 22

Statuses above are updated in the **Final Implementation Summary** at the bottom once done.

---

## Final Implementation Summary

> **Session 2 addendum (same day):** shipped the MVP **agent loop** end-to-end —
> `agent_tasks`/`agent_task_steps`/`approvals` (migration 0008, applied), planner/executor
> runtime (`lib/agent/runtime.ts`) with a pure risk classifier (`lib/agent/risk.ts`, tested),
> Tasks dashboard + task detail timeline, Approval Inbox, and a **chat→task delegate** button.
> Also added the **typewriter streaming** effect and the **Claude-style message thread**.
> Verified: typecheck ✅ · lint ✅ · **25 unit tests ✅** · **production build ✅**.
> Approved actions are **simulated** (no real side effects) until connectors land.
> **Everything the user must do next is in [`docs/HANDOFF.md`](docs/HANDOFF.md).**

---

**Session 1 · date:** 2026-07-09 · Scope: the four concrete chat requests + full audit.

### What I found
Aria is already a strong source-grounded chat workspace (auth, RLS multi-tenancy,
RAG, memory, uploads/ingestion, research, reports, admin error log, clean error
handling). It is NOT yet an agentic task/approval OS — those groups remain `[ ]`/`[~]`.

### What was already done (skipped, not rebuilt)
- File upload + ingestion + RAG (Group 10) — verified, reused for chat attachments.
- Memory, research, reports, admin errors, auth/RLS, error handling (Groups 5, 11, 21, 23, 24).

### What I implemented this session
- **Chat attachments** (images + documents) — Claude-style paperclip button, drag-drop,
  paste, preview chips with remove, 6-file limit.
  - `app/api/chat/attachments/route.ts` (new) — server-side document text extraction (no KB persistence).
  - `app/api/chat/route.ts` — accepts `attachments`; folds document text + image parts into the model turn (multimodal).
  - Images: client-side data URLs (PNG/JPEG/WEBP/GIF, ≤8MB); Documents: reuse existing extractor.
- **List auto-continue** in the composer — `lib/editor/list-continuation.ts` (+ 7 unit tests). Shift+Enter on a list line continues it; empty item exits.
- **Voice** — `lib/voice/speech.ts` (mic push-to-talk STT + read-aloud TTS, zero keys) and `lib/voice/providers.ts` (server upgrade path). Mic in composer; "Read aloud" on assistant messages.
- **Claude-app-like composer** — single rounded bar: attach • auto-growing textarea • mic • send; attachment chip row; drag-drop ring.

### Files changed
- New: `AI_AGENT_TODO.md`, `app/api/chat/attachments/route.ts`, `lib/editor/list-continuation.ts`, `lib/voice/speech.ts`, `lib/voice/providers.ts`, `tests/list-continuation.test.ts`
- Edited: `components/chat/chat.tsx`, `components/chat/message-item.tsx`, `app/api/chat/route.ts`, `.env.example`

### Commands run / results
- `npm run typecheck` → **pass** (0 errors)
- `npm run lint` → **pass** (only pre-existing font warnings in `app/layout.tsx`)
- `npm test` → **18 passed** (11 existing + 7 new)

### Blocked (`[!]`)
- Realtime/high-quality voice providers — need `DEEPGRAM_API_KEY` / `ELEVENLABS_API_KEY` / OpenAI Realtime. Browser fallback works now.
- Live click-through of attachments/voice needs a running Supabase project + an LLM key + browser mic permission (not available in this session).
- Email/Calendar agents — need Gmail/Google OAuth.

### Remaining work (priority order)
1. **MVP agent loop:** `agent_tasks`/`agent_task_steps` + Approval Inbox (Groups 1, 3) — or bridge to the `personal-ai-empire` supervisor via MCP.
2. Background task runner with max-step/max-cost guards (Group 4).
3. Contacts/CRM (Group 14) and Agent-role registry wired into chat (Group 15).
4. Admin analytics (usage/cost/tool) beyond the error log (Group 21).

### Recommended next prompt
> "Build the MVP agent task loop: add agent_tasks + agent_task_steps tables, a task
> dashboard at /tasks, and an Approval Inbox at /approvals, reusing the existing
> error-handling and RLS patterns. Wire chat to create a task when a request needs
> multi-step execution."
