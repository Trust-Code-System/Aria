# Aria Repair TODO

Living checklist. Update immediately after each task.

Legend: `[ ]` pending · `[x]` complete · `[!]` blocked (reason required)

---

## Phase 0 — Audit & documentation

- [x] Inspect chat, tools, connectors, memory, routing, approvals
- [x] Document confirmed root causes
- [x] Create `ARIA_REPAIR_MASTER_PLAN.md`
- [x] Create `ARIA_REPAIR_TODO.md`
- [x] Create `ARIA_REPAIR_LOG.md`

## Phase 1 — Connection status truthfulness

- [x] Define status enum: connected / action_required / expired / missing_permission / reconnecting / disconnected / provider_unavailable / setup_incomplete
- [x] Map Composio account status → Aria status (no bare “active” in UI)
- [!] Persist `last_validated_at`, redacted error fields — migration `0013_connection_status.sql` written; **must be applied in Supabase SQL editor** (no DATABASE_URL in env). Until then DB still uses legacy `active|pending|error|disconnected` wire values; UI shows canonical labels.
- [x] UI badges use truthful labels (Connected / Action required / …)
- [x] Capability hint for Gmail when connected without verified send scopes
- [x] Unit tests for status mapping (`tests/connection-status.test.ts` — 6 passed)

## Phase 2 — Connection data model

- [ ] Migration for status + capabilities + validation timestamps
- [ ] Confirm RLS still workspace-scoped
- [ ] Ensure tokens never returned to client (already Composio IDs — verify API selects)
- [ ] Backfill existing `active` → `connected` (or dual-read mapping)

## Phase 3 — Gmail OAuth repair

- [ ] Document required scopes per capability (read / draft / send)
- [ ] Validate scopes after OAuth
- [ ] Show “Connected for reading, sending permission missing” when applicable
- [ ] Reconnect flow for additional scopes
- [ ] Disconnect + revoke path verified
- [ ] Health check (lightweight Gmail/Composio probe)

## Phase 4 — Central connector registry

- [x] `lib/connectors/registry.ts` (status, capabilities, tools, execute)
- [x] Move chat-facing tool construction behind registry
- [x] Provider adapters share error normalizer (AppError path)
- [x] Only executable tools exposed

## Phase 5 — Wire registry into chat

- [x] `streamText({ tools })` in `/api/chat` when intent needs tools
- [x] Dynamic capability section in system prompt
- [x] Remove absolute “do not perform” when tools are registered
- [x] Feature flag `CHAT_TOOLS_ENABLED`
- [ ] Integration test: disconnected → zero Gmail tools; connected → permitted tools

## Phase 6 — Gmail draft & send in chat tools

- [x] `gmail_draft` / `gmail_send` when Gmail connection usable
- [x] Send creates approval (no silent send)
- [x] Errors via AppError (reconnect messaging)
- [!] Live Composio send E2E — needs user + real Gmail test

## Phase 7 — Human approval for chat writes

- [x] Approval records for chat-originated sends
- [ ] Approval card UI in chat (Approvals page works today)
- [x] Payload lock: args immutable after approve
- [x] Approve executes send; reject sends nothing
- [x] Unit tests for lock + routing

## Phase 8 — Conversation UX (“send it to him”)

- [ ] Resolve “it” from conversation
- [ ] Resolve “him” via contacts / context (no guessing)
- [ ] Use approved sender identity
- [ ] Clarifying questions only when essential

## Phase 9 — Core profile / memory / history split

- [ ] Core profile loader (name, email, company, signature, …)
- [ ] Ranked / typed memory retrieval (not dump-25)
- [ ] History search service (semantic/keyword, budgeted)
- [ ] Prompt rules: no placeholders when profile known
- [ ] Memory tests

## Phase 10 — Central context assembler

- [ ] `lib/orchestration/context.ts`
- [ ] Context budget + priority order
- [ ] Shared by chat, tasks, reports entry points

## Phase 11 — Fast request routing

- [x] Intent classes (instant / simple / action / …) in `lib/orchestration/intent.ts`
- [x] Instant skips tools, memories, memory-suggest, compact prompt
- [ ] Env model roles: FAST_MODEL, DEFAULT_MODEL, REASONING_MODEL, …
- [ ] Telemetry spans for latency
- [x] Tests: “Hi” does not need tools

## Phase 12 — Tool-aware system prompt

- [x] Runtime-generated capability section when tools load
- [x] Core rules updated (no false success / no placeholders preference)
- [ ] Full ten-rule checklist polish

## Phase 13 — Unify surfaces

- [ ] Agent tasks use registry execute (no silent simulation for wired providers)
- [ ] Reports/tasks call shared context assembler
- [ ] Extension/mobile use same chat API semantics

## Phase 14 — Contact resolution

- [ ] Resolver service with safe single-match / multi-match selector
- [ ] Workspace RLS preserved

## Phase 15 — Error handling

- [ ] User-facing connector error strings
- [ ] Redaction in logs / admin portal

## Phase 16 — Audit logging

- [ ] Audit every external tool execution
- [ ] User-visible action history (scoped)

## Phase 17 — Security

- [ ] RLS tests for connections, memory, approvals, contacts
- [ ] Cross-user isolation checks
- [ ] Zod validation on all tool inputs

## Phase 18 — Automated tests

- [ ] Connection status tests
- [ ] Tool-registration tests
- [ ] Email draft/send/approval tests
- [ ] Memory / history / performance / approval suites

## Phase 19 — Manual acceptance

- [ ] Scenario A Greeting
- [ ] Scenario B Known identity
- [ ] Scenario C Gmail send
- [ ] Scenario D Missing / ambiguous recipient
- [ ] Scenario E Expired Gmail
- [ ] Scenario F Notion action
- [ ] Scenario G Previous decision

## Phase 20 — Remove simulations

- [ ] Label or remove simulated agent executes
- [ ] Never show simulated connector as Connected

## Phase 21 — Quality gate

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run test:e2e` (as applicable)
- [ ] `npm run build`
- [ ] Token redaction spot-check
- [ ] Simple-message latency measurement recorded

---

## Blockers

| Item | Status | Reason |
| --- | --- | --- |
| Live Gmail send E2E via Composio | [!] | Must be proven with the same user who completed OAuth; not marked fixed until Composio returns a real send result |
| `@composio/vercel` session.tools() | [!] | Peer requires `ai@6+`; Aria is on `ai@3.4` — using `@composio/core` `tools.get` + AI SDK v3 wrap instead |
| OpenAI embeddings | mitigated | Quotas were exhausted; Google embeddings configured — re-verify after deploys |
