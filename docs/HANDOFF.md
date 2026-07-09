# Hand-off — what only you can do

Everything below needs *your* credentials, *your* browser session, or a decision that
isn't mine to make. The code is committed, typechecks, lints, passes 25 unit tests, and
builds for production. These are the steps to take it from "builds" to "live for you".

## 1. Environment variables (`.env.local`)
Copy `.env.example` → `.env.local` and fill in. Minimum for the features built this session:

| Variable | Enables | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` **or** `GOOGLE_GENERATIVE_AI_API_KEY` | Chat replies + agent planner/executor | **Yes** (at least one) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + database | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | File uploads / ingestion | For attachments-to-KB |
| `TAVILY_API_KEY` **or** `PERPLEXITY_API_KEY` | Research mode + agent "research" steps | Recommended |
| `DEEPGRAM_API_KEY` / `ELEVENLABS_API_KEY` | Higher-quality voice (browser voice works without) | Optional |

> Secrets never go in the repo. `.env.local` is git-ignored.

## 2. Database migrations

**Fresh Supabase project (e.g. the new "TrustOps" one):** the error you saw —
`relation "public.workspaces" does not exist` — means the base tables aren't there yet.
Migrations build on each other, so 0009 alone can't run first. Fix: paste
**`supabase/migrations/_combined.sql`** (now covers **0001–0009**) into the SQL Editor
and run it **once**. It's idempotent — safe to re-run, and safe even if some earlier
migrations were already applied.

**Existing project that already has 0001–0008:** just run `0009_contacts.sql`.

## 3. Test the flows live (needs your login — I can't authenticate as you)
Run `npm run dev`, sign in, then verify:

**Chat**
- [ ] Attach an image and a PDF (📎 / drag-drop / paste) → send → image shows in your bubble; ask about the doc.
- [ ] Click 🎤 and speak (Chrome/Edge only) → text appears in the composer.
- [ ] Type `1.` then **Shift+Enter** → `2.` auto-appears; empty item exits the list.
- [ ] Watch a reply — it should build up with a typing cursor, not appear all at once.
- [ ] "Read aloud" (speaker icon) on a reply.

**Agent loop**
- [ ] `/tasks` → New task, e.g. *"Research the best CRM for a solo consultant and draft an intro email to a prospect."*
- [ ] Open it → **Run** → watch it research + draft, then **pause at the email step**.
- [ ] `/approvals` (or inline on the task) → **Approve** → it resumes automatically and completes; try **Reject** on another to see it stop.
- [ ] Click **Request changes** on an approval → the step is **skipped with a note** (it must NOT perform the action) and the rest of the task continues.
- [ ] Create a task containing a high-risk word (e.g. *"...and pay the invoice"*) → the approval shows **Approve high-risk…** and needs a second confirm click.
- [ ] In chat, type a request and click the **task icon** (Delegate as agent task) → lands on the task.

**Real Gmail draft from an approved step** (needs `COMPOSIO_API_KEY` + Gmail connected)
- [ ] Connect Gmail on `/connections`.
- [ ] New task: *"Draft a short intro email to yourname+test@gmail.com about our automation offer"* → Run → Approve the email step → check Gmail **Drafts**: the draft should be there. Nothing is sent.

**Contacts** (needs migration `0009_contacts.sql` applied)
- [ ] `/contacts` → add a contact with a follow-up date of today → a "Follow up" badge appears and the contact floats to the top; **Done today** clears it.
- [ ] Search by name/company/tag; edit and delete a contact.

**Rate limiting**
- [ ] Hammer chat with >30 messages in a minute → a friendly "going a little fast" message appears (no crash, no raw error).

**Background tasks (new)**
- [ ] Run a task → the page returns immediately, the button shows **Running…**, and steps tick off live (polls every 2.5s). Leave the page and come back — progress continued without you.
- [ ] Approve from `/approvals` → toast says the task resumed in the background.

**Mobile (new — test on your phone, or DevTools device mode)**
- [ ] A bottom tab bar (Chat / Tasks / Approvals / Contacts / Home) appears on phones with a springy active pill, like a native app.
- [ ] Content never hides behind the tab bar or the home-indicator area (safe-area padding).
- [ ] Focusing the chat composer does NOT zoom the page (16px inputs) and the keyboard doesn't cover the composer.
- [ ] Buttons/links compress slightly when pressed; no grey tap-flash; no rubber-band over-scroll behind the app.
- [ ] On Android Chrome you feel haptic ticks on: tab taps, send, run task, approve/reject, task completed. (iPhone Safari doesn't expose vibration to websites — Apple limitation, not a bug; everything else works.)

## 4. Make agent actions *real* (currently simulated — safe by design)
Approved risky steps are **not actually performed** yet (no real email is sent). To wire real
actions you need connector OAuth — this is the `[!] Blocked` work in `AI_AGENT_TODO.md`:
- Set the `COMPOSIO_*` auth-config IDs (Gmail, Calendar, etc.) in `.env.local`, or
- Google OAuth (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) for direct integration.
Then the executor can call the tool instead of simulating. **Recommend starting with Gmail
*draft* (not send)** — lowest risk.

## 5. The Python sibling — `personal-ai-empire`
Separate repo at `C:\Users\Admin\Desktop\personal-ai-empire` (committed). To bring it up:
```bash
cd ../personal-ai-empire
python -m venv .venv && .venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # add LLM + TAVILY keys
python main.py doctor    # shows what's live
```
To use it as the agent brain behind Aria's tasks, follow `docs/OPENCLAW_SETUP.md` there
(secure-openclaw + MCP). This is the "drive the loop from the supervisor" upgrade path.

## 6. Your pre-existing uncommitted work
I only committed files I changed. Your working tree still has ~60 pre-existing modified/
untracked files from before this session (admin, dashboard, connections, agents, cowork,
public/, scripts/, etc.). **Review and commit those yourself** — I deliberately left them
untouched so I wouldn't tangle your in-progress work with mine.

## 7. Deploy (when ready)
- Set all env vars in your host (Vercel/etc.).
- Run migrations against the production Supabase project.
- `npm run build` is green locally; confirm the same in CI.

## Known limits (honest)
- Browser speech-to-text is **Chrome/Edge only** (Web Speech API).
- Agent tasks run **inline** in the request (fine for short tasks; long ones want a queue — Group 4).
- Approved actions are **simulated** until step 4 is done.
- The broader Personal AI OS (HR/Sales/Finance role agents, browser automation, industry packs)
  remains a roadmap in `AI_AGENT_TODO.md` — not built this session.
