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
- `0008_agent_tasks.sql` — **applied ✅** (you did this).
- If you use Agents / Connections / training logs, confirm `0005`–`0007` are also applied
  (`supabase db push`, or paste each into the Supabase SQL editor in order).

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
- [ ] `/approvals` (or inline on the task) → **Approve** → it resumes and completes; try **Reject** on another to see it stop.
- [ ] In chat, type a request and click the **task icon** (Delegate as agent task) → lands on the task.

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
