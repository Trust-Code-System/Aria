# Aria Capability Matrix

**Date:** 2026-07-12  
**Scoring (1–10):** Personal value (PV), Business value (BV), Frequency (FQ), Time saved (TS), Effort (EF↓ better low), Reliability risk (RR↓), Security risk (SR↓), API cost (AC↓), Dependency risk (DR↓), Differentiation (DF).  
**Priority score (heuristic):** `PV+BV+FQ+TS+DF − (EF+RR+SR+AC+DR)/2` — used for Recommended priority.

Legend for Current Aria: **Done** / **Partial** / **Missing** / **Broken**.

---

## Core matrix

| Capability | User problem | Example instruction | Required context | Required tools | Model class | Risk | Approval | Latency | Difficulty | Dependencies | Aria status | Priority | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Instant chat path | Slow replies for hi/thanks | “hi” | None | None | Fast | Low | None | <1s | Easy | Intent router | Partial | P0 | Research §15 |
| Verified Gmail send | Can’t act on email | “Email Alex this draft” | Connection + draft | Composio GMAIL_* | Action | High | Required | 5–30s | Med | Composio session | Partial/Broken | P0 | Composio docs |
| Approval lock + resume | Duplicate/wrong send | Approve pending send | Locked args | composio.tools.execute | Action | High | Required | 2–10s | Med | Approvals table | Partial | P0 | Repair plan |
| Action receipt / evidence | Unclear if action worked | “Did you send it?” | Tool result | Provider response | Default | Med | None | Fast | Med | Audit log | Partial | P0 | Community trust |
| Remove simulated success | False trust | Any agent step | Real provider | Real execute | Action | High | Per action | — | Med | Agent execute | Broken (sim notes) | P0 | Research §14 |
| Core profile always-on | Forgets who I am | “What’s my company?” | Core profile | Memory read | Fast/Default | Low | Write approve | Fast | Easy | Memory tables | Partial | P1 | Letta/Mem0 |
| Ranked memory retrieval | Noise / placeholders | “What did we decide?” | Semantic mem | Memory search | Default | Low | Write | Fast | Med | Embeddings | Partial | P1 | Mem0 |
| Chat history search | Cross-chat recall | “What did I say last week about X?” | Past chats | History search tool | Default | Low | None | 1–3s | Med | Messages index | Missing | P1 | Claude chat search |
| Contradiction / supersede | Stale facts | Correct preference | Memory versions | Memory update | Default | Med | Approve | Fast | Med | Memory schema | Partial | P1 | Research memory |
| Project context pack | Lost project state | “What’s blocked on Aria?” | Project mem + tasks | Project tools | Default | Low | None | Fast | Med | Projects | Partial | P1 | Claude Projects |
| Knowledge RAG + citations | Doc Q&A | “What does the contract say?” | Chunks | RAG | Default | Low | None | 2–5s | Done-ish | pgvector | Done/Partial | P1 | Existing |
| Skip RAG when unused | Latency/cost | Greeting | Intent | Router | Fast | Low | None | Fast | Easy | Intent | Partial | P0 | Research |
| Morning briefing | Manual day prep | “Prepare my day” | Mail+cal+tasks | Gmail, Calendar, Tasks | Action/Research | Med | Send drafts | 30–120s | Hard | Scheduler | Missing | P2 | alfred_/Nerve |
| Inbox triage | Overflow | “Handle important emails” | Gmail | Gmail tools | Action | High | Send | 30–180s | Hard | Composio | Missing | P2 | CoS reviews |
| Meeting prep | Unprepared meetings | “Prep me for 3pm” | Cal + contacts + docs | Calendar, Drive, RAG | Research | Low | None | 15–60s | Med | Connectors | Missing | P2 | CoS |
| Follow-up detection | Dropped balls | “Who am I waiting on?” | Mail + contacts | Gmail, Contacts | Default | Low | None | 15–60s | Med | Jobs | Missing | P2 | CoS |
| Calendar conflict resolve | Double-book | “Fix Thursday” | Calendar | Calendar tools | Action | Med | Write | 10–40s | Med | Composio | Missing | P2 | CoS |
| Project drift monitor | Silent slip | “What’s drifting?” | Tasks/projects | Internal | Default | Low | None | Fast | Med | Scheduler | Partial | P2 | Existing tasks |
| Side-panel page context | Page-aware help | “Summarize this page” | DOM/text | Extension | Fast | Med | None | Fast | Med | Extension | Partial | P3 | AnythingLLM ext |
| Form fill from profile | Manual forms | “Fill this using my CV” | Profile + page | Extension DOM | Action/Vision | High | Required | 10–60s | Hard | Extension | Missing | P3 | Browser research |
| Multi-step browser nav | Manual browsing | “Apply on this site” | Allowlist | Playwright/agent | Vision/Action | High | Required | 1–10m | Hard | Worker | Missing | P3 | browser-use |
| Multi-tab reasoning | Context across tabs | “Compare these two pages” | Tab snapshots | Extension | Default | Med | None | Med | Hard | Extension | Missing | P3 | Browser research |
| Notion write | Manual sync | “Update Notion” | Connection | Composio Notion | Action | Med | Write | 5–30s | Med | Composio | Partial | P3 | Composio |
| GitHub issue/PR | Manual tickets | “Create issues from notes” | Connection | Composio GitHub | Action | Med | Write | 5–40s | Med | Composio | Partial | P3 | Composio |
| Slack post | Manual notify | “Post update to #ops” | Connection | Slack | Action | Med | Required | 5–20s | Med | Composio | Partial | P3 | Composio |
| Cross-app workflow | App switching | “Tasks to Notion + GitHub” | Multi | Multiple toolkits | Action | High | Per step | 30–180s | Hard | Durable jobs | Missing | P3 | Temporal/LangGraph |
| Deep research + cite | Weak research | “Research X across web” | Topic | Tavily/Perplexity | Research | Low | None | 30–120s | Med | Research | Partial | P2 | Existing |
| Continuous topic watch | Miss signals | “Watch competitor X weekly” | Topic | Scheduler + research | Research | Low | None | Batch | Med | Jobs | Missing | P4 | Khoj schedule |
| Lead / CRM assist | Lost leads | “Follow up warm leads” | Contacts | Gmail + Contacts | Action | Med | Send | 30–120s | Med | Contacts | Partial | P4 | Business § |
| Proposal draft | Slow sales | “Draft proposal for Y” | Knowledge + research | RAG + research | Default | Low | None | 30–90s | Med | Reports | Partial | P4 | Existing reports |
| Invoice assist | Admin drag | “Draft invoice for Z” | Business mem | Templates | Default | High | Required | Med | Hard | Billing | Missing | P4 | Delay ERP |
| Coding agent + PR | Manual coding | “Build feature and PR” | Repo | GitHub + coding model | Coding | High | Required | Minutes | Hard | Agent | Partial | P5 | Coding agents |
| Multi-agent delegation | Complex parallel | “Research then draft then send” | Plan | Subagents | Multi | High | Gates | Long | Hard | Orchestrator | Partial | P5 | LangGraph |
| Voice brief | Hands-free | “Read my brief” | Brief artifact | TTS | Fast | Low | None | Fast | Med | TTS | Missing | P6 | CoS products |
| Local-only mode | Max privacy | Offline chat | Local models | Local runtime | Local | Low | — | Varies | Hard | Ollama etc | Missing | P6 | LocalLLaMA |
| Computer-use vision full | Any GUI | “Use this desktop app” | Screen | Vision agent | Vision | Critical | Always | Slow | Hard | Sandbox | Missing | P6 | State of browser |
| Auto-send emails | Zero friction | Never | — | — | — | Critical | Never auto | — | — | — | Should not build | Never | Security |

---

## Score table (selected high-priority)

| Capability | PV | BV | FQ | TS | EF | RR | SR | AC | DR | DF | Priority band |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Verified Gmail send | 10 | 9 | 9 | 10 | 5 | 6 | 8 | 4 | 5 | 8 | P0 |
| Approval lock resume | 9 | 8 | 7 | 8 | 4 | 4 | 7 | 2 | 3 | 7 | P0 |
| Action receipts | 9 | 8 | 8 | 7 | 4 | 3 | 5 | 2 | 2 | 8 | P0 |
| Kill simulated success | 10 | 9 | 6 | 6 | 3 | 2 | 9 | 1 | 1 | 9 | P0 |
| Instant path | 8 | 5 | 10 | 7 | 2 | 1 | 1 | 1 | 1 | 4 | P0 |
| Core profile + ranked mem | 10 | 7 | 9 | 8 | 5 | 4 | 4 | 3 | 2 | 9 | P1 |
| Chat history search | 9 | 6 | 8 | 8 | 5 | 3 | 3 | 3 | 2 | 8 | P1 |
| Morning briefing | 9 | 9 | 8 | 9 | 7 | 5 | 5 | 6 | 5 | 9 | P2 |
| Inbox triage drafts | 9 | 9 | 8 | 10 | 8 | 7 | 8 | 6 | 5 | 9 | P2 |
| Form fill + allowlist | 8 | 7 | 5 | 8 | 8 | 8 | 9 | 5 | 6 | 9 | P3 |
| Cross-app durable workflow | 8 | 9 | 6 | 9 | 8 | 7 | 7 | 5 | 6 | 9 | P3 |
| Full computer-use vision | 5 | 5 | 2 | 6 | 9 | 9 | 10 | 9 | 8 | 5 | P6 / delay |
| Auto-send without approval | 3 | 4 | 4 | 5 | 3 | 10 | 10 | 2 | 5 | 2 | Do not build |

---

## Deduplicated capability groups

1. **Trust & execution:** verified tools, approvals, receipts, no simulation  
2. **Personal intelligence:** core profile, memory lifecycle, history search, project pack  
3. **Chief of staff:** brief, triage, prep, follow-ups, prioritization  
4. **Browser:** page context, form fill, Playwright long tasks, injection defense  
5. **Business:** CRM/follow-ups, proposals, project health, research watches  
6. **Advanced:** multi-agent, durable Temporal-class, coding PR, voice, local  

---

*See `ARIA_FEATURE_BACKLOG.md` for checkbox backlog and acceptance criteria.*
