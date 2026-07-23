# E2E in CI — setup checklist

The `.github/workflows/e2e.yml` workflow runs the Playwright suite against a
**already-running deployment** (it deliberately does not boot Supabase or the
app in CI). Until the three secrets below are set, the authenticated specs
(`authed.spec.ts`, `memory.spec.ts`) **skip cleanly** and the workflow stays
green on the public/redirect smoke tests. Once the secrets are set, the
authenticated flow — including the memory round-trip — runs for real.

## 1. What each secret is

| Secret | Value | Notes |
| --- | --- | --- |
| `E2E_BASE_URL` | Full origin of a running Aria deployment, e.g. `https://aria.example.com` | No trailing slash. This is where Playwright points (`playwright.config.ts` reads it; default without it is `http://localhost:3000`, which is not reachable from GitHub's runners). Use a staging/preview URL, not a laptop. |
| `E2E_EMAIL` | Email of a **dedicated test account** that already exists on that deployment | Not a personal/owner account — the memory spec creates and deletes a memory row on it. |
| `E2E_PASSWORD` | That test account's password | Stored only as a GitHub Actions secret; never commit it. |

## 2. How to set them (repo Settings)

1. GitHub → the `Trust-Code-System/Aria` repo → **Settings** → **Secrets and
   variables** → **Actions**.
2. **New repository secret** → add each of `E2E_BASE_URL`, `E2E_EMAIL`,
   `E2E_PASSWORD` with the values above.
3. (Optional) If you want the daily smoke run scoped to a specific environment,
   set them at the environment level instead and add `environment:` to the job.

## 3. Prerequisites on the target deployment

- The `E2E_EMAIL` account must be able to log in through the normal
  `/login` form (email + password), reach `/chat`, and reach `/memory`.
- Explicit memory saves are **model-free** — the chat route short-circuits
  "remember that …" before any provider call — so the memory spec passes even
  when model quota is exhausted. It does **not** exercise a live model or any
  connected-app (Gmail/etc.) action.

## 4. Confirm it runs green

After the secrets are set:

1. GitHub → **Actions** → **E2E** → **Run workflow** (manual `workflow_dispatch`).
2. Watch the run. Expected: all specs execute (none skipped for missing creds),
   including `memory.spec.ts › save via chat appears on the Memory page`.
3. On failure, the **playwright-report** artifact (uploaded on every run) has
   the trace and failure screenshot.

The workflow also runs on every push to `main` and on a daily `06:00 UTC` cron
as a smoke check.

## 5. Selector caveat

`memory.spec.ts` and `authed.spec.ts` assume the current UI (login inputs, the
"Message Aria" composer placeholder, the "Saved to memory" confirmation text,
and a delete control on Memory rows). If those change, update the specs. This is
the expected maintenance cost of a real end-to-end test and is preferable to not
testing the flow at all.
