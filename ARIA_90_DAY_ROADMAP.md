# Aria 90-Day Roadmap

**Date:** 2026-07-12  
**Assumption:** Single founder + AI coding assistant (≈1 FTE effective). Composio reliability work may run in parallel with Week 1–2.

**Do not implement this entire roadmap in one pass** — this is the plan for approval.

---

## Staffing assumptions

| Role | Allocation |
| --- | --- |
| Founder / product | Prioritization, live E2E tests (real Gmail), security judgment |
| Engineering (you + Cursor) | Implementation  
| External | None required for 90 days |

If bandwidth drops, **protect P0 only**.

---

## Phase overview

| Weeks | Theme | Exit gate |
| --- | --- | --- |
| 1–2 | Trust & connectors | Real tool success + receipts |
| 3–4 | Speed & memory foundation | Instant path + core profile |
| 5–6 | History + project intelligence | History search + project pack |
| 7–8 | Chief of Staff MVP | Morning brief without fake data |
| 9–10 | Browser assist MVP | Page context + approved fill |
| 11–12 | Multi-app workflows + harden | One cross-app durable flow + evals |

---

## Weekly milestones

### Week 1 — Connector truth

- Freeze “success” definition: provider-confirmed only  
- Finish Composio chat toolkit path for Gmail (read + draft + send-with-approval)  
- Approval locks verified  
- **Gate:** One real test email sent and evidenced  
- **Rollback:** `CHAT_TOOLS_ENABLED=false`

### Week 2 — Kill simulation & audit

- Remove/quarantine simulated external actions  
- Action log + receipt UI  
- Injection fixtures on tool args  
- Connector badge honesty in production DB  
- **Gate:** No user-visible simulated send  
- **Security review:** Approval + logging checklist

### Week 3 — Latency & routing

- Intent router hardening (instant / personal / knowledge / action)  
- Skip RAG/tools when unused  
- Model routing policy documented in code comments/config  
- **Gate:** Greeting path measurably faster; cost drop on trivial turns  

### Week 4 — Memory V2 schema

- Categories, confidence, provenance, supersede  
- Core profile always-on  
- Proposed memory UX polish  
- **Gate:** Eval — core facts recalled; no silent overwrite  
- **Rollback:** Feature flag memory v2 retrieval

### Week 5 — Chat history search

- Index/search past messages  
- `search_chat_history` tool  
- Caps in context assembler  
- **Gate:** Cross-chat fact found without full dump  

### Week 6 — Project context pack

- Pack from project + tasks + decisions  
- Isolation tests across projects  
- **Gate:** Project chat uses pack; non-project doesn’t leak  

### Week 7 — Scheduler + Today artifact

- Cron/worker for morning brief skeleton (calendar + tasks first)  
- Dashboard Today surface  
- Quiet hours settings  
- **Gate:** Brief generates with honest empty connector states  

### Week 8 — Inbox triage drafts

- Gmail classify + draft into Approvals  
- Follow-up candidate list  
- **Gate:** Draft-only; send still approval-locked  
- **Security review:** Email content treated as untrusted  

### Week 9 — Extension page context

- Bridge: active tab snapshot → chat  
- Allowlist settings  
- **Gate:** Summarize page on allowlisted fixture  

### Week 10 — Form fill (no submit auto)

- Field map + profile/CV fill plan  
- Approval → apply fills  
- Receipts/screenshots optional  
- **Gate:** Fixture form filled; submit requires second confirm  
- **Security review:** Password fields never auto-filled by Aria  

### Week 11 — Cross-app workflow

- Durable job: e.g. meeting notes → Notion page → GitHub issues (approvals per write)  
- Partial failure recovery UX  
- **Gate:** End-to-end with receipts; resume after approve  

### Week 12 — Eval harness + harden

- Golden sets: memory, routing, approval, injection  
- Observability: tool error rate, latency, cost/turn  
- Docs update; cut experimental scope  
- **Release criteria:** P0+P1 complete; CoS MVP usable; browser read+fill usable  
- **Rollback strategy:** flags per subsystem; keep Composio OAuth intact  

---

## Dependencies (critical path)

```
Composio verified send
    → Approvals/receipts
        → Inbox triage / CoS mail
Memory V2 + history search
    → Meeting prep quality
Scheduler + artifacts
    → Morning brief
Extension bridge
    → Form fill
Jobs/durable runner
    → Cross-app workflows
```

---

## Technical risks

| Risk | Mitigation |
| --- | --- |
| Composio tool schema / rate limits | Toolkit scoping; retries; diagnostics |
| Embedding provider quota | Google/OpenAI fallback already; monitor |
| Browser flaky selectors | Prefer labels/accessibility; fixtures |
| Prompt injection via email | Untrusted content policy + scanner |
| Scope creep to computer-use | Hard delay vision-full to post-90d |
| Solo bandwidth | Weekly cut list; P0 sacred |

---

## Security reviews (scheduled)

| When | Focus |
| --- | --- |
| End Week 2 | Tools + approvals + logs |
| End Week 8 | Email triage + untrusted content |
| End Week 10 | Browser allowlist + credentials |
| End Week 12 | Full checklist + retention |

---

## Evaluation gates

Promotions to “done” require:

1. Automated tests for the subsystem  
2. One live happy path (founder)  
3. One failure path (auth error / deny / partial)  
4. No fake success  

---

## Release criteria (Day 90)

**Must have**

- Verified connector actions with receipts  
- Instant path + Memory V2 core  
- History search  
- Morning brief (calendar/tasks minimum)  
- Extension page summarize + approved fill  

**Nice if ready**

- Full inbox draft triage  
- Cross-app Notion+GitHub job  

**Explicitly deferred**

- Auto-send  
- Cloud computer-use  
- Full ERP/invoicing  
- Letta/Temporal rewrite  
- Voice / local-only  

---

## Rollback strategy

| Layer | Mechanism |
| --- | --- |
| Chat tools | `CHAT_TOOLS_ENABLED` |
| Memory V2 retrieval | Flag → legacy memory inject |
| CoS jobs | Disable cron |
| Browser | Extension version pin; disable bridge API |
| Workflows | Pause job worker |

Never roll back by inventing parallel OAuth.

---

*Backlog detail: `ARIA_FEATURE_BACKLOG.md`.*
