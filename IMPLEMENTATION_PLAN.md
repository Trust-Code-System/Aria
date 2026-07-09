# Implementation Plan

## Repository audit (starting point)

The repository was **empty** (no `package.json`, framework, or git). Node 22 / npm 11 available.
Per the product spec, I built the recommended MVP stack from scratch:

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase (Postgres + Auth + Storage) with pgvector and RLS
- Vercel AI SDK with a provider abstraction (OpenAI / Anthropic / Google / Perplexity)

## Build order (executed)

1. **Foundation** — package.json, tsconfig, Tailwind, PostCSS, globals, `.gitignore`, `.env.example`.
2. **Config & utils** — `lib/env.ts` (+ `configured` flags), `lib/utils.ts`, `lib/errors.ts`,
   `lib/security/sanitize.ts`.
3. **Supabase + auth** — browser/server/admin clients, middleware session guard, `lib/auth/guards.ts`.
4. **Database** — 4 migrations: schema+pgvector+triggers, RLS, vector-search RPC, storage bucket.
5. **AI core** — providers, prompts, embeddings, rag, research, memory, tools registry, types.
6. **Ingestion** — extract → chunk → embed → store pipeline.
7. **Reports** — Markdown → print-ready HTML renderer.
8. **Logging** — sanitized error logging + audit logging + `apiError` envelope.
9. **UI primitives** — button, card/input/textarea/badge, states (empty/error/skeleton), toast,
   theme provider.
10. **App shell** — root layout, `(app)` route group with sidebar, global + route error boundaries,
    loading skeletons.
11. **Pages** — landing, login, dashboard, projects (+ detail), chat (+ by id), knowledge, memory,
    reports (+ detail), admin, settings.
12. **API routes** — chat (streaming + RAG + persistence), upload, ingest, research, memory,
    reports (+ export), projects, documents, feedback, admin/errors.
13. **Tests + docs** — Vitest unit tests; README, ARCHITECTURE, SECURITY, MVP_CHECKLIST, this file.

## Key decisions & trade-offs

- **Provider abstraction over hard-coding.** Model ids are `"provider:model"`; one file
  (`lib/ai/providers.ts`) resolves them. Swapping/adding providers is a one-line change.
- **Graceful degradation.** Missing keys never crash the app; `configured.*` flags drive clear
  "not configured" UI. This makes the app runnable and demoable before every key is set.
- **PDF via print-ready HTML** instead of Puppeteer/Chromium. Zero heavy dependency, reliable
  cross-platform, and the HTML renderer is the seam for a server-side PDF binary later.
- **Inline ingestion** for the MVP (upload request runs extract→embed). A `jobs` table exists so
  this can move to a background worker without schema changes.
- **Streaming + citations.** Citations for KB/research are computed *before* generation, so they're
  returned in response headers alongside the streamed body — simple and robust.
- **Tenant-ready now.** Even though single-user, every row is workspace-scoped with RLS, so
  multi-user/team is a policy/UX addition, not a rewrite.

## What was intentionally deferred

See `ARCHITECTURE.md` → "Deferred (V2+)" and `MVP_CHECKLIST.md`. Summary: external integrations
(X, Reddit, Gmail, Drive, Calendar, Slack, GitHub write, browser automation), autonomous
multi-agent loops, billing, and team SaaS features. These exist only as typed tool stubs.
