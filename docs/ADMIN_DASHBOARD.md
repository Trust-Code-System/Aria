# Admin Dashboard

Safe monitoring, not spying. `/admin` is restricted to emails in `ADMIN_EMAIL`.

## Access control

- `requireAdmin()` / `requireAdminApi()` in `lib/auth/guards.ts` — non-admins are
  redirected (pages) or get a 403 (API).
- If `ADMIN_EMAIL` is unset, **nobody** is admin (fail closed).
- Reads use the service-role key server-side only.

## What admin CAN see

- Error logs — sanitized metadata only (`lib/logging/error-log.ts` + `sanitizeForLog`):
  area, category, trace id, redacted message. Secrets, emails, JWTs, and API-key-shaped
  strings are stripped by pattern before writing.
- Failed ingestion summaries, user feedback (👍/👎), audit log entries
  (action + target type/id, not payloads).

## What admin can NOT see

Private chat content, document contents, memory contents, email bodies, OAuth tokens,
API keys, full prompts. These are never written to the log tables in the first place —
the protection is at write time, not display time.

## Known gaps (tracked in AI_AGENT_TODO.md)

- Usage/cost/model analytics, tool-usage dashboards, approval-log view, workspace
  management, system health checks — planned (Priority 4).
