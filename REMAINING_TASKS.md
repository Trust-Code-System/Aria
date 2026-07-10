# Remaining Tasks

Ordered by priority. Nothing here blocks the MVP acceptance criteria; these harden and extend it.

## P1 — Verify live paths (needs real keys + Supabase)
- [ ] Run the 4 migrations on a real Supabase project; confirm `vector` + `ivfflat` create cleanly.
- [ ] End-to-end: upload a PDF → confirm `ingestion_status` reaches `completed` with chunks.
- [ ] Ask a Knowledge-mode question → confirm citations map to real chunks.
- [ ] Confirm `match_document_chunks` returns rows (embedding text-literal cast works as expected).

## P2 — Robustness
- [x] Rate-limit `/api/chat`, `/api/upload`, `/api/research` (and ingest/jobs) — done in P0 on `upgrade/p0-foundation`.
- [x] Move ingestion to the `jobs` queue + inline/drain worker — done in P0 (`lib/jobs/enqueue.ts`). External Trigger.dev still optional.
- [ ] Add retry/backoff around provider calls (embeddings, chat, research).
- [ ] Stream research results through the model with tool-style progress instead of one blocking call.

## P3 — Product depth
- [ ] Auto-memory **suggestions**: extract candidate memories post-chat as `suggested`, require approval
      (schema + `memory_suggestions` semantics already supported via `approval_status`).
- [ ] Signed-URL document preview + per-document chunk inspector in `/knowledge`.
- [ ] Conversation list/search in the sidebar; rename/delete conversations.
- [ ] Report editing (in-app markdown editor) before export.
- [ ] Keyword + semantic hybrid retrieval (add `tsvector` column + rank fusion).

## P4 — Testing & observability
- [ ] Playwright e2e: signup → create project → upload → ask → cite → export.
- [ ] Eval harness: citation-accuracy, retrieval-relevance, faithfulness on a fixture set.
- [ ] Optional Sentry/Langfuse/Helicone wiring behind env flags.

## P5 — Integrations (V2, architecture already stubbed)
- [ ] Web search: expose as an in-chat tool with confirmation UI (read-only, safe to enable first).
- [ ] GitHub / Gmail / Drive / Calendar / Slack / Notion via MCP servers.
- [ ] Reddit / X as sentiment signals (not truth), gated behind legal API access.
- [ ] Browser automation (Playwright skill) behind the `dangerous` confirmation flow.
