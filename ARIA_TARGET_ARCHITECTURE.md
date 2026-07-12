# Aria Target Architecture

**Date:** 2026-07-12  
**Status:** Proposed (research approval required before large implementation)

---

## 1. Design principles

1. **Orchestrator owns the user** — memory, tools, approvals, jobs stay in Aria (Next.js + Supabase).  
2. **Composio owns OAuth and tool execution** — no parallel token stores.  
3. **Intent first** — skip RAG/tools/memory for trivial turns.  
4. **Durable for multi-step** — chat stream for dialogue; jobs for workflows.  
5. **Untrusted external content** — email/web never become trusted instructions.  
6. **Evidence over claims** — no success without provider confirmation.

---

## 2. Component map

```
┌─────────────────────────────────────────────────────────────┐
│                         Clients                              │
│  Web App │ PWA │ Chrome Extension │ Mobile-oriented UI       │
└────────────┬───────────────┬───────────────┬────────────────┘
             │               │               │
             ▼               ▼               ▼
┌────────────────┐  ┌──────────────┐  ┌─────────────────────┐
│ Chat API       │  │ Jobs / Cron  │  │ Extension Bridge API │
│ /api/chat      │  │ Workers      │  │ page context / DOM   │
└───────┬────────┘  └──────┬───────┘  └──────────┬──────────┘
        │                  │                     │
        ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Central Orchestrator                       │
│  Intent Router → Model Router → Context Assembler            │
│  Action Planner → Tool Selector → Approval Engine            │
│  Memory Engine │ Research Engine │ Artifact Engine           │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐
│ Supabase     │  │ Composio       │  │ Browser Operator      │
│ Postgres+RLS │  │ Session/Tools  │  │ Ext + Playwright pool │
│ pgvector     │  │ OAuth SoT      │  │ Allowlists + receipts │
│ Storage      │  │ Execute        │  └─────────────────────┘
└──────────────┘  └────────────────┘
```

### Subsystems (responsibilities)

| Subsystem | Responsibility |
| --- | --- |
| **Central orchestrator** | Owns turn lifecycle; never lets model invent tool success |
| **Intent router** | instant / personal / knowledge / research / action / complex |
| **Model router** | fast, default, reasoning, research, coding, vision, action |
| **Context assembler** | Core profile + ranked memories + project pack + optional RAG + history hits |
| **Memory engine** | CRUD, contradiction, decay, proposed memories |
| **Conversation-history retrieval** | Embedding/keyword search over past chats; tool-callable |
| **Project context** | Project brief, tasks, decisions, linked knowledge |
| **Knowledge RAG** | Chunk retrieve + citations |
| **Composio session manager** | Stable user UUID → toolkit-scoped tools |
| **Connector registry** | App → toolkit → tools → risk → status |
| **Tool selection** | Intent + connected apps → minimal tool set |
| **Action planner** | Multi-step plan with checkpoints |
| **Approval engine** | Lock args, expiry, invalidate on change, resume execute |
| **Durable execution** | Jobs table / later Temporal for long workflows |
| **Browser operator** | Extension + optional Playwright worker |
| **Extension** | Side panel, content scripts, page snapshots |
| **Background workers** | Ingest, research, CoS overnight, reindex |
| **Scheduler** | Cron for briefs, watches, decay |
| **Event triggers** | Webhooks (mail, calendar) when available |
| **Research engine** | Tavily/Perplexity + source ranking + project writeback |
| **Artifact engine** | Reports, briefs, drafts, plans as first-class objects |
| **Skill registry** | Versioned prompts/workflows with eval + rollback |
| **Audit logs** | Every tool call, approval, browser action |
| **Observability** | Latency, tool error rates, cost per turn |
| **Evaluations** | Golden sets for memory, tools, CoS |
| **Security boundaries** | RLS, allowlists, injection flags, secret isolation |

---

## 3. Data planes

| Plane | Store | Notes |
| --- | --- | --- |
| Auth / identity | Supabase Auth | Stable UUID = Composio user id |
| Conversations | messages, chats | Search index for history retrieval |
| Memory | memories (+ future graph edges) | Suggested → approved |
| Knowledge | documents, chunks, embeddings | Separate from memory |
| Connectors | connections + status | Composio entity linkage |
| Approvals | approvals + locked payload | Resume via execute |
| Jobs | jobs / runs | Durable workflows |
| Artifacts | reports / briefs | Versioned |
| Audit | action_logs | Immutable-ish |
| Browser | receipts, screenshots (Storage) | Retention policy |

---

## 4. Sequence diagrams

### 4.1 Simple greeting

```mermaid
sequenceDiagram
  participant U as User
  participant C as Chat API
  participant I as Intent Router
  participant M as Fast Model
  U->>C: "hi"
  C->>I: classify
  I-->>C: instant (skip tools/RAG/memory write)
  C->>M: short system + message
  M-->>U: greeting stream
```

### 4.2 Personal-memory question

```mermaid
sequenceDiagram
  participant U as User
  participant C as Chat API
  participant Mem as Memory Engine
  participant M as Default Model
  U->>C: "What are my working hours?"
  C->>Mem: retrieve core + ranked preference
  Mem-->>C: hits + provenance
  C->>M: context + question
  M-->>U: answer with source tags
```

### 4.3 Knowledge-base question

```mermaid
sequenceDiagram
  participant U as User
  participant C as Chat API
  participant RAG as Knowledge RAG
  participant M as Default Model
  U->>C: "What does the SOW say about IP?"
  C->>RAG: embed + retrieve chunks
  RAG-->>C: chunks + citations
  C->>M: grounded prompt
  M-->>U: answer + citations
```

### 4.4 Deep research request

```mermaid
sequenceDiagram
  participant U as User
  participant C as Chat API
  participant R as Research Engine
  participant A as Artifacts
  participant M as Research Model
  U->>C: "Research competitor X"
  C->>R: multi-query web search
  R-->>C: ranked sources
  C->>M: synthesize with citations
  M->>A: save research artifact
  M-->>U: report + links
```

### 4.5 Gmail send with approval

```mermaid
sequenceDiagram
  participant U as User
  participant C as Chat API
  participant T as Composio Tools
  participant Ap as Approvals
  participant X as Execute
  U->>C: "Send this email to Alex"
  C->>T: GMAIL_SEND (dangerous)
  T-->>Ap: create locked approval
  Ap-->>U: Approve UI
  U->>Ap: approve
  Ap->>X: composio.tools.execute(locked args)
  X-->>Ap: provider result
  Ap-->>U: receipt (message id / status)
```

### 4.6 Cross-application workflow

```mermaid
sequenceDiagram
  participant U as User
  participant Or as Orchestrator
  participant J as Durable Job
  participant Co as Composio
  participant Ap as Approvals
  U->>Or: "Create Notion page + GitHub issues"
  Or->>J: create workflow run
  J->>Co: Notion create (may auto if low risk)
  J->>Ap: GitHub create issues (approve)
  U->>Ap: approve
  Ap->>Co: execute
  J-->>U: summary + receipts
```

### 4.7 Browser form filling

```mermaid
sequenceDiagram
  participant U as User
  participant Ext as Extension
  participant API as Bridge API
  participant Op as Browser Operator
  participant Ap as Approvals
  U->>Ext: "Fill this form with my CV"
  Ext->>API: page DOM snapshot + URL
  API->>Op: plan fields from profile
  Op->>Ap: proposed fills (domain allowlist)
  U->>Ap: approve
  Ext->>Ext: apply DOM fills
  Ext-->>API: receipt + screenshot
  API-->>U: completed fields list
```

### 4.8 Background scheduled task

```mermaid
sequenceDiagram
  participant Cron as Scheduler
  participant W as Worker
  participant Co as Connectors
  participant A as Artifacts
  participant N as Notify
  Cron->>W: morning_brief job
  W->>Co: Gmail + Calendar read
  W->>A: write Today brief
  W->>N: optional push/email summary
```

### 4.9 Failed tool execution and recovery

```mermaid
sequenceDiagram
  participant J as Job
  participant Co as Composio
  participant R as Recovery
  participant U as User
  J->>Co: execute step
  Co-->>J: error / partial
  J->>R: classify (retryable / auth / invalid)
  alt retryable
    R->>Co: backoff retry
  else auth
    R-->>U: Action required reconnect
  else partial
    R-->>U: what succeeded + what failed + resume token
  end
```

### 4.10 Multi-agent delegation

```mermaid
sequenceDiagram
  participant U as User
  participant Or as Orchestrator
  participant Res as Research Agent
  participant Wr as Writer Agent
  participant Act as Action Agent
  participant Ap as Approvals
  U->>Or: "Research then draft then send"
  Or->>Res: research subtask
  Res-->>Or: notes + sources
  Or->>Wr: draft email
  Wr-->>Or: draft artifact
  Or->>Act: prepare send
  Act->>Ap: approval
  U->>Ap: approve
  Act-->>U: receipt
```

---

## 5. Model routing policy (proposed)

| Class | Use | Avoid |
| --- | --- | --- |
| Fast | greetings, classify, short rewrite | deep reasoning |
| Default | Q&A, memory, drafting | heavy research |
| Reasoning | plans, contradictions, risk | trivial chat |
| Research | web synthesis | tool-only ops |
| Coding | repo/PR | email tone |
| Vision | screenshots / hard UI | text-only |
| Action | tool-arg precision | long essays |

Fallbacks: provider outage → secondary provider same class; never silently drop approval requirements.

---

## 6. Security boundaries

- RLS on all user tables  
- Composio tokens never in Aria DB  
- Browser: domain allowlist + approval for fill/submit  
- Email/web content: untrusted; injection detector on tool args  
- Skills versioned; production changes require eval gate  

---

## 7. Evolution path

| Phase | Architecture move |
| --- | --- |
| Now | Fix Composio chat path; intent; approvals; receipts |
| 30d | Memory V2 + history search + artifacts for briefs |
| 60d | CoS scheduler + inbox triage drafts |
| 90d | Browser operator hybrid + durable multi-app jobs |
| Later | Temporal/LangGraph class durability if jobs outgrow Postgres |

---

*Browser detail: `ARIA_BROWSER_OPERATOR_PLAN.md`. Memory: `ARIA_MEMORY_SYSTEM_V2.md`.*
