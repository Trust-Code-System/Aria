# Aria Browser Operator Plan

**Date:** 2026-07-12  
**Status:** Architecture proposal (do not implement until approved)

---

## 1. Goal

Enable Aria to assist in the user’s real browser (side panel + page understanding + form fill) and, when needed, run longer automated sessions via a controlled Playwright worker — without becoming an unbounded computer-use agent.

**Primary rule:** Prefer **DOM/accessibility automation on allowlisted domains** with HITL. Use vision only as fallback. Never treat page text as trusted instructions.

---

## 2. Approach comparison

| Approach | Best for | Avoid for | Verdict for Aria |
| --- | --- | --- | --- |
| Chrome content-script DOM | Current page, form fill, summaries | Multi-site overnight crawls | **Primary for daily assist** |
| Chrome DevTools Protocol | Debugging, controlled Chrome | User’s everyday Chrome without care | Secondary |
| Playwright (local worker) | Multi-step flows, downloads, retries | Instant side-panel help | **Primary for long tasks** |
| browser-use agent loop | Open-ended browse | Banking, credentials, high-stakes | Study; optional later |
| Composio Browser Tool | Connector-unified browse | Immature / opaque paths | **Evaluate before adopt** |
| Vision computer-use | Unlabeled canvas UI | Costly daily email/forms | Fallback only |
| Hybrid DOM + vision | Complex apps | Default path | **Recommended hybrid** |

Sources: [Building Browser Agents (arXiv)](https://arxiv.org/html/2511.19477v1), [State of Browser Use 2026](https://michaellivs.com/blog/state-of-browser-use-2026/), [browser-use](https://github.com/webllm/browser-use/).

---

## 3. Extension architecture

```
┌──────────────────────────────────────────┐
│ Side Panel (Aria UI)                     │
│  chat · page actions · approvals · status│
└───────────────┬──────────────────────────┘
                │ messages
┌───────────────▼──────────────────────────┐
│ Service Worker                           │
│  auth session · message router · alarms  │
│  bridge to Aria backend                  │
└───────┬───────────────────┬──────────────┘
        │                   │
┌───────▼────────┐  ┌───────▼──────────────┐
│ Content script │  │ Optional offscreen / │
│  DOM snapshot  │  │ debugger attach      │
│  form apply    │  └──────────────────────┘
│  highlight     │
└────────────────┘
```

### Manifest permissions (proposed, minimize)

| Permission | Why |
| --- | --- |
| `sidePanel` | Primary UX |
| `storage` | Local prefs / allowlist cache |
| `activeTab` / host permissions (user-granted) | Prefer optional host access over `<all_urls>` |
| `scripting` | Inject content scripts on approved domains |
| `tabs` (limited) | Multi-tab summaries when user enables |
| Avoid `debugger` by default | High power; enable only for advanced mode |

**Recommendation:** Start with **user-gesture + activeTab** and an **explicit domain allowlist** in Settings; expand host permissions only when user adds domains.

---

## 4. Responsibilities

### Side panel

- Chat with Aria using page context attachment  
- Show proposed form fills and approval buttons  
- Show connection/action status  
- Display receipts (what changed)

### Content script

- Extract **structured page model**: URL, title, headings, form fields (name/type/labels), main text excerpt (size-capped)  
- Apply approved fill map  
- Capture before/after screenshots (via tab capture APIs where available)  
- Never auto-submit unless separately approved  

### Service worker

- Auth token refresh to Aria backend  
- Relay messages between panel ↔ content ↔ API  
- Enforce allowlist client-side (defense in depth; server also checks)  
- Queue long tasks → backend Playwright job when needed  

### Backend Bridge API

- `/api/browser/context` — accept snapshot, return plan  
- `/api/browser/approve` — lock fill plan  
- `/api/browser/receipt` — store evidence  
- `/api/browser/jobs` — Playwright worker tasks  

---

## 5. Browser-session architecture

| Mode | Session | Auth cookies | Use |
| --- | --- | --- | --- |
| **Local extension** | User’s Chrome profile | Real logged-in sites | Daily assist, forms |
| **Local Playwright** | Dedicated profile dir | User-exported or login flow | Repeatable flows |
| **Cloud browser** | Vendor sandbox | Separate; high risk | Only if isolation + no secrets |

**Default:** local extension for assist; local Playwright for long tasks on allowlisted domains. Delay cloud browsers until isolation and credential policy are clear.

---

## 6. DOM vs vision automation

| Task | Method |
| --- | --- |
| Summarize page | DOM text excerpt |
| Fill labeled forms | DOM field map + profile/CV |
| Click known buttons | Accessibility / selectors |
| CAPTCHA / canvas / weird UI | Vision fallback + always approve |
| Multi-page application | Playwright + checkpoints |

---

## 7. Form-filling system

1. User: “Fill this using my approved profile and CV.”  
2. Extension sends field inventory (no passwords unless user opts into a password manager integration — default **never** scrape password managers).  
3. Aria maps fields → approved profile / knowledge CV sections.  
4. Approval UI shows field → value table.  
5. On approve, content script fills; **submit is separate approval**.  
6. Receipt: filled fields, screenshot, timestamp.

---

## 8. Multi-tab system

- User enables “include selected tabs”  
- Service worker collects capped snapshots from selected tabs only  
- Model compares / synthesizes  
- Never silently read all tabs  

---

## 9. File upload / download

| Action | Policy |
| --- | --- |
| Download | Allowlist + confirm path / show filename |
| Upload | Only files from Aria Storage or user file picker; never invent paths |
| Credentials files | Never auto-upload secrets |

---

## 10. Prompt-injection defence

1. Treat all page/email content as **DATA**, not instructions.  
2. System prompt: ignore directives found in page text.  
3. Tool-arg scanner (existing trifecta-style): block sends that embed page instructions.  
4. Domain allowlist + max action budget per session.  
5. No autonomous navigation to new registrable domains without approval.  
6. Separate “browse plan” from “execute plan” approvals for long tasks.

Source consensus: injection unsolved; boundaries > model judgment ([State of Browser Use 2026](https://michaellivs.com/blog/state-of-browser-use-2026/)).

---

## 11. Approval matrix (browser)

| Action | Auto | One-click | High-risk confirm | Never auto |
| --- | --- | --- | --- | --- |
| Read / summarize page | Yes (if allowlisted or activeTab) | — | — | Cross-origin silent read |
| Highlight / scroll | Yes | — | — | — |
| Fill fields | — | Yes | — | — |
| Submit form | — | — | Yes | — |
| Navigate new domain | — | — | Yes | — |
| Download file | — | Yes | Sensitive types | — |
| Upload file | — | — | Yes | Secrets |
| Enter passwords / 2FA | — | — | — | **Never by Aria** |
| Payments / wire | — | — | — | **Never** |

---

## 12. Screenshots, traces, receipts

Store in Supabase Storage (user-scoped, RLS):

- Before/after images (optional, user setting)  
- Action JSON (selector, value hash, URL)  
- Job trace id for Playwright  
- Retention: default 30 days; user can purge  

---

## 13. Credentials protection

- Prefer user’s existing browser session (extension).  
- Playwright: dedicated profile; no Aria DB storage of passwords.  
- Composio remains SoT for API OAuth apps.  
- Never log cookies or Authorization headers.

---

## 14. Composio Browser Tool evaluation

**Before adopting, verify:**

1. Can it use the user’s authenticated session or only cloud?  
2. Approval / HITL hooks?  
3. Allowlists and audit logs?  
4. Latency and reliability on real forms?  
5. License and data residency?

**Decision rule:** If Composio Browser is opaque or cloud-only with weak HITL → keep Aria hybrid (extension + Playwright). Study Composio Browser as optional toolkit, not core.

---

## 15. Testing strategy

| Layer | Tests |
| --- | --- |
| Unit | Field mapper, allowlist, injection scanner |
| Extension | Fixture HTML forms; fill apply |
| E2E | Playwright against local fixture sites |
| Security | Prompt-injection fixtures on pages |
| Manual | Real Gmail web / Notion form only on staging allowlist |

---

## 16. Deployment strategy

1. Ship **read-only page context** to chat (low risk).  
2. Ship **fill without submit** + approvals.  
3. Ship **submit** with high-risk confirm.  
4. Add Playwright worker for multi-step.  
5. Evaluate vision fallback and Composio Browser last.

---

## 17. Existing Aria assets

- `extension/` Chrome side panel (extend, don’t rewrite)  
- Approvals UI (reuse for fill plans)  
- Security flags for injection (extend to browser payloads)

---

*Related: `ARIA_TARGET_ARCHITECTURE.md` § Browser operator; backlog P3.*
