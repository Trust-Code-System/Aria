# Aria Chief of Staff Plan

**Date:** 2026-07-12  
**Status:** Product + workflow design (depends on verified connectors + Memory V2)

---

## 1. Product definition

Aria as Chief of Staff means: **batch the overnight work, present morning decisions, execute approved actions, chase open loops** — not chat more.

Pattern sources: alfred_, Nerve, readywhen CoS reviews (capability claims); Aria Approvals + Dashboard as the execution surface.

---

## 2. Morning briefing

**Artifact:** `Today` brief (Dashboard + optional chat summary)

**Contents (keep short):**

1. **Top 3–5 decisions** needing the user today  
2. **Calendar** — meetings with prep links / risks  
3. **Inbox** — urgent threads + draft replies ready for approve  
4. **Commitments** — what you promised / waiting on  
5. **Project health** — blocked / drifting items  
6. **Optional** — one opportunity or research watch alert  

**Not in first brief:** long email dumps, raw calendars, marketing fluff.

**Latency:** overnight batch preferred; “Prepare my day” can refresh on demand (30–120s).

---

## 3. Evening review

1. What got done vs planned  
2. What slipped + reschedule suggestions  
3. Open loops created today  
4. Memory candidates from the day (for approval)  
5. Tomorrow preview  

Tone: concise; no guilt-tripping.

---

## 4. Inbox triage

| Stage | Aria does | User does |
| --- | --- | --- |
| Classify | Urgent / important / FYI / spam-ish | Tune rules |
| Summarize | Thread TL;DR | Skim |
| Draft | Voice-matched reply | Edit |
| Send | — | Approve (always) |
| Task extract | Create tasks / follow-ups | Confirm |

**Never auto-send.** Auto-archive only for user-defined low-risk labels after trust builds.

---

## 5. Calendar planning

- Detect conflicts; propose options (not silent moves)  
- Protect focus blocks if user set preferences  
- Meeting prep pack 30–60 min before (or on demand)  
- Travel / buffer heuristics from preferences  

Approval required for creating/moving events that notify others.

---

## 6. Meeting preparation

Pack:

- Attendees + relationship memory  
- Last emails / notes  
- Linked project status  
- Suggested agenda (3 bullets)  
- Risks / asks  

Output as artifact attachable in chat.

---

## 7. Contact follow-ups

- Detect “I’ll get back to you” commitments (mail + chat)  
- Surface overdue follows in brief  
- Draft nudges; approve to send  
- Link to Contacts CRM-lite  

---

## 8. Project-health monitoring

Signals:

- Tasks overdue / blocked  
- Approvals pending > N days  
- No activity on project for X days  
- GitHub issues stale (when connected)  

Report in weekly review + morning if critical.

---

## 9. Business opportunities

- Research watches (competitors, RFPs, GitHub/Reddit signals) → weekly digest  
- Lead warmness from Contacts + email  
- **Rank by user ICP** in business memory  

Do not spam daily “opportunities.”

---

## 10. Daily prioritization

Method (simple, editable):

1. Hard calendar constraints  
2. External commitments due today  
3. Revenue / client-critical work  
4. Deep work from user goals  
5. Admin batch  

Aria proposes; user can pin order. Store as procedural preference.

---

## 11. Weekly review

- Wins / slips  
- Pipeline health  
- Memory hygiene (approve backlog)  
- Connector health (Action required)  
- Skill / workflow candidates  

---

## 12. Notifications

| Channel | Use |
| --- | --- |
| In-app Dashboard | Default |
| Chat ping | Only if user opens Aria |
| Push / email digest | Morning brief + critical deadlines |
| Slack (if connected) | Optional digest to self-channel |

**Proactivity limits (defaults):**

- Max 1 proactive push morning, 1 evening optional  
- Interrupt for: meeting in <15m without prep, deadline <2h, approval about to expire  
- Never interrupt for FYI mail  

User settings override all.

---

## 13. User-control settings

- Quiet hours  
- Briefing time  
- Which connectors feed CoS  
- Auto-draft on/off  
- Opportunity digest frequency  
- Aggressiveness: passive / balanced / assertive (still no auto-send)

---

## 14. Dependencies

| Need | Why |
| --- | --- |
| Verified Gmail/Calendar tools | Brief without fake data |
| Durable jobs / scheduler | Overnight batch |
| Artifacts | Persist briefs |
| Memory V2 + Contacts | Prep + follow-ups |
| Approvals | Send drafts |

---

## 15. Acceptance (MVP CoS)

- [ ] Overnight job produces Today brief with calendar + task sections  
- [ ] Inbox section shows ≤10 prioritized threads with drafts when Gmail connected  
- [ ] No send without approval  
- [ ] User can disable any module  
- [ ] Empty/degraded connectors show honest status (not invented emails)

---

*Related: `ARIA_90_DAY_ROADMAP.md` weeks for P2; matrix CoS rows.*
