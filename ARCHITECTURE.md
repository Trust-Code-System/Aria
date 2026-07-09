# Architecture

Aria is a Next.js App Router application with a clean separation between UI, server logic, and
external providers. The guiding principles: **privacy-first**, **source-grounded**, **provider-
agnostic**, and **tenant-ready** (multi-workspace) from day one — even though the MVP is single-user.

## High-level flow

```
Browser (anon key)                Next.js server (route handlers, RSC)             External
─────────────────                 ─────────────────────────────────────           ────────
login/chat/upload  ──►  middleware (session refresh + route guard)
                        │
                        ├─ Server Components ──► Supabase (RLS as the user)  ──►  Postgres+pgvector
                        │
                        ├─ /api/chat ──► providers.ts ──► streamText  ───────►  OpenAI/Anthropic/Google
                        │                └─ rag.ts ──► match_document_chunks RPC
                        │                └─ memory.ts, prompts.ts
                        │
                        ├─ /api/upload ──► ingestion/pipeline (service role)
                        │                  extract → chunk → embed → store chunks
                        │
                        ├─ /api/research ──► research.ts ──────────────────────►  Perplexity / Tavily
                        │
                        └─ logging/error-log (service role) ──► error_logs / audit_logs
```

## Layers

### `lib/env.ts` + `configured`
Single typed source of truth for configuration. Nothing throws on import; `configured.*` flags let
every feature degrade gracefully when a key is missing.

### `lib/supabase/*`
- `client.ts` — browser client (anon key only).
- `server.ts` — request-scoped server client (RLS as the user) **and** a service-role admin client
  (bypasses RLS; used only in trusted jobs and logging, always scoped manually).
- `middleware.ts` — refreshes the session and guards protected route prefixes.

### `lib/auth/guards.ts`
`getSessionContext()` resolves the user + their default workspace (bootstrapping profile/workspace
if needed). `requireSession` / `requireAdmin` for pages; `requireSessionApi` / `requireAdminApi`
for route handlers (throw `AppError` instead of redirecting).

### `lib/ai/*` — the AI core
- `providers.ts` — **the only place providers are instantiated.** A model id is `"<provider>:<model>"`.
  Add a provider = add one `case`. `resolveUsableChatModelId` picks a working provider if the
  default's key is absent.
- `prompts.ts` — server-only system prompts per mode (general, knowledge, research, report,
  improve, code) + context/citation rendering.
- `embeddings.ts` — embedding abstraction (dimension must match the DB).
- `rag.ts` — embed query → `match_document_chunks` → retrieved chunks; plus `hasUsableContext`
  (hallucination guard) and `validateCitations` (eval).
- `research.ts` — web research provider abstraction (Perplexity or Tavily).
- `memory.ts` — fetch approved memories for context injection.
- `types.ts` — shared `Citation`, `RetrievedChunk`.
- `tools.ts` — **MCP/tool registry** (see below).

### `lib/ingestion/*`
`extract.ts` (PDF via pdf-parse, DOCX via mammoth, text/markdown/csv/json) → `chunk.ts`
(overlapping, page-aware, boundary-respecting) → `pipeline.ts` (orchestrates extract → chunk →
embed → store, updating `ingestion_status` and logging failures).

### `lib/reports/pdf.ts`
Report content (Markdown) → self-contained, styled, print-ready HTML. Export uses the browser's
native print-to-PDF, so there is **no Chromium/Puppeteer dependency**. The same HTML renderer is the
extension point for a server-side PDF binary later (Playwright/react-pdf) behind the same interface.

### `lib/logging/error-log.ts` + `lib/api.ts`
`apiError()` converts any thrown error into a user-safe JSON envelope **and** writes a sanitized
metadata record to `error_logs` with a trace id. `sanitizeForLog` strips secrets/PII. `logAudit`
records important/dangerous actions.

## Data model

All private tables carry `workspace_id` (+ `user_id`, and `project_id` where relevant) and are
protected by RLS via `is_workspace_member(workspace_id)`. Key tables: `workspaces`,
`workspace_members`, `projects`, `conversations`, `messages`, `documents`, `document_chunks`
(pgvector), `memories`, `reports`, `feedback`, `jobs`, `error_logs`, `audit_logs`.

Vector search is a `SECURITY INVOKER` RPC (`match_document_chunks`) so RLS still applies, plus an
explicit membership check and workspace/project filters.

## Modes

The chat mode drives prompt + retrieval:
- **general** — model + memories + project context.
- **knowledge** — retrieve chunks, answer only from them, cite `[n]`, refuse if nothing relevant.
- **research** — call the web research provider, synthesize + cite web sources.
- **report / improve / code** — specialized prompts.

## Tool / MCP architecture (`lib/ai/tools.ts`)

A typed registry describes each integration: `name`, `category`, `description`, `enabled`,
`dangerous`, `permissions`, `inputSchema`, `outputSchema`, and (when enabled) `execute`. The MVP
wires **web search** (read-only). Everything else — GitHub, Gmail, Drive, Calendar, Slack, Notion,
browser automation, Postgres, Reddit, X — is declared as a **disabled, typed stub** so the UI and
permission model exist without pretending the integration works.

**Dangerous actions** (send email, delete, write to GitHub, schedule events, submit forms,
payments, social posts) set `dangerous: true`, which requires an explicit confirmation
(`ToolExecContext.confirmed`) before execution. This is the seam for future MCP servers and
multi-agent workflows without rewriting the app.

## Deferred (V2+)
X/Twitter, Reddit, Gmail/Drive/Calendar/Slack automation, browser automation, autonomous
multi-agent loops, billing, and team SaaS features are intentionally out of the MVP. They are
represented as architecture (tool stubs) only. Reddit/X, when added, are treated as **sentiment/
trend signals, not truth.**
