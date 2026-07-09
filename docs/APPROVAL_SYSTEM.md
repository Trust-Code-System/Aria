# Approval System

How Aria gates risky actions behind human approval. This is the single most important
safety mechanism in the app: **no outward-facing or irreversible action executes without
an explicit "approved" decision.**

## Risk ladder

Defined in [`lib/agent/types.ts`](../lib/agent/types.ts):

| Level | Meaning | Examples | Behavior |
| --- | --- | --- | --- |
| 0 | Safe | research, summarize, draft internally | Runs without asking |
| 1 | Low — confirm | external drafts (draft an email) | Approval required |
| 2 | Explicit approval | send email/message, calendar write, commit, delete, share | Approval required |
| 3 | High / admin | payments, purchases, deploy to production, bulk actions | Approval required (2FA step-up planned) |
| 4 | **Blocked** | exposing secrets/credentials, policy violations | **Never executes. Cannot be approved.** |

## How a step gets classified

`lib/agent/risk.ts` — a pure, deterministic, unit-tested keyword classifier maps a planned
step's text to a level and an `action_type` slug (e.g. `send_email`, `payment`). It is
intentionally conservative: over-asking is fine, silently acting is not.

## The decision policy (single source of truth)

`lib/agent/approval-policy.ts` — pure functions used by both the runtime and the API:

- `gateForRiskLevel(level)` → `safe` | `needs_approval` | `blocked`
- `resolveApprovalOutcome(level, approvalStatus)` →
  - `approved` → **execute** (the only path that performs the action)
  - `pending` / missing / `expired` / unknown → **wait** (task parks at `waiting_for_approval`)
  - `rejected` → **cancel the whole task**
  - `changes_requested` → **skip the step with a note** — it does *not* execute
  - level 4 → **blocked**, regardless of any decision
- `isApprovable(level)` → false for level 4 (enforced in the API route *and* the UI)

Unit tests: `tests/approval-policy.test.ts`, `tests/risk.test.ts`.

## The flow

1. The task runtime (`lib/agent/runtime.ts`) plans steps, classifies each one.
2. Level-4 steps are skipped with a "blocked by policy" note — no approval is ever created.
3. For levels 1–3, it inserts a row in `approvals` (migration `0008_agent_tasks.sql`) with
   **safe metadata only** (never email bodies, file contents, or secrets) and parks the task
   at `waiting_for_approval`.
4. The Approval Inbox (`/approvals`) and the task detail page (`/tasks/:id`) show
   Approve / Reject / Request changes.
5. `POST /api/approvals/:id` records the decision (audit-logged), refuses `approve` on
   level 4, and sets the linked task back to `queued`.
6. Approving auto-resumes the task (both from the inbox and the task page).

## Direct (non-agent) risky actions

Gmail send (`/api/cowork/email-action`) is a direct user-initiated action: the UI collects
an explicit confirmation, the API refuses `send` without `confirmed: true`, and the Gmail
lib throws without it (three layers). Every draft/send is audit-logged. Drafting is the
default and recommended mode.

## What executes for real

Approved **email-shaped steps** (`send_email`, `draft_email`, `send_message`) go through
`lib/agent/execute.ts`: the step composes a structured draft and, when Gmail is connected,
creates a **real Gmail draft** — never an auto-send, and only to a recipient address that
appears in your own task text. Without Gmail/LLM/recipient it falls back to an honest
note plus the composed draft text. All other approved action types record a clearly
labeled simulation note until their connectors are wired.

## Step-up for high risk

Level-3 approvals require a **two-step confirmation** in the UI (an explicit
"Yes, I approve this high-risk action" second click) in both the Approval Inbox and the
task page. A full 2FA/re-auth step-up is a future upgrade.

## Known gaps (tracked in AI_AGENT_TODO.md)

- Non-email approved actions are still simulated until their connectors are wired.
- No approval expiry job (status `expired` exists in the schema but nothing sets it yet).
- "Request changes" skips the step; a revise-and-retry loop is a future upgrade.
- Level-3 step-up is UI-level confirm, not yet 2FA/re-auth.
