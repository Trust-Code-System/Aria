# Aria Memory System V2

**Date:** 2026-07-12  
**Status:** Design proposal (builds on existing suggested/approved memories)

---

## 1. Design goals

1. Aria builds a **reliable long-term understanding of one user** without dumping every chat into context.  
2. Memory categories stay **separate** with different write rules and retrieval weights.  
3. Writes are **auditable**, often **approval-gated**, and **contradiction-aware**.  
4. Privacy: user can inspect, edit, expire, and delete; sources are visible.

Inspired by: Mem0 (extract + search), Letta (core vs recall), Claude (memory + chat search), Aria’s current memory UX.

---

## 2. Memory categories

| Category | What it holds | Always in context? | Write rule |
| --- | --- | --- | --- |
| **Core profile** | Name, roles, companies, timezone, communication style, hard constraints | Yes (small card) | User edit or high-confidence approve |
| **Preference memory** | Tone, tools, models, notification limits | Ranked top-k | Approve or explicit “remember” |
| **Episodic memory** | What happened when (meetings, decisions) | Retrieve by query/time | Auto-suggest; approve for durable |
| **Semantic memory** | Facts about world/user/business | Retrieve | Approve |
| **Procedural memory** | How Aria should do recurring workflows (“skills”) | Skill registry | Versioned + eval |
| **Relationship memory** | People: prefs, history, open loops | Retrieve by contact | Approve; link to Contacts |
| **Project memory** | Goals, status, blockers, decisions | When project active | Project-scoped |
| **Business memory** | ICP, pricing, offers, brand voice | Ranked | Approve |
| **Temporary working memory** | Current task scratchpad | Current turn/job only | Auto; TTL minutes/hours |

**Do not merge** knowledge-base documents into memory — keep RAG for docs; memory for distilled facts about the user/work.

---

## 3. Source provenance

Every memory record should carry:

- `source_type`: user_explicit | chat_inferred | email | calendar | document | correction | import  
- `source_refs`: chat_id, message_id, document_id, connector event id  
- `created_at`, `updated_at`, `last_confirmed_at`  
- `confidence` 0–1  
- `visibility`: private (default)

UI: “Why Aria knows this” → show provenance.

---

## 4. Confidence, contradiction, temporal validity

### Confidence

| Band | Meaning | Retrieval |
| --- | --- | --- |
| ≥0.85 | Strong | Prefer |
| 0.5–0.85 | Soft | Include if relevant |
| <0.5 | Weak | Suggest only / hide from auto |

### Contradiction handling

1. Detect semantic conflict with existing approved memory.  
2. Do **not** silently overwrite.  
3. Create `proposed_supersede` linking old → new.  
4. User confirms → old `status=superseded`, new `approved`.  
5. Corrections from user (“No, I prefer X”) raise confidence and supersede.

### Temporal validity

- `valid_from`, `valid_until` (optional)  
- Examples: “on vacation until July 20”, “contractor until Q3”  
- Scheduler expires soft facts; core constraints don’t auto-expire without review.

### Decay and expiry

- Unused weak memories decay confidence over time.  
- Episodic older than N months archived (searchable, not hot).  
- User “forget this” → hard delete or tombstone per preference.

---

## 5. User controls

| Control | Behavior |
| --- | --- |
| Approve / reject proposed | Existing flow strengthened |
| Edit memory text | Creates new version |
| Pin to core profile | Elevates to always-on |
| Mute category | Don’t auto-extract from email etc. |
| Export / delete all | GDPR-style |
| Per-project isolation | Project memories don’t leak to other projects unless linked |

---

## 6. Proposed-memory approval

Pipeline (out-of-band preferred — don’t block chat stream):

1. After turn (or overnight job): extract candidates.  
2. Deduplicate against existing.  
3. Score confidence; filter junk.  
4. Insert `status=suggested`.  
5. Notify in Memory UI (not push spam).  
6. On approve → embed for retrieval.

**Safe learning from corrections:** when user edits Aria’s message or says “wrong”, create a correction memory candidate with high priority for approval.

---

## 7. Retrieval strategy

**Never load every chat.**

Order for a personal question:

1. Core profile card  
2. Temporary working memory for active job  
3. Vector + keyword search over approved memories (category filters by intent)  
4. Project pack if `project_id` set  
5. Optional **chat history search tool** (returns snippets, not full threads)  
6. Knowledge RAG only if intent=knowledge  

Caps: e.g. ≤12 memory snippets, ≤4 history hits, ≤8 RAG chunks.

---

## 8. Graph relationships (optional V2.1)

Lightweight edges, not a full graph DB on day one:

- `person —works_with→ person`  
- `person —related_to→ project`  
- `decision —about→ project`  
- `preference —overrides→ preference`

Store as `memory_links(from_id, to_id, rel, weight)`.

---

## 9. Personal × project × business interaction

| Scope | Precedence |
| --- | --- |
| Explicit user instruction this turn | Highest |
| Core profile constraints | High |
| Active project memory | High within project chats |
| Business memory | Medium |
| Global preferences | Medium |
| Old episodic | Low |

Conflicts: surface to user rather than guess.

---

## 10. Privacy

- RLS by `user_id`  
- No training on user data by third parties (contractual + no send-for-train flags)  
- Connector-derived memories labeled as such  
- Browser-derived memories require allowlist + approve  

---

## 11. Evaluation tests

| Test | Pass criteria |
| --- | --- |
| Core recall | Answers name/company/style from core without RAG |
| Preference update | Supersede keeps only new preference in top retrieve |
| No placeholder spam | After 50 chats, hot context ≤ size budget |
| History search | Finds fact from older chat without loading all messages |
| Contradiction | Conflicting fact creates proposal, not silent overwrite |
| Isolation | Project A memory not retrieved in Project B unless linked |
| Forget | Deleted memory never retrieved |

---

## 12. Implementation sketch (when approved)

- Extend `memories` schema: category, confidence, valid_until, superseded_by, provenance JSON  
- `search_memories` tool for the model  
- `search_chat_history` tool  
- Overnight extraction job  
- Memory Settings: category toggles + pin to core  

---

*Related: `ARIA_PERSONAL_AI_RESEARCH_2026.md` §8; backlog P1.*
