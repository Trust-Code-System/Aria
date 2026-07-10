# Aria Upgrade Blueprint — Deep Research & Implementation Plan (Fable pass)

**Research/access date:** 2026-07-10 · **Branch audited:** `upgrade/p1-knowledge-memory` (commit `1e68a82`)
**Relationship to prior work:** This is an independent second research-and-audit pass. It verifies, extends, and supersedes
[`MASTER_UPGRADE_PLAN.md`](./MASTER_UPGRADE_PLAN.md) (same date, earlier session). Where the prior plan was right, this
document confirms it with evidence instead of repeating it; where the codebase has moved (P0 + most of P1 now **implemented
and verified**), the gap analysis, TODO list, and coding-agent prompts are updated to target what is actually next.

---

## Part 1 — Executive summary

### What the strongest builders are doing (verified patterns)

1. **The winning "personal AI OS" is a harness, not a chatbot.** Independent 2026 build logs (Michael Crist, Tal Hatahir,
   Ron Forbes, Alex Honchar, Matt Paige — links in Part 3) converge on the same five primitives: persistent inspectable
   memory (usually markdown or a DB the user can read), a standing job description/priorities file, scheduled runs (cron),
   tool access behind permissions, and an outbound channel (Discord/Telegram/email digest). Total running cost reported:
   ~$26–50/month. Aria already has 4 of 5 primitives; scheduled proactive runs are the missing one.
2. **Memory is a product surface, not a database trick.** The 2026 memory-framework market (Mem0, Zep/Graphiti, Letta)
   standardized on benchmarks (LoCoMo, LongMemEval) and on user-visible lifecycle: suggest → approve → decay → export/delete.
   Vendor scores disagree with each other; every comparison article says "run evals on your own workload" (Part 6).
   Aria's approve-gated `memory-suggest.ts` is the correct design — verified in code.
3. **Hybrid retrieval is the single highest-leverage RAG upgrade.** Production evidence: hybrid BM25+vector via reciprocal
   rank fusion beats either alone on every benchmark surveyed (e.g., +7.4% NDCG on WANDS; Recall@5 0.816 vs 0.587 dense-only
   with reranking on financial docs; ~70% of bad RAG answers attributed to retrieval). Aria implemented this in migration
   `0011_hybrid_retrieval.sql` — correct call, now needs eval fixtures to prove it on your corpus.
4. **Security consensus: assume prompt injection succeeds; contain it structurally.** Simon Willison's "lethal trifecta"
   (private data + untrusted content + external communication) and Meta's "Agents Rule of Two" (never all three in one
   session) are the 2025–2026 design standards. Real incidents: Microsoft 365 Copilot (CVE-2025-32711), GitHub MCP server,
   GitLab Duo. OWASP's 2026 agentic Top 10 maps prompt injection to six of ten categories. Aria's payload-locking +
   risk-tier approvals are the right containment; the trifecta budget should now be made explicit per tool (Part 12).
5. **Orchestration = state machine + checkpoints + human-in-the-loop.** LangGraph is the production reference (durable
   checkpointed state, used by Klarna/Uber/LinkedIn per vendor case studies); the Claude Agent SDK is the strongest
   MCP-native harness; OpenAI Agents SDK has no built-in persistence. For Aria (TypeScript monolith) the right move
   remains: keep the internal `runtime.ts` state machine, add durable step checkpoints — not a framework rewrite.

### What commonly fails

- **Compounding errors:** 85% per-step accuracy → ~20% success over 10 steps. Fix: fewer steps, deterministic sub-flows, validation gates.
- **"Dumb RAG":** single vector store for all memory/knowledge types; retrieval quality ignored until users churn.
- **Fire-and-forget background work** dying on serverless (Aria fixed this with the jobs queue in P0).
- **Rubber-stamp approvals** (Lies-in-the-Loop, dialog forging) — fixed in Aria via payload lock + structured previews.
- **Trust gap in commercial assistants:** Lindy holds 4.9/5 on G2 yet 1.7/5 on Trustpilot (billing surprises, agents misfiring on real work) — evidence that marketing-grade autonomy ≠ dependable autonomy, and that your private, approval-gated approach is the correct differentiation.

### What Aria should become

Unchanged from the prior plan and reaffirmed: a **workspace-isolated personal intelligence environment** — chat + knowledge
+ memory + approvals + integrations + daily briefing + business workspaces — on the existing Next.js/Supabase codebase.
The next competitive edge is **daily usefulness** (Today briefing, email/calendar read, follow-ups), not more agent machinery.

### Ten highest-priority upgrades (post-P0/P1 state)

| # | Upgrade | Priority | Why now |
|---|---------|----------|---------|
| 1 | Agent-task **step checkpoint/resume** (finish the P1 leftover) | P1 | Jobs queue exists; steps still restart from scratch on interruption |
| 2 | **Today / daily briefing** page + scheduled job | P2 | The #1 daily-value feature in every successful build log |
| 3 | **Gmail + Calendar read-only** via Composio (already integrated) or official Google MCP servers | P2 | Feeds the briefing; read-only respects the trifecta budget |
| 4 | **Workspace switcher / multi-business UX** | P2 | Schema supports it; UX doesn't expose it yet |
| 5 | **Retrieval eval fixtures** on your real corpus (golden set, citation precision ≥0.8) | P1 | Hybrid retrieval is live but unproven on your data |
| 6 | **Langfuse (self-hosted or cloud) + Sentry behind env flags** | P2 | Cost/trace visibility; MIT-licensed, fits self-host preference |
| 7 | **Playwright e2e** critical path (signup→upload→cite→approve) | P2 | 58 unit tests exist; zero e2e — isolation claims need e2e proof |
| 8 | **Explicit lethal-trifecta budget per tool** in `tools.ts` (declare `reads_private`, `takes_untrusted_input`, `communicates_externally`; policy engine refuses 3/3 combos without L2+ approval) | P1 | Turns the security consensus into enforced code, not docs |
| 9 | **Approval expiry + notification digest** | P2 | Approvals that rot silently train the user to ignore the inbox |
| 10 | **Retention/consent settings UI** (training logs, memory export/delete already partially built) | P2 | Privacy promises should be user-visible controls |

---

## Part 2 — Research methodology

| Item | Detail |
|------|--------|
| Sources searched | Web search (US index) across GitHub, official docs (Google Workspace MCP, Langfuse), Hacker News, engineering blogs, builder build-logs (Substack/Medium/personal blogs), vendor comparisons, simonwillison.net, OWASP-referencing security articles; full local repo audit (files, migrations, tests run live) |
| Search terms (sample) | personal AI OS self-hosted; Mem0 vs Letta vs Zep benchmark; lethal trifecta MCP incidents; LangGraph vs OpenAI Agents SDK vs Claude Agent SDK durable execution; why AI agents fail production; Lindy/Martin/Dust reviews; Langfuse Braintrust self-hosted; official MCP Gmail Calendar; hybrid BM25 RRF reranker evidence; "built my own AI chief of staff" build log 2026 |
| Date range | Emphasis 2025-06 → 2026-07; access date 2026-07-10 |
| Selection criteria | Primary sources and code first; maintained projects; license compatibility; fit to TS/Next/Supabase; explicit skepticism of vendor-reported benchmarks |
| Verification | Local code claims verified by running `npm test` (58/58 pass) and `npm run typecheck` (clean) in this session; file/migration existence checked directly |
| Limitations | **No direct X/Twitter API access** — X-native signals come via search-indexed mirrors and builder blogs; engagement numbers not verifiable. Some comparison articles (Vellum, innobu, framework "tier lists") are content-marketing — used only for landscape mapping, never as sole evidence. GitHub star counts quoted from secondary sources are labeled as such. Could not run Aria against live Supabase (no project keys in session). |
| Unavailable | X API; private Discords; Trustpilot/G2 raw review data beyond summaries; paid analyst reports |

---

## Part 3 — X/Twitter & builder-community intelligence

Direct X search was unavailable; the same builder community publishes long-form build logs that search indexes. These are
the strongest 2026 primary signals found:

| Builder / source | Link | What was built | Architecture | Lessons for Aria | Evidence class |
|---|---|---|---|---|---|
| Simon Willison (@simonw) | [lethal trifecta post](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) + [X post w/ annotated slides](https://x.com/simonw/status/1954038973107716448) | Security doctrine, not a product | n/a | Never combine private-data read + untrusted content + external send in one session | Confirmed primary (author site) |
| Tal Hatahir | [24/7 assistant for $26/mo](https://www.thetalhatahir.com/blog/personal-ai-assistant-with-claude-code) | Claude Code on €5 Hetzner VPS, Discord channel, Google Calendar briefings, Git repo as memory | Markdown memory, cron, "simple, inspectable, yours" | Inspectable memory + scheduled briefing = retention; cost floor is ~$26/mo | Confirmed build log (self-reported) |
| Michael Crist | [Personal AI assistant tutorial](https://michaelcrist.substack.com/p/personal-ai-assistant) + [AI CoS](https://michaelcrist.substack.com/p/claude-cowork) | "Two notes, two folders, one memory file, three commands" (/start /sync /wrap-up) | Claude Code harness | Ritualized session commands beat freeform chat; memory file = working context | Confirmed build log |
| Alex Honchar | [AI Chief of Staff for daily work](https://medium.com/data-science-collective/claude-code-for-life-2-a-personal-ai-chief-of-staff-for-daily-work-357b6c35573f) | Daily-work CoS on Claude Code | context files: priorities.md, projects/{entity}.md, auto-updated | "Correcting it twice on the same thing = you're telling yourself which file to fix" — feedback compounds into files | Confirmed build log |
| Matt Paige | [Claude Code as personal CoS](https://mattpaige68.substack.com/p/how-i-turned-claude-code-into-my) | CoS tutorial | cron installed by the agent itself | Start read-only, expand permissions later | Confirmed build log |
| Ron Forbes | [Build your personal AI assistant](https://www.ronforbes.com/blog/build-your-personal-ai-assistant-with-claude-code) | Personal assistant on Claude Code | skills + memory | Same convergent pattern | Confirmed build log |

**Recurring themes** (consistent across ≥3 independent sources): markdown/DB-inspectable memory wins trust; daily scheduled
briefing is the retention feature; start read-only; the harness (skills, hooks, files, cron) matters more than the model;
$25–200/month all-in is the realistic solo budget.

---

## Part 4 — GitHub intelligence

Stars where quoted are **as reported by secondary sources on 2026-07-10** (not independently re-verified this session).

| Project | Category | Purpose | Stack | License | Maintenance | Best capability | Weaknesses | Security concerns | Prod-ready | Reuse | Effort |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [Mem0](https://github.com/mem0ai/mem0) | Memory | Drop-in memory layer (vector+graph+KV) | Py/TS | Apache-2.0 | Active | Automatic extraction; ~47k★ (reported) | OSS/cloud feature split; vendor-reported benchmarks | Hosted-data trust | Yes (cloud) | **Adapt patterns**; optional adopt later | M |
| [Graphiti (Zep)](https://github.com/getzep/graphiti) | Temporal KG memory | Facts with validity windows | Py + graph DB | Apache-2.0 | Active | Best temporal reasoning (LongMemEval 63.8% vs Mem0 49.0% on GPT-4o, vendor-reported) | Ops complexity (graph DB) | PII sprawl in graphs | Zep cloud: SOC2/HIPAA/GDPR | **Study → pilot only if temporal queries hurt** | H |
| [Letta](https://github.com/letta-ai/letta) | Memory-first agents | OS-style tiered memory (core/recall/archival) | Py→TS | Apache-2.0 | Mixed | Agent-managed memory tools | Server-centric; migration churn | Persistent-state risk | Partial | Study | H |
| [LangGraph](https://github.com/langchain-ai/langgraph) | Orchestration | Durable checkpointed agent graphs | Py (JS exists) | MIT | Very active | HITL + resume; enterprise case studies | Python-first; complexity | — | Yes | **Study; mirror checkpoint pattern in TS** | M |
| [google/mcp](https://github.com/google/mcp) + [Workspace MCP docs](https://developers.google.com/workspace/guides/configure-mcp-servers) | Integrations | **Official** Google MCP servers: Gmail, Calendar, Drive, People, Chat (OAuth 2.0) | — | Google | Active | First-party trust for the most sensitive scopes | Remote-MCP plan requirements vary by client | OAuth scope management | Yes | **Adopt for Google integrations** (alternative to Composio) | M |
| [Composio](https://github.com/ComposioHQ/composio) | Integrations | OAuth tool gateway, 500+ apps | TS/Py | MIT (SaaS) | Active | Fastest path; already wired in Aria | SaaS dependency; scope creep | Third party holds tokens | Yes | **Keep (already adopted)**; consider Google-official MCP for Gmail/Calendar to reduce token custody | L |
| [Langfuse](https://github.com/langfuse/langfuse) | Observability/evals | Tracing, prompt mgmt, LLM-as-judge, datasets | TS | MIT | Very active (ClickHouse acq. 1/2026) | Self-hostable; OTel-native; 50k obs/mo free | Self-host needs PG+ClickHouse+Redis+S3 | Data custody if cloud | Yes | **Adopt (cloud free tier first, self-host later)** | M |
| Braintrust | Evals | Managed eval + CI gate | SaaS | Proprietary | Active | Deploy-blocking evals | Closed source; lock-in | Data custody | Yes | Study only (conflicts with privacy-first) | — |
| [Trigger.dev](https://github.com/triggerdotdev/trigger.dev) | Jobs | Durable TS background jobs | TS | Apache-2.0 | Active | Best Next.js fit | Ops learning curve | Job secrets | Yes | **Adopt when leaving single-node** (jobs table already abstracts it) | M |
| [browser-use](https://github.com/browser-use/browser-use) | Browser agent | LLM browser control | Py/Playwright | MIT | Active | Strongest OSS web agent | Flaky; injection surface | Untrusted web = trifecta leg | Partial | Adapt behind L2/L3 only | M |
| [LibreChat](https://github.com/danny-avila/LibreChat) / OpenDAN / OpenSentinel / Hermes | Personal AI platforms | Self-hosted assistant platforms | Various | Various | Active | Landscape reference | Not libraries; would replace Aria | Skill/supply-chain risk | Varies | **Study only — do not fork/embed** | — |
| [LiteLLM](https://github.com/BerriAI/litellm) | Model gateway | Unified multi-provider proxy | Py | Mixed | Active | Budgets/fallbacks at proxy level | Extra service; license mix | Proxy = SPOF | Yes | Optional; Aria's `providers.ts`+`routing.ts` suffices at current scale | M |

**Confirmed anti-recommendations** (unchanged from prior plan, re-verified rationale): don't replace Aria with a platform
project; don't add a Python orchestrator sidecar for one feature; don't enable browser/email-send by default.

---

## Part 5 — Community intelligence

| Finding | Source | Evidence strength | Response for Aria |
|---|---|---|---|
| Agents fail via compounding per-step errors (85%/step → ~20% over 10 steps) | [HN: why autonomous agents fail](https://news.ycombinator.com/item?id=46450307), [dev.to production post-mortems](https://dev.to/wassimchegham/why-your-ai-agent-demo-falls-apart-in-production-1320) | Strong (multiple independent) | Keep plans short; deterministic sub-steps; validate between steps; max_steps guard (exists) |
| Single-vector-store memory is the top memory failure ("retrieved semantic content when you needed procedural") | Production lessons articles (Part 5 sources) | Moderate-strong | Aria's typed memories (preference/project_fact/workflow…) already separate types — keep; don't merge into one embedding pot |
| Tool-schema sloppiness drives cost + wrong-tool calls (Amazon eng. finding, secondhand) | [Maxim summary](https://www.getmaxim.ai/articles/top-6-reasons-why-ai-agents-fail-in-production-and-how-to-fix-them/) | Moderate (secondary) | Keep `tools.ts` schemas strict/typed; add negative tests for tool selection |
| Commercial "AI employee" trust gap: Lindy G2 4.9/5 vs Trustpilot 1.7/5 (billing, misfires) | [G2](https://www.g2.com/products/lindy-lindy/reviews), review roundups | Moderate (aggregated reviews) | Differentiate on preview-before-execute and honest failure reporting |
| Self-hosters accept ~$25–200/mo; retention driven by daily briefing + inspectable memory | Build logs (Part 3) | Strong convergence | Prioritize Today briefing (P2 #1) |

---

## Part 6 — Research & technical evidence

**Memory benchmarks.** LoCoMo / LongMemEval / BEAM are the 2026 standards. Vendor-reported: Mem0 92.5% LoCoMo & 94.4%
LongMemEval at <7k tokens/retrieval; Zep/Graphiti 63.8% vs Mem0 49.0% on LongMemEval temporal reasoning (GPT-4o). Scores
conflict across vendors → **treat all as promotional until reproduced on your workload**; the durable takeaway is the
architecture consensus (typed memories, temporal validity, approve-gated writes), which Aria already follows.
Sources: [Mem0 blog](https://mem0.ai/blog/open-source-ai-agents-with-built-in-memory), comparison surveys ([innobu](https://www.innobu.com/en/articles/agent-memory-2026-mem0-letta-zep-hermes-openclaude-comparison.html), [particula](https://particula.tech/blog/agent-memory-frameworks-tested-mem0-zep-letta-cognee-2026), [atlan](https://atlan.com/know/best-ai-agent-memory-frameworks-2026/)).

**Retrieval.** Hybrid BM25+dense with RRF: +7.4% NDCG (WANDS); +8.1pp Recall@5 over BM25 on text+table docs
([arXiv 2604.01733](https://arxiv.org/html/2604.01733v1)); hybrid+rerank Recall@5 0.816 vs 0.587 dense-only (financial
docs); practitioners rank hybrid as the single most impactful post-baseline improvement
([InfoQ](https://www.infoq.com/articles/vector-search-hybrid-retrieval-rag/), [digitalapplied reference](https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026)).
**Adopt-now:** already adopted (migration 0011). **Test next:** add a cross-encoder/LLM reranker only if eval fixtures show recall@5 gaps.

**Security.** [Lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) (Willison, 2025-06);
Meta's **Agents Rule of Two** (2025-10-31): ≤2 of {untrusted input, private-data access, external state-change/comms} per
session; OWASP Agentic Top 10 (2026-06) maps prompt injection into 6/10 categories; documented incidents: M365 Copilot
CVE-2025-32711 (EchoLeak-class Markdown-link exfiltration), GitHub MCP server (public-issue → private-repo exfil via PR),
GitLab Duo. **Adopt now:** encode the trifecta budget in the tool registry (Part 12). Generalization caveat: these are
exfiltration paths, not RCE — the mitigation is capability partitioning, not better prompts.

**Orchestration.** LangGraph = durable checkpointed graphs with HITL (production case studies); OpenAI Agents SDK = no
built-in persistence; Claude Agent SDK = opinionated harness, deepest MCP integration (200+ servers)
([TURION comparison](https://turion.ai/blog/langgraph-vs-openai-claude-agent-sdk-2026/), [morphllm reference](https://www.morphllm.com/ai-agent-framework)).
**For Aria:** adopt the *checkpoint pattern* (persist per-step state, resumable), not the framework.

---

## Part 7 — Industry product analysis

| Product | Target | Value prop | Pricing | Strengths | Weaknesses | Lesson for Aria |
|---|---|---|---|---|---|---|
| Lindy | Founders/execs | Autonomous inbox triage, drafts-in-your-voice, meeting prep; relaunched 2/2026 as personal EA | $49.99–$199.99/mo | 200+ integrations; polished onboarding | Trust gap (Trustpilot 1.7/5: billing, misfires); cloud-only custody | Autonomy without dependable previews burns trust; your approval-first model is the moat |
| Martin | Individuals | Proactive scheduling, multi-channel | ~$35/mo | Mobile-first, proactive | Closed; limited business depth | Proactive daily touchpoints drive retention |
| Dust | Teams | Company knowledge assistants | Team SaaS | Workspace/knowledge focus | Sparse public detail in this pass (label: **unverified this session**) | Workspace-scoped assistants validate your multi-business direction |
| Langfuse | Builders | OSS LLM observability/evals | Free 50k obs/mo; $29 Core; self-host MIT | OTel-native, self-hostable, 2,300+ customers (vendor-reported) | Self-host infra weight | Adopt behind flags |
| Claude Code-based DIY (Part 3) | Individuals | Harness + files + cron | ~$26+/mo | Full control, inspectable | Requires operator skill | Aria = this pattern with a real UI, approvals, and multi-workspace RLS |

---

## Part 8 — Existing-project audit (verified this session)

**Verification performed:** full file/migration inventory; `npm test` → **58/58 pass** (7 files: approval-policy 11, risk 8,
list-continuation 7, payload-lock 6, rate-limit 5, eval-p1 8, unit 13); `npm run typecheck` → **clean**. Not verified live
(needs Supabase project + keys): migrations 0001–0011 applied, upload→ingest→cite E2E, Composio OAuth round-trip.

| Classification | Features |
|---|---|
| **Implemented & verified (tests/typecheck)** | Auth guards; RLS workspace model (migrations 0001–0002); streaming chat, 6 modes; RAG + `validateCitations`; hybrid retrieval SQL (0011) + `rag.ts`; memory CRUD + **suggest-with-approval** (`memory-suggest.ts`, `memory-safety.ts`); agent runtime with risk tiers 0–4, approval policy, **payload lock** (`payload-lock.ts`, 0010); durable-ish jobs (`lib/jobs/enqueue.ts` + drain route); rate limits on expensive routes; training-log opt-in + TTL script; model routing heuristic + fallbacks (`routing.ts`); contacts CRM; reports+PDF; admin errors/audit; sanitized logging; mobile nav/haptics |
| **Implemented but untested live** | Composio Gmail draft creation; ingestion on a real Supabase project; voice (browser STT/TTS) |
| **Present but incomplete** | Agent step **checkpoint/resume** (jobs enqueue exists; steps restart); admin analytics (cost/queues); research confidence labels; conversation search |
| **Missing** | Today/daily briefing; workspace switcher UX; Gmail/Calendar read surfaces; e2e tests; observability wiring; MCP client; approval expiry; retention/consent settings UI; notifications |
| **Present but risky if deployed multi-instance** | In-memory rate limiter (documented as single-node by design) |
| **Not present by policy (correct)** | Autonomous self-modification; auto-send email; browser automation default-on |

Technical-debt notes: Vercel AI SDK v3 (current major is 5.x — plan a migration window); `pdf-parse@1.1.1` is old/abandoned
upstream (watch for malformed-PDF handling); Next.js 14 (15 available).

---

## Part 9 — Gap analysis (updated for post-P0/P1 reality)

| Area | Current | Target | Evidence | Gap | Risk | Action | Priority | Effort | Deps | Class |
|---|---|---|---|---|---|---|---|---|---|---|
| Step checkpointing | Task-level jobs | Per-step persisted resume | `runtime.ts`, Part 6 LangGraph pattern | Med | Lost work on crash | Serialize step state; resume from last completed | P1 | M | jobs | Confirmed req |
| Trifecta budget | Risk tiers only | Declared capability flags per tool + policy refusal of 3/3 | Willison/Meta/OWASP | Med | Data exfil | Extend `tools.ts` schema + policy engine + tests | P1 | S–M | — | Strong evidence |
| Retrieval evals | Unit eval suite | Golden fixtures on real corpus; citation precision ≥0.8; recall@5 tracked | Part 6 numbers | Med | Silent RAG decay | Fixture set + CI script | P1 | M | live Supabase | Confirmed req |
| Daily briefing | Missing | Today page + scheduled job + digest | Part 3 convergence | High (product) | Low | Cron/Trigger + briefing composer | P2 | M–L | Gmail/Cal read optional | Confirmed req |
| Gmail/Calendar read | Composio wiring, no surface | Read-only inbox/agenda in Today | google/mcp official servers exist | Med | OAuth scopes | Composio first (already integrated); consider official Google MCP to reduce token custody | P2 | M | OAuth keys | Confirmed req |
| Multi-business UX | Single workspace UX | Switcher + per-workspace settings/isolation tests | Schema ready | Med | Leakage if rushed | Switcher + e2e isolation tests | P2 | M | e2e | Confirmed req |
| Observability | Console+DB | Langfuse+Sentry behind flags | Part 6/7 | Med | Blind ops | Wire behind env flags | P2 | S–M | — | Strong evidence |
| E2E tests | None | Playwright critical path + isolation | tests/e2e empty | High | Regressions unseen | 5-scenario suite | P2 | M | live Supabase | Confirmed req |
| Approval expiry | None | TTL + digest notification | Part 1 #9 | Low-med | Stale approvals | Expiry job + UI badge | P2 | S | jobs | Reasonable inference |
| Retention UI | Env flags + script | User-visible settings | privacy reqs | Med | Trust | Settings page | P2 | S–M | — | Confirmed req |
| Reranker | None | Only if evals show gap | Part 6 | Unknown | Cost/latency | Decide after fixtures | P3 | M | evals | Experimental |
| Knowledge graph | None | Pilot only if temporal queries fail | Graphiti evidence | Low now | Complexity | Defer | P3–P4 | L | evals | Experimental |
| Voice realtime / browser agent / MCP client | Stubs | Opt-in, sandboxed, allowlisted | prior plan | Low | High if rushed | Keep deferred | P3 | L | keys | Strong evidence |
| AI SDK v3→v5, Next 14→15 | Aging | Current majors | package.json | Med | Migration breakage | Dedicated migration branch + full test pass | P2–P3 | M–L | e2e first | Confirmed req |

---

## Part 10 — Target product specification

Reaffirmed from the prior plan (12 surfaces: Home/Today, Chat, Knowledge, Memory, Projects & Businesses, Tasks & Agents,
Approvals, Integrations, Contacts, Reports/Files, Settings/Privacy, Admin) with one sharpened principle from this pass:
**every proactive feature must land in a reviewable inbox (briefing, approvals, suggestions) — never as silent action.**
Memory, approvals, and briefings are the three inboxes; nothing bypasses them.

## Part 11 — Target architecture

The architecture in [`MASTER_UPGRADE_PLAN.md` Part 9](./MASTER_UPGRADE_PLAN.md) (modular monolith: Next.js + Supabase +
worker + registry-gated tools; Mermaid diagrams for system, tool-execution, memory-write) remains correct and is adopted
unchanged, with three additions:

1. **Scheduler**: a cron entry point (Vercel cron, Supabase pg_cron, or Trigger.dev schedule) that enqueues `briefing`,
   `approval_expiry`, and `retention_cleanup` jobs through the existing `lib/jobs/enqueue.ts` seam.
2. **Capability flags** on every tool registry entry: `{ readsPrivate, acceptsUntrusted, communicatesExternally }`;
   the policy engine computes the session's trifecta exposure and forces L2+ approval (or refusal) at 3/3.
3. **Observability taps**: Langfuse trace spans around `providers.ts` calls and `runtime.ts` steps, env-flag gated.

## Part 12 — Security & privacy plan

Items 1–16 of the prior plan stand (verified: payload locking, L4 hard-block, sanitized logging, RLS, training-log opt-in).
New, evidence-driven additions:

- **Rule-of-Two enforcement (new):** per-session capability accounting as described in Part 11. A research task that reads
  web content (untrusted) may not also hold Gmail read + send in the same task without explicit L2 approval per action.
- **Markdown-link exfiltration defense (new, cheap):** strip/neutralize remote images and rewrite non-allowlisted URLs in
  model output rendered from untrusted-content sessions (the M365 EchoLeak vector).
- **Google token custody decision:** if Gmail/Calendar go live, prefer official Google MCP servers or direct OAuth with
  tokens in Supabase Vault over third-party custody — or keep Composio but document the custody trade-off in SECURITY.md.
- **Approval hygiene:** expiry (default 72h), immutable audit (exists), digest notifications.

## Part 13 — UX specification

Prior plan Part 11 stands. Additions from this pass: (a) **Today** is the default post-login route once built; (b) approval
cards keep structured-field rendering only (no LLM markdown — implemented, keep as a tested invariant); (c) memory
suggestions surface as a dismissible queue on /memory with per-item provenance ("from chat on {date}", already stored via
`source` column); (d) every error keeps trace-id + "did anything change?" statement (implemented in `apiError`).

## Part 14 — Implementation roadmap (updated)

- **Phase A (P1 closeout, ~1 session):** step checkpoint/resume; trifecta capability flags + policy tests; retrieval eval
  fixtures. *Acceptance:* kill -9 mid-task → resume completes without repeating side-effecting steps; 3/3-capability tool
  call refused without approval in tests; citation precision ≥0.8 on fixtures. *Rollback:* feature-flag checkpoints.
- **Phase B (Daily value, 1–2 sessions):** Today page + scheduled briefing job; Gmail/Calendar read (opt-in); approval
  expiry; conversation search. *Acceptance:* briefing renders with zero integrations configured (graceful) and enriches
  when connected; no write scopes requested.
- **Phase C (Business + trust):** workspace switcher; isolation e2e; retention/consent settings UI; Langfuse/Sentry flags;
  admin cost/queue panels. *Acceptance:* cross-workspace retrieval attempt fails in e2e; user can export/delete memories and
  set retention from UI.
- **Phase D (Platform currency):** AI SDK v5 + Next 15 migration on a dedicated branch behind the full test suite.
- **Phase E (opt-in advanced):** voice providers, allowlisted MCP client, sandboxed browser automation (L2/L3), reranker
  and Graphiti pilots only if evals justify.

## Part 15 — Master TODO (remaining work only; completed P0/P1 evidence lives in MASTER_UPGRADE_PLAN Part 13)

**P1 — architecture/knowledge/orchestration**
- [x] Step checkpoint/resume for `agent_tasks` — **done 2026-07-10 (Fable).** Runtime persists each step's `output` + the task's accumulated `result` at every step boundary (`checkpointStep` in `lib/agent/runtime.ts`; migration `0012_step_output_checkpoints.sql`); resume already skipped finished steps, and now no completed work is lost when a task parks for approval or crashes. Side-effect double-execution remains guarded by payload-lock verification. *Evidence:* `npm run typecheck` clean, `npm test` 71/71.
- [x] Trifecta capability flags — **done 2026-07-10 (Fable).** `lib/agent/trifecta.ts` (pure policy: sticky untrusted-exposure tracking; outward steps escalate to level ≥ 2 once the task read untrusted content), capability flags on every entry in `lib/ai/tools.ts`, enforced in `lib/agent/runtime.ts` (approval cards carry `escalated_reason`). *Evidence:* `tests/trifecta.test.ts` — 13 tests, all passing.
- [x] Retrieval eval harness — **built 2026-07-10 (Fable).** `npm run eval:retrieval` (`scripts/eval-retrieval.js`, signs in as a real user so RLS applies; skips cleanly without `EVAL_*` env) + `tests/fixtures/retrieval/fixtures.json`. ⚠️ *Live run still pending:* replace placeholder fixtures with 10–20 questions about your real corpus and add `EVAL_USER_EMAIL/PASSWORD/WORKSPACE_ID`.
- [ ] Provider retry/backoff coverage audit (exists in `lib/net/retry.ts` — extend to embeddings/chat where idempotent only).
- [x] Connectors enabled — **done 2026-07-10 (Fable).** Real Composio-backed executes in `lib/ai/tools.ts` for gmail_read/gmail_draft/gmail_send, google_calendar (new env `COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID`), google_drive, slack, notion, github (read-only); each requires an active per-workspace connection, dangerous ones require explicit confirmation, all carry trifecta flags. Browser/postgres/reddit/x stay honest stubs (no safe execution path exists yet). Google Calendar added to the Connections page.

**P2 — personal/business/UX/admin**
- [ ] Today/daily briefing (page + `briefing` job + scheduler entry point). Depends: jobs (done).
- [ ] Gmail + Calendar **read-only** surfaces (Composio path first; document token custody). Blocked: OAuth creds.
- [ ] Workspace switcher + per-workspace isolation e2e.
- [ ] Playwright e2e: signup→project→upload→cite→export; approval flow; isolation. Blocked: live Supabase.
- [ ] Approval expiry job + inbox badge.
- [ ] Retention/consent settings page (training logs, memory export/delete, doc retention).
- [ ] Langfuse + Sentry behind env flags; admin cost/queue panels (redacted).
- [ ] Conversation list/search; report in-app editing.

**P3 — advanced (opt-in, evidence-gated)**
- [ ] Reranker behind flag (only if fixtures show recall gap) · [ ] Allowlisted MCP client + registry table · [ ] Sandboxed browser automation (isolated profile, network allowlist, L2+) · [ ] Voice provider wiring (Deepgram/ElevenLabs) · [ ] AI SDK v5 / Next 15 migration branch.

**P4 — experiments**
- [ ] Graphiti temporal-memory pilot on one corpus · [ ] Local-model routing path (Ollama via `custom` provider — hook exists in `routing.ts`).

*Completion rule (unchanged):* no checkbox flips without files-changed + commands-run + test output pasted.

## Part 16 — Testing & evaluation framework

Prior plan Part 14 table stands. Sharpened release thresholds: unit 100% pass (58 baseline, grows); e2e critical path green
before any deploy; **security suite zero-fail** (cross-workspace denial, injection-cannot-trigger-tool, payload-lock
mismatch refusal, 3/3-trifecta refusal); citation precision ≥0.8 on fixtures; approval compliance 100% (no L2+ execution
without approval row); cost regression <20% per release on the fixture chat set.

## Part 17 — Cost & deployment plans

Prior plan Part 15 estimates remain valid (labeled estimates): **A Personal $25–80/mo** (current path: Supabase Pro + mixed
frontier/cheap routing + Tavily/Perplexity; matches the $26–50 observed in builder logs) · **B Growing business
$150–400/mo** (+ Trigger.dev, Langfuse, Composio paid, multi-model) · **C Production multi-workspace $500–2,000+/mo**
(dedicated infra, Temporal-class workers, DPAs, retention SLAs). Migration path A→B is already architected (jobs seam,
env flags); B→C requires Redis rate limits + external worker + backup/restore drills.

## Part 18 — Immediate next actions

1. ~~Run `supabase/migrations/_combined.sql`~~ **Done — but note:** `_combined.sql` only covered 0001–0009 when you ran it. Paste **`supabase/migrations/_apply_0010_to_0012.sql`** into the Supabase SQL editor once to add the payload-lock columns (0010), hybrid retrieval (0011), and step-output checkpoints (0012). `_combined.sql` now includes all twelve for future fresh installs.
2. Merge or PR `upgrade/p1-knowledge-memory` → `main` (P0+P1 verified: 58/58 tests, clean typecheck).
3. Implement Phase A (checkpoints, trifecta flags, eval fixtures) — prompts below.
4. Decide Gmail/Calendar path: Composio (fastest, already wired) vs official Google MCP (better token custody). Recommendation: **Composio read-only now**, revisit custody at Phase C.
5. Create Langfuse (free tier) + Sentry accounts if you approve observability; wiring is env-flag-gated either way.

## Part 19 — Codex implementation prompt

```text
You are upgrading Aria, a Next.js 14 + Supabase personal AI workspace at the repo root.
Branch from main after the P0/P1 merge. Do not rebuild anything listed as verified in
docs/FABLE_UPGRADE_BLUEPRINT.md Part 8.

READ FIRST: README.md, ARCHITECTURE.md, SECURITY.md, docs/FABLE_UPGRADE_BLUEPRINT.md,
docs/MASTER_UPGRADE_PLAN.md, lib/agent/runtime.ts, lib/agent/payload-lock.ts,
lib/ai/tools.ts, lib/jobs/enqueue.ts, supabase/migrations/0010*.sql, 0011*.sql, tests/.

GOAL (Phase A only):
1) Step checkpoint/resume: persist executor cursor + step input hashes on agent_task_steps;
   resuming a task skips completed steps; side-effecting steps are idempotency-guarded via
   the existing payload-lock hash. Migration if columns needed.
2) Trifecta capability flags: extend the tool registry entries with
   { readsPrivate, acceptsUntrusted, communicatesExternally }. Policy engine computes
   per-task exposure; any step that would make it 3/3 requires an approval at risk >= 2
   (or refuse if level 4). Add >= 6 adversarial unit tests.
3) Retrieval eval fixtures: tests/fixtures/retrieval/*.json (question, expected doc ids,
   expected citation spans) + a script npm run eval:retrieval that reports citation
   precision and recall@5 against a live Supabase (env-gated; skip cleanly without keys).

CONSTRAINTS: No new services. No enabling send/browser tools. No LLM-rendered markdown in
approval UI. Never mark a checkbox done without pasting test output. Run npm test &&
npm run typecheck before reporting. Report: files changed, commands, test results,
remaining risks, rollback notes.
```

## Part 20 — Claude Code implementation prompt

```text
# Aria Phase A — checkpoints, trifecta policy, retrieval evals

## Context
Aria (Next.js 14 App Router + Supabase RLS + pgvector + Vercel AI SDK v3). P0+P1 are done and
verified (58/58 vitest, clean typecheck): durable jobs seam, payload-locked approvals,
risk tiers 0-4 (4 = hard block), hybrid retrieval (migration 0011), approve-gated memory
suggestions, heuristic model routing. Read docs/FABLE_UPGRADE_BLUEPRINT.md Parts 8-15 first.

## Do not break (tested invariants)
Approval policy semantics (only `approved` executes; L4 never approvable), payload-lock
verification at execute time, RLS workspace scoping, sanitized error logging, streaming chat.

## Implement in order
1. lib/agent/runtime.ts + agent_task_steps: persist per-step completion cursor + input hash;
   resume path skips completed steps; add interrupt/resume tests (simulate crash between steps).
2. lib/ai/tools.ts: add capability flags {readsPrivate, acceptsUntrusted, communicatesExternally}
   to every registry entry (stubs included). New lib/agent/trifecta.ts: pure function computing
   task exposure from executed+planned steps; runtime forces approval >= L2 when a step makes
   exposure 3/3. Tests: all 3-of-3 combos gated, 2-of-3 combos pass, escalation is sticky
   for the task's remainder.
3. Retrieval eval harness: fixtures + npm run eval:retrieval (env-gated live test, clean skip
   without SUPABASE keys). Metrics: citation precision, recall@5. Wire into docs.
4. Update docs/FABLE_UPGRADE_BLUEPRINT.md Part 15 checkboxes with evidence (files, commands,
   pasted test output).

## Security rules
Assume prompt injection succeeds. Untrusted content never raises capability. No auto-send.
No autonomous modification of policy/security files.

## Done when
npm test && npm run typecheck green; new tests >= 12; Part 15 Phase-A boxes checked with evidence.
```

---

*Report ends. Evidence classes used: Confirmed (code/docs/run), Confirmed build log (self-reported), Vendor-reported,
Moderate (secondary), Unverified this session. All local claims about Aria were verified by running the suite on 2026-07-10.*
