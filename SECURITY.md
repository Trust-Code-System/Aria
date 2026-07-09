# Security & Privacy

Aria handles private documents, chats, and memory. Security is built in from the schema up.

## Tenant isolation (RLS)

- Every private table (`projects`, `conversations`, `messages`, `documents`, `document_chunks`,
  `memories`, `reports`, `feedback`, `jobs`) has **Row Level Security enabled**.
- Access is gated by `is_workspace_member(workspace_id)` — a user can only read/write rows in
  workspaces they belong to. Cross-user and cross-workspace access is impossible via the anon key.
- The vector search RPC (`match_document_chunks`) runs `SECURITY INVOKER` (RLS applies) **and**
  re-checks membership + filters by `workspace_id`/`project_id`.
- Storage objects live under `documents/{workspace_id}/…`; storage policies check membership of the
  first path segment.

## Secret handling

- **The service-role key never reaches the browser.** Only `lib/supabase/server.ts` reads it, and
  only for background jobs (ingestion) and admin/error logging where queries are scoped manually.
- The browser only ever uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- LLM/research provider keys are read exclusively in server code (`lib/env.ts` on the server).
- `.env.local` is git-ignored. `.env.example` contains no real values.

## What we log — and what we never log

The admin portal (`error_logs`) stores **sanitized metadata only**:

- allowed: error id, workspace/user/project id, feature area, provider name, error category,
  sanitized message, status code, latency, trace id, resolved flag, timestamp.
- **never logged:** secrets/API keys, raw file contents, full user prompts, full AI responses,
  or private customer/company content.

`sanitizeForLog()` additionally redacts patterns that look like API keys, JWTs, bearer tokens, and
email addresses before anything is written. Logging is best-effort and never throws into the
request path.

## Memory safety

- Memory is **user-controlled**: nothing is stored silently. Auto-extraction (future) creates
  `suggested` records that require explicit approval, never silent permanent storage.
- The memory API rejects content matching credential patterns (password, api key, secret, token,
  SSN, card, CVV) with a clear message.
- Only `approved` memories are injected into chat context.

## Input validation & uploads

- All API inputs validated with Zod.
- Filenames sanitized (path traversal stripped, character set restricted).
- File types allow-listed (PDF/TXT/MD/DOCX/CSV/JSON); empty and oversize files rejected
  (`MAX_UPLOAD_MB`, default 25MB).
- The documents bucket is **private**; access is via server-side/service-role paths, not public URLs.

## Error surface

- No raw stack traces reach users. `AppError` carries a safe `userMessage`; a global error
  boundary, a route-group error boundary, and toasts handle everything else.
- Every real failure produces a trace id the user can quote and that admins can find in the portal.

## Dangerous actions

Tools that send, delete, post, pay, or write to external systems are flagged `dangerous` in the
tool registry and require explicit confirmation before execution. This mirrors the product rule:
**analyze → recommend → confirm → act** for anything outward-facing or irreversible.

## Known limitations (MVP)

- No rate limiting on expensive endpoints yet (documented as a next task; add per-user throttling
  in middleware or via a `jobs`/counter table).
- Ingestion runs inline in the upload request. For large files, move to the `jobs` queue + a worker.
- Email confirmation for signup depends on your Supabase Auth settings.
