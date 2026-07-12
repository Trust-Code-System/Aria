# Aria Implementation Log

Newest entries at the top.

---

## 2026-07-12 — Migration 0013 verified; Gmail send tools live; model roles

**Time:** ~13:55 UTC+1  
**Phase:** 1 → 2  

### Verification

- Supabase REST: `capabilities` / `last_validated_at` columns exist (0013 applied)
- Live Composio `tools.get(gmail)`: 63 tools including `GMAIL_SEND_EMAIL`
- Persisted Gmail capabilities `{ read, draft, send, write: true }`

### Code

- `persistableConnectionStatus` writes canonical statuses post-0013
- Connections GET/page prefer `capabilities` column
- Refresh route uses 0013 columns
- `FAST_MODEL` / `ACTION_MODEL` / … env roles + intent-aware `resolveRoutedChatModelId`

### Tests

typecheck clean; connection-status, capabilities, model-routing, chat-tools, approval-policy passed

### Remaining

Manual chat→Approvals→inbox E2E; Phase 2 telemetry

---

## 2026-07-12 — Phase 1 capability probe + Connections Refresh

**Time:** ~13:40 UTC+1  
**Phase:** 1  
**Branch:** `upgrade/phase-b`

### Files

- Added: `lib/connectors/capabilities.ts`, `tests/capabilities.test.ts`
- Modified: `app/api/connections/refresh/route.ts`, `callback/route.ts`, `route.ts` GET, `app/(app)/connections/page.tsx`, `components/connections/connections-client.tsx`, `lib/connectors/status.ts`, tests, control docs

### Reason

Continue Phase 1: connection cards must not advertise send when Composio did not return send tools. Migration 0013 still unapplied — store probe results in existing `scopes` jsonb.

### Design decisions

1. Probe via `composio.tools.get` only (no write execute).
2. Persist under `scopes.capabilities`; optionally write 0013 columns with fallback if missing.
3. UI Refresh button triggers probe; OAuth callback/refresh also probe when connected.

### Test run

```
npm test -- tests/capabilities.test.ts tests/connection-status.test.ts tests/chat-tools-routing.test.ts tests/composio-identity.test.ts tests/approval-policy.test.ts
→ 39 passed
npm run typecheck → exit 0
```

### Remaining

- Apply migration 0013 in Supabase SQL editor
- Live Gmail E2E (chat → Approvals → inbox)
- Inline approval cards in chat (optional UX)

### Rollback

Revert capability module + refresh route; connections still work with status-only refresh.

---

## 2026-07-12 — Phase 0 docs + Phase 1 claim/receipt/Gmail args

**Time:** ~13:15 UTC+1  
**Phase:** 0 → 1  
**Branch:** `upgrade/phase-b`

### Files

- Created: `ARIA_IMPLEMENTATION_MASTER_PLAN.md`, `ARIA_IMPLEMENTATION_TODO.md`, `ARIA_IMPLEMENTATION_LOG.md`, `ARIA_ARCHITECTURE_DECISIONS.md`, `ARIA_SESSION_HANDOFF.md`
- Modified: `lib/connectors/chat-approval.ts`, `lib/agent/types.ts`, `lib/agent/approval-policy.ts`, `lib/agent/execute.ts`, `components/approvals/approvals-client.tsx`, related tests

### Reason

Phase 0 baseline required before further work. Highest verified Phase 1 gap after prior Composio wiring: approval could stay `approved` and be re-executed; Composio Gmail uses `recipient_email` so summaries showed “(unknown)”.

### Design decisions

1. Claim-once via status transition `approved` → `executing` → `succeeded`|`failed` (ADR-007).
2. Normalize mail fields for Composio + local tool arg shapes.
3. Soften agent simulation copy (no fake success checkmark).

### Test run

```
npm test -- tests/chat-tools-routing.test.ts tests/composio-identity.test.ts tests/connection-status.test.ts tests/approval-policy.test.ts tests/payload-lock.test.ts
→ 38 passed
npm run typecheck → exit 0
```

### Remaining

- Apply migration 0013
- Live Gmail E2E
- Scope/capability probe

### Rollback

- `CHAT_TOOLS_ENABLED=false` for chat tools
- Revert `chat-approval.ts` for claim logic; approvals already decided stay as stored

---

## Prior work absorbed (2026-07-12 earlier) — see also `ARIA_REPAIR_LOG.md`

Summary of already-landed repair (do not redo):

- Stable Composio user id = Supabase UUID
- `@composio/core` tools.get + dangerous→approval
- Chat `streamText` tools when intent needs them
- Instant intent skips tools/memories/memory-suggest
- Connection status labels + dual-read persistence until 0013
- Tests: connection-status, chat-tools-routing, composio-identity
