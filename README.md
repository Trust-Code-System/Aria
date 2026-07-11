# Aria — your private AI workspace

Aria is a private, source-grounded personal AI workspace: a Chief of Staff and Second Brain.
It combines chat, project spaces, a personal knowledge base, RAG with citations, web research
with citations, a user-controlled memory system, professional report/PDF generation, and a
private admin/error portal — built privacy-first and tenant-ready from day one.

> **Status:** MVP. See [`MVP_CHECKLIST.md`](./MVP_CHECKLIST.md) for exactly what works, what's
> partial, and what's intentionally deferred.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind CSS + custom components (shadcn-style) |
| AI | Vercel AI SDK with a provider abstraction (OpenAI / Anthropic / Google / Perplexity) |
| Auth + DB | Supabase (Postgres) with Row Level Security |
| Vectors | pgvector (`vector(1536)`) |
| Storage | Supabase Storage (private bucket, signed access) |
| Research | Perplexity/Sonar or Tavily (pluggable) |
| PDF | Server-rendered print-ready HTML → browser "Save as PDF" (dependency-free) |
| Tests | Vitest |

Everything is modular: no single AI provider is hard-coded, and the app **degrades gracefully**
when optional keys are missing (features show a clear "not configured" state instead of crashing).

## Quick start

### Desktop & Chrome extension

Install Aria like an app, or use the Gemini-style side panel:

→ **[`docs/INSTALL_DESKTOP_AND_EXTENSION.md`](./docs/INSTALL_DESKTOP_AND_EXTENSION.md)**  
→ Extension source: [`extension/`](./extension/)

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in at minimum:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- One LLM key: `OPENAI_API_KEY` (recommended — also powers embeddings), or Anthropic/Google
- Optional: `PERPLEXITY_API_KEY` or `TAVILY_API_KEY` for web research
- `ADMIN_EMAIL` — comma-separated emails allowed into `/admin`

### 3. Set up the database

Create a Supabase project, then run the migrations in order (SQL editor, or `supabase db push`):

```
supabase/migrations/0001_init.sql        -- tables, pgvector, triggers, new-user bootstrap
supabase/migrations/0002_rls.sql         -- Row Level Security policies
supabase/migrations/0003_match_chunks.sql-- vector search RPC
supabase/migrations/0004_storage.sql     -- private 'documents' bucket + policies
```

> The embedding dimension is **1536** (OpenAI `text-embedding-3-small`). If you change the
> embedding model, update the `vector(1536)` columns and the RPC signature to match.

### 4. Run

```bash
npm run dev
# http://localhost:3000
```

Sign up with your email, and a "Personal" workspace is created automatically.

## Testing each feature

| Feature | How to test |
| --- | --- |
| Auth | Sign up / out / in at `/login`; protected routes redirect when logged out |
| Projects | `/projects` → create, open, edit instructions, archive, delete |
| Chat + streaming | `/chat` → send a message; response streams token-by-token |
| Knowledge upload + ingestion | `/knowledge` → drop a PDF/TXT/MD; status badge goes pending → indexed |
| RAG + citations | Chat in **Knowledge** mode; answers cite `[1]`, `[2]` mapped to source cards |
| Hallucination guard | Ask Knowledge mode something not in your files → it says it couldn't find it |
| Web research | Chat in **Research** mode (needs a research key) → cited answer with source cards |
| Memory | `/memory` → add/edit/disable/delete; approved memories appear in chat context |
| Reports + PDF | `/reports` → generate; open a report → **Export PDF** → browser save dialog |
| Admin portal | `/admin` (admin email only) → error logs, failed ingestions, feedback |
| Feedback/eval | 👍/👎 under any assistant message → shows in `/admin` |
| Designed errors | Kill your LLM key and chat → friendly toast, sanitized admin log, no stack trace |

Unit tests:

```bash
npm test          # chunking, citation validation, sanitization, markdown, provider parsing
npm run typecheck # strict TypeScript
npm run build     # production build
```

## Documentation

- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — build order and decisions
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how the pieces fit + extension points (MCP/tools)
- [`SECURITY.md`](./SECURITY.md) — RLS, secret handling, privacy guarantees
- [`MVP_CHECKLIST.md`](./MVP_CHECKLIST.md) — acceptance criteria status

## Security & privacy highlights

- Row Level Security on every private table; all data scoped by `workspace_id`.
- Service-role key is server-only; the browser uses the anon key only.
- The admin portal logs **sanitized metadata only** — never secrets, raw files, or full prompts.
- Memory refuses to store obvious credentials/secrets and never auto-saves silently.

See [`SECURITY.md`](./SECURITY.md) for the full model.
