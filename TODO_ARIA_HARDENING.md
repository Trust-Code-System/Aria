# Aria hardening tracker

| Status | Priority | Task | Evidence | Relevant files | Verification | Remaining risk |
| --- | --- | --- | --- | --- | --- | --- |
| [x] | P1 | Replace the generic chat typing dots with a turn-scoped Thinking Orbs status indicator. | `thinking-orbs@0.1.1` is installed; every NDJSON event carries the logical turn UUID; terminal, cancelled, failed, approval-gated, and timed-out turns clear the indicator. | `components/chat/thinking-indicator.tsx`, `components/chat/message-item.tsx`, `components/chat/chat.tsx`, `lib/chat/stream-protocol.ts`, `app/api/chat/route.ts` | 135 unit tests; focused desktop and mobile Playwright checks; lint; typecheck; production build. | Browser verification used an intercepted model stream, so no live provider or connector execution was exercised. |

