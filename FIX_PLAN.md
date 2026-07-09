# Fix Plan

Priority order (as specified): security/privacy → auth/db → chat → ingestion → RAG/citations →
admin logs → PDF/reports → UI errors → docs → polish. Status of each after this pass.

| Priority | Item | Status |
| --- | --- | --- |
| 1 | Security/privacy leaks | ✅ Addressed in build — RLS everywhere, sanitized logs, service key server-only, memory secret guard. No leak found. |
| 2 | Broken auth or DB access | ✅ Guards + middleware + bootstrap trigger; RLS policies present. Runtime needs keys. |
| 3 | Broken chat | ✅ Streaming route builds; persistence + citations wired. |
| 4 | Broken file ingestion | ✅ Pipeline builds; failure states logged + surfaced. Fixed pdf-parse import to avoid debug-mode file read. |
| 5 | Broken RAG/citations | ✅ Fixed embedding param to pgvector text literal; citation validation guard + tests. |
| 6 | Broken admin logs | ✅ `logError` best-effort, sanitized; admin portal reads via service role. |
| 7 | Broken PDF/report export | ✅ Print-ready HTML renderer; XSS-escaped; unit-tested markdown→HTML. |
| 8 | Bad UI errors/loading states | ✅ Global + route boundaries; empty/error/skeleton components; toasts. |
| 9 | Missing documentation | ✅ README + ARCHITECTURE + SECURITY + PLAN + CHECKLIST + audit docs. |
| 10 | Low-quality polish | ✅ Consistent design system, dark mode, responsive, source cards. |

## Fixes applied during this pass
1. **pdf-parse import** → import `pdf-parse/lib/pdf-parse.js` to avoid the package's debug-mode
   test-file read under dynamic import (would have thrown ENOENT at runtime).
2. **Type safety** → added `types/shims.d.ts` for pdf-parse/mammoth; typed Supabase cookie
   `setAll` callbacks. `tsc --noEmit` now clean.
3. **pgvector param** → pass the query embedding as a JSON text literal (`'[...]'`), the documented
   pgvector input form, instead of a bare TS cast.

## Verification performed
- `npx tsc --noEmit` → clean.
- `npx vitest run` → 11/11 pass.
- `npx next build` → success, 23 routes.

## Not fixed here (needs live environment or is deferred)
- Live DB/provider round-trips (P1 in `REMAINING_TASKS.md`).
- Rate limiting, background ingestion worker, e2e tests (P2–P4).
These are documented, not silently skipped.
