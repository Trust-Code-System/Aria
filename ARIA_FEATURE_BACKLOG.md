# Aria Feature Backlog

**Date:** 2026-07-12  
**Rule:** Research/architecture approval before large builds. Composio reliability may continue separately.

Scoring shorthand: Impact / Effort / Risk = High|Med|Low.

---

## P0 — Reliability and safety

- [ ] **Verified Composio tool path in chat**  
  - Benefit: Connected apps actually work from chat  
  - Impact: High | Effort: Med | Risk: Med  
  - Dependencies: Stable user id, toolkit-scoped tools  
  - Acceptance: Real Gmail send returns provider message id; failure surfaces honest error  
  - Tests: Live probe + E2E with test mailbox  
  - Sources: Composio docs; `ARIA_REPAIR_*`

- [ ] **Approval lock + invalidate on arg change**  
  - Benefit: No approval reuse for altered sends  
  - Impact: High | Effort: Low–Med | Risk: Low  
  - Dependencies: Approvals table  
  - Acceptance: Changed To/Subject/Body requires new approval  
  - Tests: Unit on lock hash  
  - Sources: Research security; repair plan

- [ ] **Action receipts (no success without evidence)**  
  - Benefit: Trust  
  - Impact: High | Effort: Med | Risk: Low  
  - Dependencies: Tool result logging  
  - Acceptance: UI shows provider status/id or explicit failure  
  - Tests: Mock provider success/fail  
  - Sources: Research §14

- [ ] **Remove / quarantine simulated success paths**  
  - Benefit: Never claim fake sends  
  - Impact: High | Effort: Med | Risk: Low  
  - Dependencies: Agent execute  
  - Acceptance: No `SIMULATED_NOTE` for user-visible external actions  
  - Tests: Agent path integration  
  - Sources: Research §14

- [ ] **Intent router skips unused RAG/tools**  
  - Benefit: Speed + cost  
  - Impact: Med | Effort: Low | Risk: Low  
  - Dependencies: Intent module  
  - Acceptance: Greeting path <1s model start; no tool load  
  - Tests: Routing unit tests  
  - Sources: Matrix instant path

- [ ] **Connector status honesty**  
  - Benefit: User knows Action required vs Connected  
  - Impact: Med | Effort: Low | Risk: Low  
  - Dependencies: Status migration/UI  
  - Acceptance: Badges match probe  
  - Tests: Status mapping tests  
  - Sources: Repair plan

- [ ] **Prompt-injection guards on tool args**  
  - Benefit: Contain email/web attacks  
  - Impact: High | Effort: Med | Risk: Med  
  - Dependencies: Trifecta / scanner  
  - Acceptance: Fixtures blocked; legit sends pass  
  - Tests: Injection fixtures  
  - Sources: Browser security research

---

## P1 — Core personal intelligence

- [ ] **Core profile card always-on**  
  - Benefit: Consistent self-knowledge  
  - Impact: High | Effort: Med | Risk: Low  
  - Dependencies: Memory schema  
  - Acceptance: Profile facts answered without RAG  
  - Tests: Memory eval set  
  - Sources: `ARIA_MEMORY_SYSTEM_V2.md`

- [ ] **Ranked memory retrieval + categories**  
  - Benefit: Less noise  
  - Impact: High | Effort: Med | Risk: Med  
  - Dependencies: Embeddings, categories  
  - Acceptance: Caps enforced; provenance shown  
  - Tests: Retrieval eval  
  - Sources: Mem0/Letta patterns

- [ ] **Contradiction / supersede flow**  
  - Benefit: Corrections stick safely  
  - Impact: Med | Effort: Med | Risk: Low  
  - Dependencies: Memory versions  
  - Acceptance: No silent overwrite  
  - Tests: Contradiction cases  
  - Sources: Memory V2

- [ ] **Chat history search tool**  
  - Benefit: Cross-chat recall without dump  
  - Impact: High | Effort: Med | Risk: Low  
  - Dependencies: Message index  
  - Acceptance: Finds older fact in ≤3s typical  
  - Tests: Seeded chats  
  - Sources: Claude chat search pattern

- [ ] **Project context pack**  
  - Benefit: Project-aware answers  
  - Impact: Med | Effort: Med | Risk: Low  
  - Dependencies: Projects + tasks  
  - Acceptance: Active project injects pack  
  - Tests: Project-scoped retrieve  
  - Sources: Claude Projects

- [ ] **Out-of-band memory extraction**  
  - Benefit: Learn without slowing chat  
  - Impact: Med | Effort: Med | Risk: Med  
  - Dependencies: Jobs + suggest UI  
  - Acceptance: Candidates appear async  
  - Tests: Extract quality sample  
  - Sources: Mem0 pipeline

---

## P2 — Chief-of-staff capabilities

- [ ] **Morning briefing job + Today artifact**  
  - Benefit: Day starts decided  
  - Impact: High | Effort: High | Risk: Med  
  - Dependencies: Calendar/Gmail read, scheduler  
  - Acceptance: Brief generated with honest empty states  
  - Tests: Fixture connectors  
  - Sources: `ARIA_CHIEF_OF_STAFF_PLAN.md`

- [ ] **Inbox triage + draft replies**  
  - Benefit: Email time saved  
  - Impact: High | Effort: High | Risk: High  
  - Dependencies: Verified Gmail  
  - Acceptance: Drafts only; send via approval  
  - Tests: Sandbox mailbox  
  - Sources: CoS products

- [ ] **Meeting prep pack**  
  - Benefit: Better meetings  
  - Impact: Med | Effort: Med | Risk: Low  
  - Dependencies: Calendar + Contacts + RAG  
  - Acceptance: Pack before meeting or on demand  
  - Tests: Fixture event  
  - Sources: CoS plan

- [ ] **Follow-up / commitment tracker**  
  - Benefit: Fewer dropped balls  
  - Impact: High | Effort: Med | Risk: Med  
  - Dependencies: Mail parse + Contacts  
  - Acceptance: Overdues in brief  
  - Tests: Commitment fixtures  
  - Sources: CoS plan

- [ ] **Evening review + weekly review**  
  - Benefit: Closure loop  
  - Impact: Med | Effort: Med | Risk: Low  
  - Dependencies: Scheduler, artifacts  
  - Acceptance: Generated on schedule  
  - Tests: Job runs  
  - Sources: CoS plan

- [ ] **Proactivity / quiet-hours settings**  
  - Benefit: Not annoying  
  - Impact: Med | Effort: Low | Risk: Low  
  - Dependencies: Settings  
  - Acceptance: Caps enforced  
  - Tests: Settings unit  
  - Sources: CoS plan

---

## P3 — Browser and application actions

- [ ] **Extension page context → chat**  
  - Benefit: Page-aware help  
  - Impact: Med | Effort: Med | Risk: Med  
  - Dependencies: Extension bridge  
  - Acceptance: Summarize active tab  
  - Tests: Fixture page  
  - Sources: `ARIA_BROWSER_OPERATOR_PLAN.md`

- [ ] **Form fill with approval (no auto-submit)**  
  - Benefit: Applications/forms faster  
  - Impact: High | Effort: High | Risk: High  
  - Dependencies: Profile, allowlist  
  - Acceptance: Field table approve → fill  
  - Tests: HTML form fixtures  
  - Sources: Browser plan

- [ ] **Domain allowlist + injection defenses**  
  - Benefit: Safer browse  
  - Impact: High | Effort: Med | Risk: Med  
  - Dependencies: Settings  
  - Acceptance: Off-list blocked  
  - Tests: Allowlist unit + injection pages  
  - Sources: Browser plan

- [ ] **Playwright worker for long tasks**  
  - Benefit: Multi-step automation  
  - Impact: Med | Effort: High | Risk: High  
  - Dependencies: Jobs, receipts  
  - Acceptance: Checkpointed run with receipts  
  - Tests: Local fixture site  
  - Sources: browser-use / Playwright

- [ ] **Toolkit-scoped Composio tools (Notion/GitHub/Slack)**  
  - Benefit: Real multi-app actions  
  - Impact: High | Effort: Med | Risk: Med  
  - Dependencies: Chat tools path  
  - Acceptance: One verified write per app  
  - Tests: Live or sandbox  
  - Sources: Composio

- [ ] **Cross-app durable workflow runner**  
  - Benefit: Less app switching  
  - Impact: High | Effort: High | Risk: High  
  - Dependencies: Jobs + approvals  
  - Acceptance: Notion+GitHub example with receipts  
  - Tests: Workflow integration  
  - Sources: Target architecture

---

## P4 — Business operations

- [ ] **CRM-lite follow-ups on Contacts**  
  - Benefit: Pipeline discipline  
  - Impact: High | Effort: Med | Risk: Med  
  - Dependencies: Contacts + Gmail  
  - Acceptance: Follow-up list + draft  
  - Tests: Contact fixtures  
  - Sources: Research business §

- [ ] **Proposal / report from knowledge + research**  
  - Benefit: Sales speed  
  - Impact: Med | Effort: Med | Risk: Low  
  - Dependencies: Reports, research  
  - Acceptance: Cited draft artifact  
  - Tests: Sample pack  
  - Sources: Existing reports

- [ ] **Project blocked digest**  
  - Benefit: See drift early  
  - Impact: Med | Effort: Low–Med | Risk: Low  
  - Dependencies: Tasks/projects  
  - Acceptance: Weekly + on demand  
  - Tests: Seeded blocked tasks  
  - Sources: CoS

- [ ] **Competitor / opportunity watch**  
  - Benefit: Signal capture  
  - Impact: Med | Effort: Med | Risk: Low  
  - Dependencies: Scheduler + research  
  - Acceptance: Weekly digest with sources  
  - Tests: Mock search  
  - Sources: Research agent patterns

- [ ] **Invoice draft assist (templates only)**  
  - Benefit: Admin help  
  - Impact: Low–Med | Effort: Med | Risk: High  
  - Dependencies: Business memory  
  - Acceptance: Draft only; no payment send  
  - Tests: Template render  
  - Sources: Matrix (delay full ERP)

---

## P5 — Advanced autonomy

- [ ] **Multi-agent plan with gated sends**  
  - Benefit: Complex requests  
  - Impact: Med | Effort: High | Risk: High  
  - Dependencies: Orchestrator, approvals  
  - Acceptance: Research→draft→approve→send  
  - Tests: Delegation sequence  
  - Sources: Architecture §4.10

- [ ] **Coding agent → PR with approval**  
  - Benefit: Build features via Aria  
  - Impact: Med | Effort: High | Risk: High  
  - Dependencies: GitHub, coding model  
  - Acceptance: PR URL only after approve  
  - Tests: Dry-run repo  
  - Sources: Coding agents benchmark

- [ ] **Temporal-class durability (if needed)**  
  - Benefit: Long reliable workflows  
  - Impact: Med | Effort: High | Risk: Med  
  - Dependencies: Ops complexity  
  - Acceptance: Survive process restart  
  - Tests: Kill mid-job  
  - Sources: Temporal+LangGraph docs

---

## P6 — Experimental

- [ ] Voice brief readout  
- [ ] Local-only offline mode  
- [ ] Full vision computer-use  
- [ ] Cloud browser vendor  
- [ ] Auto-archive low-risk mail (strict rules)

**Explicitly out of backlog (do not build):** auto-send email; autonomous payments; password-manager scraping; silent memory overwrite; fake success simulation.

---

*Prioritization detail: `ARIA_CAPABILITY_MATRIX.md`. Phasing: `ARIA_90_DAY_ROADMAP.md`.*
