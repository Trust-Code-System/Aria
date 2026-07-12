# Aria Repair Master Plan

**Created:** 2026-07-12  
**Status:** Audit complete — implementation not started  
**Codebase:** Aria (Next.js 14 + Supabase + Vercel AI SDK + Composio connectors)

This document is the durable hand-off for repairing Aria so connected tools, memory, history, and fast routing work through one secure orchestration layer. It is based on a live code audit, not assumptions.

---

## Composio architecture (corrected)

Composio is the source of truth for OAuth, connected accounts, credentials,
token refresh, toolkit discovery, schemas, and execution. Aria must not
rebuild a parallel OAuth/token vault.

**Stable identity:** `Supabase auth user UUID` === Composio `user_id` used at
connect time and at chat tool load/execute (`stableComposioUserId`).

**Chat tool path (AI SDK 3.4):**
`authenticate → stableComposioUserId → verify connection row entity matches →
composio.tools.get(userId, { toolkits }) → wrap as Vercel AI SDK tools with
execute → streamText → dangerous tools create Aria approval → on approve
composio.tools.execute(slug, { userId, connectedAccountId, arguments })`.

**Note:** Official `@composio/vercel` + `session.tools()` requires AI SDK 6+.
Until Aria upgrades AI SDK, use `@composio/core` direct toolkit tools (not
Tool Router meta tools) so send/draft/read are explicit and approval-gated.

---

## 1. Current architecture (as implemented)

```
Browser
  ├─ /chat ──────────────► POST /api/chat ──► streamText (NO tools)
  │                          ├─ getContextMemories (always)
  │                          ├─ RAG if mode=knowledge
  │                          ├─ runResearch if mode=research
  │                          └─ suggestMemoriesFromTurn onFinish (extra LLM)
  │
  ├─ /connections ───────► DB connections.status + Composio OAuth
  │                          └─ /api/cowork/email-* (real Gmail via Composio)
  │
  ├─ /tasks ─────────────► agent runtime (plan → generateText → approvals)
  │                          └─ performApprovedStep (Gmail draft real; else SIMULATED)
  │
  └─ /reports, /agents ──► separate generateText paths
```

### What already exists and is useful

| Area | Location | Reality |
| --- | --- | --- |
| Auth + workspace RLS | `lib/auth/guards.ts`, migrations | Real |
| Chat streaming | `app/api/chat/route.ts` | Real, but **no tool calling** |
| Memory table + inject | `memories`, `lib/ai/memory.ts` | Real inject; weak use / no core profile |
| Knowledge RAG | `lib/ai/rag.ts`, pgvector | Real |
| Research | `lib/ai/research.ts` (Tavily/Perplexity) | Real when keys present |
| Tool registry | `lib/ai/tools.ts` | Typed tools exist; **chat never receives them** |
| Composio OAuth | `lib/connectors/composio.ts`, `/api/connections/*` | Real OAuth start/callback/refresh |
| Gmail draft/send | `lib/connectors/gmail.ts`, `/api/cowork/email-*` | Real via Composio (cowork UI only) |
| Approvals (agent tasks) | `approvals` table, `lib/agent/*` | Real for tasks; **not wired to chat tool calls** |
| Contacts | `contacts` table, `/contacts` | Real CRUD; **not used by chat** |
| Profiles | `profiles` (display_name, email) | Exists; **not treated as core profile in prompts** |

### Token storage model (current)

- Aria stores **Composio connected-account IDs**, not raw OAuth tokens (`supabase/migrations/0007_connections.sql`).
- Composio holds access/refresh tokens.
- Connection rows are workspace-scoped with RLS (`is_workspace_member`).
- This is acceptable for Phase 2 reuse; enhance status/scopes/validation rather than reinventing token vaults unless leaving Composio.

---

## 2. Confirmed defects (root causes of user-reported failures)

### Defect A — Chat cannot use connected services

**Symptom:** Connections show Active; chat says it has no Gmail / only drafts text to copy.

**Root cause (confirmed):**

1. `POST /api/chat` calls `streamText` **without** a `tools` argument (`app/api/chat/route.ts` ~234–287).
2. `lib/ai/tools.ts` defines `gmail_read`, `gmail_draft`, `gmail_send`, etc., with real `execute` handlers, but nothing registers them into the chat model call.
3. System prompt BASE rules say for sensitive actions: *"ask for explicit confirmation — **do not perform them**"* (`lib/ai/prompts.ts` ~27), with **no runtime capability section**.
4. Real Gmail execution only lives on **cowork** routes and (partially) **agent task** execute — a separate UI path from chat.

**Trace:** Connection card → `connections.status='active'` → chat request → **tools never loaded** → model invents “not connected” / copy-paste email.

### Defect B — “Active” means DB row, not validated capability

**Confirmed:**

- UI badge uses `row.status === "active"` from `connections` (`components/connections/connections-client.tsx`).
- Status is set from Composio account status on callback/refresh (`app/api/connections/callback/route.ts`, `refresh/route.ts`).
- No check of: granted scopes, send vs read capability, recent provider health, revoked tokens beyond Composio status string.
- Cards still advertise full capability text (send, create events, etc.) for every app in the static `APPS` list.

### Defect C — Memory injected but not enforced as identity

**Confirmed:**

- Every chat turn loads up to 25 approved memories (`getContextMemories`).
- No separate **core profile** assembly (name, company, signature, timezone) with hard “never placeholder” rules.
- `profiles.display_name` / email exist but are not merged into prompt identity.
- Model can still emit `[Your Name]` / ask for known facts; there is no post-check or strong prompt contract.
- `suggestMemoriesFromTurn` runs after **every** reply (extra latency + cost), including greetings.

### Defect D — No cross-conversation retrieval

**Confirmed:** Chat loads only the **current** conversation’s last ~12 messages. There is no semantic/keyword history search across conversations. Projects/knowledge/contacts are not assembled into one context service.

### Defect E — Simple messages still run a heavy path

**Confirmed for mode=general “Hi”:**

- Still loads memories from DB.
- Still builds full system prompt.
- Still runs provider fallback loop.
- Still runs `suggestMemoriesFromTurn` (LLM) on finish.
- Routing only picks a cheaper model for “low” complexity; it does **not** skip retrieval, connectors, or post-turn memory suggestion.
- No `instant` / `simple_generation` / `action` intent classes as specified.

### Defect F — Fragmented AI pipelines

| Surface | Orchestration | Tools | Memory | Approvals |
| --- | --- | --- | --- | --- |
| Chat | `/api/chat` streamText | ❌ | ✅ dump | ❌ |
| Cowork email | `/api/cowork/*` | ✅ Gmail | ❌ | confirm flag |
| Agent tasks | `lib/agent/runtime.ts` | partial | ❌ | ✅ |
| Reports | `/api/reports` generateText | ❌ | ❌ | ❌ |

### Defect G — Simulated external actions in agent path

**Confirmed:** `lib/agent/execute.ts` returns `SIMULATED_NOTE` for non-email approved actions. Email approved steps create **drafts only**, never send (by design comment).

---

## 3. Probable defects (high confidence, needs live verification)

| Item | Why probable |
| --- | --- |
| Stale `active` after user revokes in Google | Refresh only polls Composio; no periodic health check |
| Missing send scope still labeled as full Gmail | Scopes stored as jsonb default `[]`; UI ignores them |
| Memory overload dilutes identity facts | 25 unordered strings; no ranking by type/relevance |
| OpenAI quota makes knowledge/embeddings fragile | Observed earlier; Google fallback added but must stay consistent |
| Composio tool slug drift | Slugs hard-coded; wrong slug → honest error but looks like “can’t send” |
| Approval inbox not usable from chat tool calls | Approvals schema is task-centric |

---

## 4. Files involved (primary)

### Chat / orchestration
- `app/api/chat/route.ts` — **must wire tools + router + context assembler**
- `lib/ai/prompts.ts` — capability-aware prompt; remove absolute “never perform”
- `lib/ai/routing.ts` — extend to intent classes + skip expensive work
- `lib/ai/tools.ts` — registry; adapt for Vercel AI SDK tool map
- `lib/ai/memory.ts` — relevance + core profile
- `lib/ai/providers.ts` / `lib/env.ts` — FAST/DEFAULT/REASONING model roles

### Connectors
- `lib/connectors/composio.ts`
- `lib/connectors/connections.ts`
- `lib/connectors/gmail.ts`
- `app/api/connections/route.ts`, `callback/route.ts`, `refresh/route.ts`
- `components/connections/connections-client.tsx`
- `app/api/cowork/email-triage/route.ts`, `email-action/route.ts`

### Agent / approvals
- `lib/agent/runtime.ts`, `execute.ts`, `approval-policy.ts`, `payload-lock.ts`
- `supabase/migrations/0008_agent_tasks.sql` (approvals)

### Data
- `supabase/migrations/0007_connections.sql`
- `supabase/migrations/0001_init.sql` (profiles, memories, conversations)
- `supabase/migrations/0009_contacts.sql`

### New modules to add (planned)
- `lib/orchestration/context.ts` — central context assembler
- `lib/orchestration/router.ts` — instant/simple/action/… intents
- `lib/orchestration/chat-runtime.ts` — shared entry for chat/tasks/extension
- `lib/connectors/registry.ts` — status, capabilities, tools, execute
- `lib/connectors/status.ts` — truthful connection status enum
- Optional: `lib/profile/core.ts`, `lib/history/search.ts`

---

## 5. Database changes (planned)

Reuse `connections` (Composio ID model). Migrate to richer status:

```text
status: connected | action_required | expired | missing_permission
      | reconnecting | disconnected | provider_unavailable | setup_incomplete
```

Add columns (migration `0013_connections_capabilities.sql` — name TBD):

- `granted_scopes text[]` / jsonb (already have scopes jsonb — populate + use)
- `capabilities jsonb` (e.g. `{ read: true, draft: true, send: false }`)
- `last_validated_at timestamptz`
- `last_error_code text`
- `last_error_message_redacted text`
- `provider_account_id text`
- `revoked_at timestamptz`

**Core profile:** either extend `profiles` with structured fields or add `core_profile` table (workspace-scoped, RLS). Prefer extending `profiles` + workspace defaults first.

**Approvals:** extend for chat-originated tool approvals (`conversation_id`, `tool_name`, `sanitized_args`, payload lock) — migrate `0008` carefully; do not break task approvals.

**Audit:** ensure `audit_logs` captures connector executions (may already via `logAudit`).

**Do not** put access/refresh tokens in Aria DB while using Composio.

---

## 6. Security risks

| Risk | Mitigation |
| --- | --- |
| Model calls send without approval | Dangerous tools require `confirmed` + approval row; chat must create approval cards |
| Token leakage | Keep tokens in Composio; never return to client; sanitize logs |
| Cross-workspace tool use | Always resolve connection by `workspace_id` + RLS; never accept client-supplied entity IDs blindly |
| Fake success | Only report success from provider API response |
| Service role abuse | Connector execute uses user-scoped session for reads; admin client only where already justified |
| Prompt injection via email body | Trifecta flags already mark email as untrusted; keep reads sandboxed |

---

## 7. Implementation phases (mapped to required phases)

| Phase | Goal | Exit criteria |
| --- | --- | --- |
| **0** | Docs + audit (this) | Master plan, TODO, LOG exist |
| **1** | Truthful connection status | No “Active” without validated Composio account + capability map |
| **2** | Connection data model harden | Migration + RLS unchanged/strengthened; scopes/capabilities stored |
| **3** | Gmail OAuth repair | Scopes match advertised caps; reconnect for missing send |
| **4** | Connector registry | `getAvailableTools` / `executeConnectorTool` single entry |
| **5** | Wire registry into chat | streamText receives tools; capability prompt section |
| **6** | Gmail draft/send tools in chat | Real draft/send via registry; no fake IDs |
| **7** | Chat approval cards | Send requires approval; payload lock |
| **8** | Conversation UX for “send it to him” | Resolve referent + contact + approval |
| **9** | Core profile vs memory vs history | Structured profile; ranked memory; history search tool |
| **10** | Context assembler | Shared by chat/tasks/reports |
| **11** | Fast request routing | “Hi” skips RAG/history/connectors/memory-suggest |
| **12** | Tool-aware system prompt | Dynamic capabilities only |
| **13** | Unify surfaces | Tasks/reports/extension call shared runtime |
| **14** | Contact resolution | Safe match / selector |
| **15–17** | Errors, audit, security tests | As specified |
| **18–19** | Automated + manual acceptance | Scenarios A–G |
| **20** | Remove simulations / label Demo | No false Active |
| **21** | Build + quality gate | typecheck, lint, test, build |

**Order of attack (shortest path to user value):**  
1 → 4 → 5 → 11 (partial) → 12 → 6 → 7 → 9 (core profile) → 10 → rest.

---

## 8. Test strategy

- **Unit:** connection status mapping, router intents (“Hi” → instant), approval policy, payload lock, memory filter, capability → tool registration.
- **Integration:** Composio status refresh (mocked HTTP), chat route registers tools when Gmail connected, no tools when disconnected.
- **E2E (Playwright):** greeting latency path (assert no research/RAG calls via instrumentation flags), approval card flow with mocked Gmail.
- **Manual:** Scenarios A–G with real Gmail test account when credentials allow.
- **Never** disable RLS to pass tests.

---

## 9. Rollback strategy

- Feature flag `CHAT_TOOLS_ENABLED` (env) — default on in dev after Phase 5; can disable to restore pre-tool chat.
- Migrations additive only; status enum expanded with backward-compatible mapping (`active` → `connected`).
- Keep cowork email routes until chat path proven.
- Git commits per phase; do not force-push.

---

## 10. Final architecture (target)

```
All surfaces
    │
    ▼
orchestration/router.ts          ← intent: instant | simple | personal | knowledge | research | action | complex
    │
    ▼
orchestration/context.ts         ← budgeted: profile, memories, project, history?, knowledge?, contacts?
    │
    ▼
connectors/registry.ts           ← only if intent needs tools
    │
    ▼
chat-runtime (streamText / generateText)
    ├─ tools from registry (executable only)
    ├─ capability prompt section
    ├─ approval gate for dangerous tools
    └─ audit + telemetry spans
```

Rules enforced by runtime, not model honesty:

1. No tool → never claim connector available.  
2. No approval → never send.  
3. No provider success → never claim sent.  
4. Instant intent → no RAG, no history search, no connector load, no memory-suggest.

---

## 11. Environment notes (this machine)

- `COMPOSIO_API_KEY` present; many `COMPOSIO_*_AUTH_CONFIG_ID` set (Gmail, Calendar, Drive, Slack, Notion, GitHub, …).
- `PERPLEXITY_API_KEY` empty; `TAVILY_API_KEY` present.
- OpenAI embeddings previously quota-exhausted; default embedding switched toward Google (see prior session).
- No `FAST_MODEL` / `REASONING_MODEL` env roles yet — only `DEFAULT_CHAT_MODEL`, `DEFAULT_EMBEDDING_MODEL`, `DEFAULT_RESEARCH_MODEL`.

---

## 12. Explicit non-goals (this repair)

- Redesigning the visual design system.
- Replacing Composio with raw Google OAuth unless Composio blocks required scopes.
- Building a new app or forking UI shells.
- Claiming connectors work without live provider confirmation.
