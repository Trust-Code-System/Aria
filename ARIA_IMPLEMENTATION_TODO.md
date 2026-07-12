# Aria Implementation TODO

Living checklist for the repository-aware program. Update after every meaningful change.

Legend: `[ ]` not started · `[-]` in progress · `[x]` completed and tested · `[!]` blocked · `[~]` implemented but not fully verified

---

## Phase 0 — Audit and baseline

- [x] **Phase 0 / Docs** — Locate repair + research files; note missing `ARIA_EXTERNAL_RESEARCH_DOSSIER_2026.md`
  - Files: `ARIA_*.md`
  - Acceptance: Missing docs recorded; existing docs read
  - Test: N/A

- [x] **Phase 0 / Code audit** — Trace chat, Composio, memory, approvals, agent simulate
  - Files: `app/api/chat/route.ts`, `lib/connectors/*`, `lib/ai/memory.ts`, `lib/agent/execute.ts`
  - Acceptance: Baseline section in master plan
  - Test: Static trace

- [x] **Phase 0 / Control files** — Master plan, TODO, LOG, ADRs, session handoff
  - Files: `ARIA_IMPLEMENTATION_*.md`, `ARIA_ARCHITECTURE_DECISIONS.md`, `ARIA_SESSION_HANDOFF.md`
  - Acceptance: Another session can continue without re-audit
  - Test: N/A

---

## Phase 1 — Composio, approvals, verified actions

- [x] **Phase 1 / Stable identity** — Supabase UUID === Composio user_id at connect and chat
  - Files: `lib/connectors/composio-user.ts`, `app/api/connections/route.ts`, `composio-session.ts`
  - Acceptance: Same ID on OAuth and tools.get/execute; mismatch throws
  - Test: `tests/composio-identity.test.ts` — passed (prior)

- [x] **Phase 1 / Session + toolkit tools** — `@composio/core` tools.get wrapped for AI SDK 3.4
  - Files: `lib/connectors/composio-session.ts`, `registry.ts`, `app/api/chat/route.ts`
  - Acceptance: Action intent receives executable tools; instant does not
  - Test: unit routing + identity — `[~]` live tools.get with user credentials

- [x] **Phase 1 / Dangerous → approval** — Send/delete create locked approval, do not execute
  - Files: `composio-session.ts`, `chat-approval.ts`, `app/api/approvals/[id]/route.ts`
  - Acceptance: No silent send; Approvals page can approve
  - Test: lock unit tests — `[~]` live Gmail

- [x] **Phase 1 / Replay + idempotency** — Approve→execute at most once; terminal status
  - Files: `lib/connectors/chat-approval.ts`, `lib/agent/approval-policy.ts`, tests
  - Acceptance: Second execution rejected; success/failure stored
  - Test: approval-policy + claim path; 38 related tests passed

- [x] **Phase 1 / Gmail approval summary** — Normalize Composio GMAIL_* arg shapes for UI
  - Files: `lib/connectors/chat-approval.ts`
  - Acceptance: `recipient_email` → To in summary
  - Test: `tests/chat-tools-routing.test.ts`

- [x] **Phase 1 / Honest connection status** — Canonical labels; migration 0013 applied
  - Files: `lib/connectors/status.ts`, connections UI, `0013_connection_status.sql`
  - Acceptance: UI not raw “active”; capabilities column populated for Gmail (live probe)
  - Test: `tests/connection-status.test.ts` + live REST verify

- [x] **Phase 1 / Scope / capability probe** — Detect read/draft/send from Composio tools.get
  - Files: `lib/connectors/capabilities.ts`, refresh/callback/GET connections, Connections UI Refresh
  - Acceptance: Honest capability hints; Gmail live: send=true (`GMAIL_SEND_EMAIL`)
  - Test: `tests/capabilities.test.ts` + live Composio probe 2026-07-12

- [~] **Phase 1 / Live Gmail E2E** — Chat → approval → Composio → inbox
  - Acceptance: Real message in test inbox; replay rejected
  - Blocker: Interactive UI approval still required (provider tools confirmed available)

---

## Phase 2 — Intent, model routing, performance

- [x] **Phase 2 / Intent classes** — Deterministic router in chat
  - Files: `lib/orchestration/intent.ts`
  - Test: `tests/chat-tools-routing.test.ts`

- [x] **Phase 2 / Model roles** — FAST/DEFAULT/REASONING/ACTION/CODING/VISION env
  - Files: `lib/env.ts`, `lib/ai/routing.ts`, `app/api/chat/route.ts`
  - Test: `tests/model-routing.test.ts`

- [ ] **Phase 2 / Telemetry spans** — Auth → intent → first token (no secrets)
  - Files: `lib/logging/telemetry.ts`, chat route

- [ ] **Phase 2 / Instant performance record** — Real p50/p95 for “Hi”
  - Acceptance: Measured numbers in LOG (never invented)

---

## Phase 3 — Core profile, memory, context

- [ ] Core profile loader (no hard-coded personal details in source)
- [ ] Ranked/typed memory retrieval
- [ ] Proposed memory workflow polish
- [ ] Contradiction / supersede UX
- [ ] Conversation history search
- [ ] Central context assembler

---

## Phase 4–8

Deferred until Phase 1 trust boundaries pass. See program brief and `ARIA_FEATURE_BACKLOG.md`.

---

## Continuity

See `ARIA_SESSION_HANDOFF.md` for exact next action.
