# Aria Architecture Decisions

Short ADR-style records for continuity across coding sessions.

---

## ADR-001 — Keep Composio as connector source of truth

- **Decision:** Do not rebuild per-provider OAuth or store access/refresh tokens in Aria.
- **Context:** Connections already store `composio_connection_id` / `composio_entity_id`. Chat historically failed because tools were not registered, not because OAuth was wrong.
- **Options:** (A) Composio-only (B) Dual token vault (C) Replace with raw Google OAuth.
- **Chosen:** A.
- **Trade-offs:** Dependent on Composio availability and slug schemas; gains speed and token security.
- **Reversal:** New connectors table + OAuth apps; migrate connected accounts carefully.

---

## ADR-002 — Stable Composio user id = Supabase auth UUID

- **Decision:** `stableComposioUserId(userId) === userId` at connect and execute.
- **Context:** Identity drift between tabs/devices would orphan connected accounts.
- **Options:** (A) Auth UUID (B) Workspace UUID (C) Random entity per connection.
- **Chosen:** A (matches existing OAuth initiate path).
- **Trade-offs:** Workspace-shared connectors still keyed by connecting user entity; multi-member workspaces must reconnect per user or explicitly share later.
- **Reversal:** Mapping table `composio_identities` if multi-user workspace sharing is required.

---

## ADR-003 — AI SDK 3.4 + @composio/core wrap (not @composio/vercel)

- **Decision:** Load toolkit tools via `composio.tools.get` and wrap as Vercel AI SDK v3 `tool()`.
- **Context:** `@composio/vercel` peers `ai@6+`; Aria is on `ai@3.4.7`.
- **Options:** (A) Wrap core tools (B) Upgrade entire AI SDK (C) REST-only local registry.
- **Chosen:** A for Phase 1.
- **Trade-offs:** Manual wrap; Tool Router `session.tools()` meta-tools avoided for clearer approval gating.
- **Reversal:** Upgrade AI SDK later, then optionally adopt official Vercel provider.

---

## ADR-004 — Dual-write connection status until migration 0013

- **Decision:** Persist legacy `active|pending|error|disconnected` via `persistableConnectionStatus`; UI/runtime use canonical labels.
- **Context:** No DATABASE_URL for automated migrate; app must stay runnable.
- **Trade-offs:** DB values lag vocabulary until 0013 applied.
- **Reversal:** After 0013, persist canonical statuses directly.

---

## ADR-005 — Dangerous Composio tools create approvals; never auto-execute

- **Decision:** Slug regex gates send/delete/create/post; execute only after Approvals decide + payload hash verify.
- **Context:** Product rule: consequential writes need explicit approval bound to args.
- **Trade-offs:** UX requires Approvals page until inline cards exist.
- **Reversal:** N/A for safety; only UX can move the approve surface.

---

## ADR-006 — Instant intent skips expensive work

- **Decision:** Deterministic `instant` class skips memories, tools, Composio, memory-suggest, uses compact prompt.
- **Context:** Greetings were slow due to full path.
- **Trade-offs:** Edge-case short messages that need memory may need `personal_context` patterns (already partially covered).
- **Reversal:** Feature flag or expand INSTANT_RE carefully.

---

## ADR-007 — Claim-once chat tool execution

- **Decision:** After approve, atomically set `status=executing` only from `approved`, then `succeeded` or `failed`. Reject replay.
- **Context:** Payload lock alone does not prevent double send if execute is invoked twice while status remains `approved`.
- **Options:** (A) Status claim (B) Separate `action_executions` unique idempotency table (C) DB advisory lock.
- **Chosen:** A for Phase 1 (uses existing approvals row); B later if multi-step receipts need history.
- **Trade-offs:** Status vocabulary expanded without a migration (text column). Agent policy must treat terminal statuses as non-execute.
- **Reversal:** Add `action_executions` migration and treat approvals as proposals only.

---

## ADR-008 — Capability probe via tools.get; store in scopes until 0013

- **Decision:** Infer read/draft/send from Composio toolkit tool slugs; persist under `connections.scopes.capabilities`.
- **Context:** No DATABASE_URL to apply migration 0013; `scopes` jsonb already exists.
- **Options:** (A) scopes jsonb now (B) wait for 0013 (C) invent parallel table.
- **Chosen:** A with optional write to 0013 columns + fallback on missing-column errors.
- **Trade-offs:** Slight overload of `scopes` meaning; clear nested `capabilities` key.
- **Reversal:** After 0013, prefer `capabilities` column and keep scopes for OAuth scope strings.
