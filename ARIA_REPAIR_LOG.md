# Aria Repair Log

Chronological record of meaningful repair work. Newest entries at the top.

---

## 2026-07-12 — Composio correction: stable user + SDK tools

**Time:** ~12:35 UTC+1

**Correction:** Do not replace Composio OAuth. Defect is between authenticated Composio account and Aria chat tool registration.

**Audit findings:**
1. OAuth already used `ctx.userId` (Supabase UUID) as Composio `user_id` — correct and stable.
2. Chat previously used **local** `TOOL_REGISTRY` wrappers + REST `tools/execute`, not Composio toolkit discovery — model never received live Composio Gmail tool schemas/executors from a session/`tools.get`.
3. No `@composio/core` was installed; thin REST client only. `@composio/vercel` requires AI SDK 6+, Aria is on AI SDK 3.4 → use `@composio/core` `tools.get` + wrap as AI SDK v3 tools.
4. Live probe: `tools.get(userId, { toolkits: ['gmail'] })` returns real `GMAIL_*` tools with schemas; `session.tools()` returns Tool Router meta tools.

**Files added/updated:**
- `lib/connectors/composio-user.ts` — stable ID = Supabase UUID
- `lib/connectors/composio-session.ts` — toolkit selection, `tools.get`, AI SDK wrap, dangerous→approval, execute resume
- `lib/connectors/registry.ts` — prefers Composio tools
- `lib/connectors/chat-approval.ts` — resume via `composio.tools.execute`
- `app/api/connections/route.ts` — explicit `stableComposioUserId`
- `app/api/chat/route.ts` — passes intent/message into registry
- `@composio/core` dependency
- `tests/composio-identity.test.ts`

**Tests:** 12 passed (identity + routing); `tsc --noEmit` clean.

**NOT yet proven:** A real Gmail send through Aria → Approvals → Composio → Gmail. Do not call the send path "fixed" until that acceptance test succeeds with the same user who OAuth'd.

---

## 2026-07-12 — Phases 4–7 + partial 11: chat tools wired

**Time:** ~12:30 UTC+1

**Files added:**
- `lib/connectors/registry.ts`
- `lib/connectors/chat-approval.ts`
- `lib/orchestration/intent.ts`
- `tests/chat-tools-routing.test.ts`

**Files modified:**
- `app/api/chat/route.ts` — intent routing, tools on streamText, capability prompt
- `lib/ai/prompts.ts` — tool-aware rules; compact instant prompt
- `lib/env.ts` — `CHAT_TOOLS_ENABLED` (default on)
- `lib/ai/tools.ts` — optional `max` on gmail_read
- `app/api/approvals/[id]/route.ts` — execute chat-tool approvals after approve
- `components/approvals/approvals-client.tsx` — toast when chat send executed

**Reason:** Connections showed usable Gmail but chat never registered tools with the model.

**Important technical decisions:**
1. Dangerous tools (`gmail_send`, etc.) create a locked approval instead of executing; Approvals page approve runs Composio send with verified payload.
2. Tools load only for `action` / `research` / `complex_reasoning` intents — “Hi” skips connectors and memory suggest.
3. Rollback: set `CHAT_TOOLS_ENABLED=false`.

**Tests:** `tests/chat-tools-routing.test.ts` + connection-status — 11 passed; `tsc --noEmit` clean.

**Remaining:** Inline approval cards in chat UI; live Gmail E2E; core profile; richer scope validation.

---

## 2026-07-12 — Phase 1: truthful connection status (partial)

**Time:** ~12:25 UTC+1

**Files modified / added:**
- `lib/connectors/status.ts` (new)
- `lib/connectors/composio.ts` — richer Composio status mapping
- `lib/connectors/connections.ts` — usable = connected|active
- `app/api/connections/refresh/route.ts`, `callback/route.ts`
- `components/connections/connections-client.tsx` — Connected / Action required badges
- `components/dashboard/fierce-dashboard.tsx`
- `app/api/cowork/email-triage/route.ts`, `email-action/route.ts`
- `lib/agent/execute.ts`
- `supabase/migrations/0013_connection_status.sql` (new; not yet applied to remote)
- `tests/connection-status.test.ts` (new)

**Reason:** Connections UI showed raw `active` from DB without clear capability language; chat still cannot execute tools (Phase 5), but status must stop implying full power.

**Important technical decision:** Until migration 0013 is applied, persist legacy DB values (`active`/`error`/…) via `persistableConnectionStatus`, while API/UI use canonical labels (`Connected`, `Action required`). Keeps app runnable without a DB migration step.

**Tests performed:** `npm test -- tests/connection-status.test.ts`

**Test result:** 6/6 passed.

**Remaining issues:** Apply `0013_connection_status.sql` in Supabase; Phase 5 still required for chat to use Gmail tools; scope/capability verification not fully live yet.

---

## 2026-07-12 — Audit complete; documentation created

**Time:** ~12:20 UTC+1  

**Files created:**
- `ARIA_REPAIR_MASTER_PLAN.md`
- `ARIA_REPAIR_TODO.md`
- `ARIA_REPAIR_LOG.md`

**Reason:** User required audit-before-modify and persistent hand-off docs before repairing connectors, memory, routing, and orchestration.

**Important technical decisions:**
1. **Root cause of “Gmail connected but chat can’t send”:** Chat `streamText` never receives tools. Gmail works only via cowork API / partial agent execute. Status “active” is a Composio account flag in Postgres, not chat capability.
2. **Keep Composio as token vault** for Phase 2; enhance Aria’s status/capabilities rather than storing raw OAuth tokens in Supabase.
3. **Shortest path to value:** Phase 1 (truthful status) → registry → wire chat tools → fast router → approvals → core profile.
4. **Do not redesign UI shells**; repair wiring and status semantics.

**Audit evidence (key paths):**
- `app/api/chat/route.ts` — `streamText` opts omit `tools`
- `lib/ai/prompts.ts` — BASE says do not perform sensitive actions
- `lib/ai/tools.ts` — real Gmail tool `execute` exists but unused by chat
- `lib/connectors/connections.ts` — `status === "active"` only
- `lib/agent/execute.ts` — `SIMULATED_NOTE` for non-email actions
- `lib/ai/memory.ts` — approved memories dumped (≤25), no core profile
- `lib/ai/routing.ts` — model cost heuristic only; no instant skip path

**Tests performed:** Static code trace + env inspection (`COMPOSIO_*` present, Tavily present, Perplexity empty). No runtime mutation in this step.

**Test result:** N/A (documentation phase).

**Remaining issues:** All Phase 1–21 implementation items open; see `ARIA_REPAIR_TODO.md`.
