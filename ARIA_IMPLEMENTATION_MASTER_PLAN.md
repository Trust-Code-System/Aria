# Aria Implementation Master Plan

**Created:** 2026-07-12  
**Updated:** 2026-07-12 ~13:10 UTC+1  
**Branch:** `upgrade/phase-b`  
**Status:** Phase 0 audit complete; Phase 1 in progress (prior repair session already landed core chat↔Composio wiring)

This is the durable control document for the repository-aware implementation program. It verifies prior repair docs against live code and continues from the current runnable state — it does not replace Aria with a greenfield app.

---

## Missing research documents

| Document | Status |
| --- | --- |
| `ARIA_REPAIR_MASTER_PLAN.md` | Present (prior audit) |
| `ARIA_REPAIR_TODO.md` | Present |
| `ARIA_REPAIR_LOG.md` | Present |
| `ARIA_PERSONAL_AI_RESEARCH_2026.md` | Present |
| `ARIA_CAPABILITY_MATRIX.md` | Present |
| `ARIA_TARGET_ARCHITECTURE.md` | Present |
| `ARIA_BROWSER_OPERATOR_PLAN.md` | Present |
| `ARIA_MEMORY_SYSTEM_V2.md` | Present |
| `ARIA_CHIEF_OF_STAFF_PLAN.md` | Present |
| `ARIA_FEATURE_BACKLOG.md` | Present |
| `ARIA_90_DAY_ROADMAP.md` | Present |
| `ARIA_DIFFERENTIATION_STRATEGY.md` | Present |
| `ARIA_EXTERNAL_RESEARCH_DOSSIER_2026.md` | **Does not exist** — do not invent it |

---

## 1. Existing architecture (discovered from code)

```
Next.js 14 (App Router) + TypeScript + Zod
  Auth: Supabase Auth (SSR) → workspace cookie → RLS
  Data: Supabase Postgres + pgvector + Storage
  AI: Vercel AI SDK 3.4 (streamText / generateText)
  Models: OpenAI / Anthropic / Google (+ optional Tavily research)
  Connectors: Composio (@composio/core 0.13) — OAuth + tools + execute
  Surfaces: /chat, /connections, /approvals, /tasks (agent), /cowork email,
            /projects, /memory, /reports, Chrome extension side-panel, PWA
```

### Chat execution path (current)

```
POST /api/chat
  → requireSessionApi + rate limit
  → classifyChatIntent (deterministic)
  → memories only if intentNeedsMemories (skipped for instant)
  → RAG if mode=knowledge; research if mode=research
  → recent conversation messages (short for instant)
  → if CHAT_TOOLS_ENABLED && intentNeedsTools:
       buildChatTools → toolkitsForIntent → getActiveConnection
       → composio.tools.get(stableUserId, { toolkits })
       → wrap as AI SDK CoreTool (dangerous → createChatToolApproval)
  → buildSystemPrompt (+ capability section when tools load)
  → streamText({ tools?, maxSteps })
  → onFinish: persist message; suggestMemoriesFromTurn if allowed
```

### Composio path (current)

```
Connect: POST /api/connections
  entityId = stableComposioUserId(supabaseUserId)  // == auth UUID
  → Composio OAuth → callback/refresh updates connections row
  → stores composio_connection_id + composio_entity_id (NOT raw tokens)

Chat tools: buildComposioAiSdkTools
  → same stable user id
  → reject if connection.entityId !== chat user
  → tools.get / tools.execute via @composio/core

Approve send: Approvals UI → POST /api/approvals/[id]
  → executeApprovedChatTool → verify payload_hash
  → executeComposioToolFromApproval
```

### Memory path (current)

```
memories table (approval_status: suggested|approved|disabled)
  → getContextMemories: up to 25 approved strings (global + project)
  → injected into system prompt
  → suggestMemoriesFromTurn after non-instant/simple turns (extra LLM)
NO structured core profile assembler
NO cross-conversation semantic history search
profiles.display_name exists but is not merged as hard identity
```

### Agent / cowork paths (fragmented)

| Surface | Tools | Approvals | Reality |
| --- | --- | --- | --- |
| Chat | Composio toolkit tools when intent=action | Chat approvals + payload lock | Wired (live send E2E unverified) |
| Cowork email | `lib/connectors/gmail.ts` | Confirm flag on action route | Real draft/send via Composio REST |
| Agent tasks | Partial | Task approvals | Email → Gmail **draft only**; else `SIMULATED_NOTE` |

---

## 2. Phase 0 baseline classification

### Fully working

- Supabase auth + workspace membership + RLS patterns
- Chat streaming (text) with provider fallback
- Knowledge RAG (pgvector) when embeddings/keys work
- Web research via Tavily when key present
- Composio OAuth connect/callback/refresh for configured apps
- Cowork Gmail triage/action routes (real provider calls)
- Memory CRUD UI + approval_status gating for inject
- Contacts CRUD (not used by chat resolution yet)
- Agent task planning + approval UI shell
- Payload lock (canonical + hash) for chat and agent approvals
- Intent router: instant greetings skip tools + memory dump + memory-suggest
- Chrome extension side-panel + PWA installability (present)

### Partially working

- Chat ↔ Composio tools (code path exists; live Gmail send E2E not proven)
- Connection status UI (canonical labels; scopes/capabilities not fully live-verified)
- Dangerous tool → Approvals page (works; no inline chat approval card)
- Agent email steps (draft only, never send — by design comment)
- Research (Tavily yes; Perplexity key empty in prior env notes)
- Embeddings (Google fallback path; OpenAI quota historically fragile)

### Simulated / misleading

- `lib/agent/execute.ts` → `SIMULATED_NOTE` for non-email approved actions (honest label, but still simulation)
- Connections setTimeout refresh UX delay (not fake success, but can feel like validation)
- Static capability marketing copy on connection cards unless capabilityHint overrides

### Broken / incomplete relative to product rules

- No idempotent execution claim → **replay risk** if `executeApprovedChatTool` invoked twice while status=`approved`
- Approval terminal states (`succeeded` / `failed` / `executing`) not first-class
- No action execution/receipt table
- Chat approval summaries assume `to`/`subject` local tool args — Composio `GMAIL_SEND_*` may use different keys
- Core profile not assembled; placeholders still possible
- Cross-conversation history search missing
- Central context assembler missing
- Env model roles (`FAST_MODEL`, etc.) not implemented
- Migration `0013_connection_status.sql` written but **not confirmed applied** to remote Supabase

### Missing (later phases)

- Browser operator sandbox / form fill approvals
- Chief-of-Staff Today briefing as unified truthful surface
- Business style profile / proposal workflows
- Coding sandbox PR flow
- Dedicated evaluation suite for all 12 acceptance scenarios

### Unknown / needs credentials

- Live Composio `tools.get` + `GMAIL_SEND_EMAIL` for the same user who OAuth’d
- Whether Gmail auth config grants send scopes
- Whether remote DB has migration 0013 columns
- Production AUTH_DISABLED must remain false

---

## 3. Confirmed root causes (user-facing failures)

### Why connections looked active but chat could not act (historical)

1. Chat `streamText` previously had **no tools** argument.
2. Local `TOOL_REGISTRY` existed but was never registered into chat.
3. System prompt told the model not to perform sensitive actions.
4. Real Gmail lived only on cowork / partial agent paths.

**Current code status:** Tools are wired via Composio session + registry when intent needs tools. Remaining failure modes are identity mismatch, missing scopes, approval UX, and unverified live send.

### Why Gmail may still fail to send (current likely causes)

1. Live provider E2E not yet run successfully through Approvals → `composio.tools.execute`.
2. Connection `composio_entity_id` mismatch vs chat user → explicit AppError.
3. Missing send scope still possibly labeled Connected without capability probe.
4. Model may call Composio slug with unexpected argument shapes; approval summary may look wrong.
5. Double-execution not hard-locked after first success.

### Why memory feels unused

- Dump of ≤25 strings without ranking, types, or core profile priority.
- No contradiction / supersede workflow beyond suggested→approved.
- No history search across conversations.

### Why short messages were slow (historical + residual)

- Always loaded memories, full prompt, memory-suggest LLM.
- **Mitigated:** `instant` intent skips memories, tools, memory-suggest, uses compact prompt.
- Residual: still auth + DB message insert + model call; no dedicated FAST_MODEL env yet.

---

## 4. Target architecture (incremental)

Keep repository-native orchestration — do **not** rewrite into LangGraph/Letta/Temporal.

```
Authenticate → workspace
  → classify intent (skip work when instant)
  → assemble context (budgeted; Phase 3+)
  → load only needed Composio toolkits
  → streamText / generateText
  → dangerous tools → locked approval
  → approve → claim execution (once) → Composio execute
  → store receipt + audit → stream honest result
```

Composio remains source of truth for OAuth, tokens, schemas, execution.

---

## 5. Database impact

| Item | Status |
| --- | --- |
| `0013_connection_status.sql` | Written; apply in Supabase when possible |
| Approval execution claim / terminal status | Prefer metadata + status string first; migration if constraints require |
| `action_executions` / receipts | Phase 1 if needed after claim lock |
| Core profile columns | Phase 3 |
| Browser tasks | Phase 5 |

**Rule:** Additive migrations only; never disable RLS.

---

## 6. Security risks

| Risk | Mitigation |
| --- | --- |
| Silent / fake external success | Only report success from Composio/provider result |
| Approval bypass | Dangerous slug regex → approval; execute only after decide |
| Argument mutation | `payload_canonical` + `payload_hash` |
| Duplicate send | **Must add** execution claim / succeeded gate |
| Token leakage | Tokens stay in Composio; client gets IDs only |
| Cross-workspace | RLS + workspace_id filters |
| `AUTH_DISABLED` | Dev-only; never leave on in production |
| Prompt injection | Treat email/web as untrusted; no privilege escalation |

---

## 7. Implementation phases (program mapping)

| Program phase | Focus | Gate |
| --- | --- | --- |
| 0 | Audit + control docs | This document + TODO/LOG/ADR/handoff |
| 1 | Composio, approvals, verified actions, honest status | Replay-safe approve→execute; no fake success; Gmail path ready for live test |
| 2 | Intent/model routing + performance | Instant p50 instrumentation; FAST_MODEL |
| 3 | Core profile, memory, history, context assembler | No placeholders for known identity |
| 4 | Chief-of-Staff workflows | Truthful Today / briefing |
| 5 | Browser operator | Isolated + approval-gated |
| 6 | Business artifacts | User-owned brand profile |
| 7 | Coding workflows | Sandbox + review |
| 8 | Eval, harden, cleanup | Remove simulations / dead paths |

---

## 8. Dependencies

- npm (single `package-lock.json`); AI SDK 3.4 → use `@composio/core` not `@composio/vercel`
- Composio API key + per-app auth config IDs
- Supabase project with migrations applied through 0012 (+ 0013 when available)
- At least one LLM key; embedding key for RAG

---

## 9. Testing strategy

```
npm run typecheck
npm test -- tests/connection-status.test.ts tests/chat-tools-routing.test.ts tests/composio-identity.test.ts tests/payload-lock.test.ts
npm test   # full vitest
npm run lint
npm run build   # when phase gate requires
```

Live Gmail: manual acceptance only with test inbox — mark `[~]` until proven.

---

## 10. Rollback

- `CHAT_TOOLS_ENABLED=false` restores pre-tool chat behavior
- Additive migrations only
- Keep cowork email routes until chat send is live-verified
- Revert via git commits (no force-push)

---

## 11. Decisions during implementation

See `ARIA_ARCHITECTURE_DECISIONS.md`.

Key retained decisions:

1. Composio = OAuth/token/execution source of truth.
2. Stable Composio user id = Supabase auth UUID.
3. AI SDK 3.4 → wrap `composio.tools.get` as CoreTools; do not upgrade SDK solely for `@composio/vercel` mid-repair.
4. Persist legacy connection status values until 0013 applied (`persistableConnectionStatus`).
