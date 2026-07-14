# Aria Agent Reliability Repair

Last updated: 2026-07-14

This file is the tracked implementation record for the personal-agent reliability repair. A checkbox is marked complete only when the implementation exists and its relevant automated validation passes. Items requiring live provider or deployed-environment verification remain open until that evidence exists.

## Current architecture summary

- [x] Document the authenticated chat request, persistence, streaming, and client rendering flow.
- [x] Document model routing, provider capability checks, fallbacks, and context assembly.
- [x] Document Supabase message, memory, approval, connection, audit, and RLS data paths.
- [x] Document Composio identity, connection discovery, tool selection, approval, execution, and receipt paths.
- [x] Document chat, approval inbox, memory, connection, and admin UI behavior.
- [x] Document environment validation, telemetry, and deployment controls.

Current flow: authenticated App Router handlers obtain a Supabase session/workspace, write conversations and messages through the RLS-scoped client, assemble project/memory/RAG context, resolve a Vercel AI SDK v3 model, selectively wrap discovered Composio tools, and return a text stream. The React chat client owns optimistic bubbles and consumes the raw stream. Composio owns OAuth and execution; Aria stores only its stable Supabase-user mapping, connected-account reference, locked approval payload, safe metadata, and audit records. Consequential tools create approval rows and execute later through Composio after a conditional claim. Memories are workspace/project scoped, with manual approved rows and model-extracted suggested rows. The admin surface reads service-role error/audit metadata only. Production currently redirects anonymous `/chat` and `/dashboard` requests to login and returns 401 for anonymous connector API access.

## Confirmed defects and assumptions

- [x] Confirm and record the causes of duplicate user turns, empty assistant records, and weak failure state handling.
- [x] Confirm and record client double-submit and retry behavior.
- [x] Confirm and record failed/blank/duplicate history inclusion behavior.
- [x] Confirm and record model capability and fallback defects.
- [x] Confirm and record Gmail discovery, normalization, approval, execution, and receipt defects.
- [x] Confirm and record approval locking, replay, stale approval, and identity guarantees.
- [x] Confirm and record explicit and implicit memory classification, storage, retrieval, and failure visibility defects.
- [x] Confirm and record core-profile availability and precedence.
- [x] Confirm and record cross-conversation history retrieval behavior.
- [x] Record assumptions and constraints that cannot be verified locally.

Confirmed findings: messages have no execution status, error, trace, turn, or request-id columns; the API inserts the user before work and creates a blank assistant placeholder; terminal failures do not update that row; the client removes only its local assistant bubble; persisted history includes all nonblank rows without status/deduplication; retry creates a new user turn; and a React state boolean is not an immediate same-tick submission mutex. `streamText` can defer provider failure until stream consumption, so the current synchronous fallback loop is not a reliable fallback boundary. Configured models are selected by key presence but have no capability registry or runtime compatibility validation, and the hard-coded “latest” IDs cannot be assumed to exist. Gmail tools are filtered by a small slug regex, write risk is regex-only, capability lines can label a connection connected without a requested capability, and any non-throwing provider result is recorded as success. Approval payload hashes and conditional execution claims exist and are valuable, but expiry is lazy and not enforced at decision/claim time; chat approvals link only through JSON metadata and have no inline event/message UI. Explicit memory commands go through normal generation, attachments are classified as simple generation, short personal statements skip extraction, extraction errors are swallowed, retrieval returns recent rows rather than scored relevance, profiles contain only name/email/avatar and are never injected, and no cross-conversation search exists. Local tests do not exercise the chat route, stream failure state, approval route concurrency/provider-result validation, RLS against a real database, or any authenticated connector E2E.

Assumptions/constraints: no production Supabase migration was applied in this session; no provider credentials or private connector payloads were inspected; no authenticated production session was used; and no real Gmail send was attempted. Live OAuth scopes, account capabilities, model quotas, and provider receipts therefore remain deployment checks.

## Phase 1: baseline audit and reproduction

- [x] Inspect the repository structure and required chat, AI, connector, API, UI, migration, environment, telemetry, and test files.
- [x] Review recent history for affected modules.
- [x] Run `npm install` and record the result.
- [x] Run `npm run typecheck` and record all pre-existing failures.
- [x] Run `npm test` and record all pre-existing failures.
- [x] Run `npm run build` and record all pre-existing failures.
- [x] Add focused reproduction tests that fail for confirmed defects before their fixes.

## Phase 2: chat reliability and error UX

- [x] Add backward-compatible message execution states: pending, streaming, completed, failed, and cancelled.
- [x] Add safe error details and sanitized trace IDs without exposing private payloads.
- [x] Persist each user message and assistant turn exactly once.
- [x] Add per-submission idempotency and network-retry deduplication.
- [x] Mark successful, failed, timed-out, and cancelled turns accurately.
- [x] Ensure no failed assistant record is left blank or unexplained.
- [x] Add a client request lock for click and Enter submission paths.
- [x] Add retry of a failed assistant turn without duplicating the original user message.
- [x] Exclude failed, blank, and duplicate records from model context.
- [x] Ensure a greeting cannot continue an unrelated failed action request.
- [x] Add bounded history/context assembly and long-conversation handling.
- [ ] Add user-facing categories for quota, model, connector, approval, execution, memory, migration, timeout, and network failures.
- [x] Ensure every failed send says that nothing was sent.

## Phase 3: model routing and agent loop

- [x] Route greetings, actions, reasoning, coding, vision, and memory extraction by capability.
- [x] Validate configured provider/model IDs and capability compatibility at runtime.
- [x] Bound provider fallback and preserve the original diagnostic error.
- [x] Add selective context, memory, research, and connector fast paths.
- [x] Add bounded agent-loop step, duration, and tool-call limits.
- [x] Return tool results to the model before final response generation.
- [x] Persist auditable tool calls and tool results without private payload leakage.
- [x] Keep normal answers, drafts, approvals, running actions, completions, and failures distinct.
- [x] Prevent tool failures from being represented as success.

## Phase 4: connectors, Gmail, approvals, and receipts

- [x] Use the stable Supabase user UUID for every Composio connection and execution path.
- [x] Validate Composio configuration, auth config, connection state, account ID, and capabilities by layer.
- [x] Discover tools selectively by required toolkit.
- [x] Normalize known provider tool names and argument variants safely.
- [x] Add a central tool policy for read-only, reversible, consequential, destructive, and prohibited actions.
- [x] Execute eligible safe reads directly and require locked approval for consequential writes.
- [x] Lock approvals to the exact normalized tool and canonical arguments.
- [x] Claim approved actions atomically and prevent duplicate, replayed, stale, or cross-user execution.
- [x] Verify provider responses before recording success.
- [x] Store action receipts with provider, action, destination, timestamp, provider reference, and final status.
- [x] Link chat-originated approvals and receipts to their conversation/turn.
- [x] Render inline approval cards with application, action, destination, preview, risk, connection, edit, reject, and approve controls.
- [x] Preserve second confirmation for high-risk actions.
- [x] Show executing, completed, and failed states inline.
- [x] Preserve the global Approval Inbox.
- [x] Generalize the same policy and receipt behavior to Calendar, Drive, Slack, Notion, GitHub, and other discovered toolkits.

## Phase 5: memory, profile, and history recall

- [x] Deterministically recognize explicit save, update, forget, delete, and recall commands.
- [x] Save explicit non-secret memory as approved with provenance and an Undo path.
- [x] Reject credentials and secrets from memory storage.
- [x] Deduplicate, update, and supersede older memory correctly.
- [x] Create inactive implicit suggestions only from user-supported durable facts.
- [x] Render inline approve, edit, and dismiss controls for suggestions.
- [ ] Support attachment/CV durable-memory extraction grouped for approval.
- [x] Formalize authoritative core-profile fields and inject them into authenticated turns.
- [x] Enforce precedence: current instruction, core profile, active approved memory, project memory, retrieved context, general knowledge.
- [x] Add memory category, importance, confidence, provenance, last-used, active state, superseding, project scope, and expiry support where missing.
- [x] Retrieve a bounded relevant memory set rather than the latest records.
- [x] Add memory search, approve, edit, disable, delete, source, scope, and superseded views.
- [x] Add bounded workspace/project-isolated chat-history search with an opt-out.
- [x] Replace silent memory failure catches with safe logging, trace IDs, and telemetry outcomes.

## Phase 6: environment, security, and operations

- [x] Add a server-only configuration and migration health service.
- [x] Add an admin UI exposing only safe configured/missing/action-required states and database migration readiness.
- [ ] Add active, non-destructive reachability probes for each configured model and connector provider.
- [x] Enforce or critically warn when `AUTH_DISABLED` is enabled in production.
- [x] Verify server-only credentials never reach client bundles or logs.
- [x] Add diagnostics that redact bodies, tokens, credentials, prompts, and private connector payloads.
- [x] Preserve RLS, workspace isolation, and project isolation for new tables and queries.
- [ ] Test prompt injection in untrusted connected-app content.
- [ ] Test tool-name spoofing, malformed arguments, malicious content, identity mismatch, replay, stale approvals, and production auth bypass.
- [x] Create `docs/PRODUCTION_AGENT_SETUP.md` with Vercel, Composio, OAuth scopes, reconnect, migrations, smoke tests, rollback, and layer-by-layer troubleshooting.

## Test and acceptance criteria

- [ ] Scenario A: `Hi` uses the instant path without RAG, tools, memory extraction, or old failed-turn continuation.
- [ ] Scenario B: explicit company memory is approved, visible, undoable, and recalled in a new conversation.
- [ ] Scenario C: implicit Grok preference stays inactive until inline approval and then affects later prompts.
- [ ] Scenario D: connected Gmail send creates an inline locked approval, sends only once after approval, verifies the provider response, and stores a receipt.
- [ ] Scenario E: disconnected Gmail shows a reconnect path and makes no success claim.
- [ ] Scenario F: quota failure uses only compatible fallbacks, marks failure, avoids duplicates, and leaves no blank assistant bubble.
- [ ] Scenario G: connected Calendar read executes selectively, summarizes provider data, and invents no events.
- [x] Intent routing tests cover greeting, explicit memory phrases, send, continuation, attachment-memory, research, and knowledge mode.
- [ ] Memory tests cover save, suggestion, approval, edit, supersede, disable, delete, secret rejection, global/project isolation, core profile, deduplication, and extraction telemetry.
- [ ] Chat tests cover streaming, fallback, terminal statuses, retry idempotency, context filtering, and greeting isolation.
- [ ] Connector tests cover discovery, disconnection, identity mismatch, capability absence, safe reads, locked approval, exactly-once execution, provider failure, receipt persistence, inline linkage, and honest errors.
- [ ] Production auth, RLS, workspace, project, payload hash, replay, stale approval, and prompt-injection security tests pass.
- [ ] Mock Composio fixtures cover automated provider paths.
- [x] Playwright tests pass where the local environment permits.
- [x] `npm run typecheck` passes after changes.
- [x] `npm test` passes after changes.
- [x] `npm run build` passes after changes.
- [x] No secrets or private payloads are committed.

## Deployment and environment checklist

- [x] Required Vercel environment variables are documented without values.
- [x] Supabase migrations are ordered, backward-compatible, RLS-protected, and documented.
- [x] Composio auth configs, stable identity, connected account IDs, scopes, and reconnection are documented.
- [x] Production `AUTH_DISABLED=false` is documented and enforced/warned.
- [x] Rollback flags and migration rollback considerations are documented.
- [x] Manual live Gmail verification is documented and remains explicitly unverified unless a real provider receipt is observed.

## Final results

- Baseline install: passed (`npm install`, 709 packages audited); npm reported 21 dependency vulnerabilities (8 low, 7 moderate, 4 high, 2 critical).
- Baseline typecheck: passed (`tsc --noEmit`).
- Baseline tests: passed (13 files, 104 tests).
- Baseline production build: passed (Next.js 14.2.13, 42 static pages generated; lint is skipped by the existing build configuration).
- Final typecheck: passed (`tsc --noEmit`).
- Final tests: passed (14 files, 115 tests).
- Final production build: passed (Next.js 14.2.13, 43 static pages generated; lint remains skipped by the existing build configuration).
- Playwright: production anonymous smoke passed (13 tests); 4 authenticated tests skipped because `E2E_EMAIL`/`E2E_PASSWORD` were not provided.
- Live Gmail provider send: not performed; do not mark verified without a real provider-confirmed receipt.
- Remaining limitations and deployment steps: apply migration 0014, configure/reconnect production providers, run authenticated scenarios and real-database RLS tests, and complete the documented provider-confirmed Gmail send. CV suggestions are not yet grouped into a single category review and cross-conversation recall is keyword-ranked rather than semantic.
