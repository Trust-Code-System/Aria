# Aria production agent setup

This runbook configures Aria without exposing credentials. Put secret values in Vercel project settings, never in source control or client-prefixed variables.

## 1. Required Vercel environment

Configure these for Production (and Preview only when intentionally testing):

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | yes | Canonical deployed URL |
| `APP_ENV` | yes | Set to `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser-safe Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only background/admin operations |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY` | at least one | Compatible chat provider |
| `DEFAULT_CHAT_MODEL` | recommended | Provider-qualified default such as `openai:gpt-5.6` |
| `OPENAI_CHAT_MODEL`, `ANTHROPIC_CHAT_MODEL`, `GOOGLE_CHAT_MODEL` | when provider enabled | Explicit validated fallback IDs |
| `FAST_MODEL`, `REASONING_MODEL`, `ACTION_MODEL`, `CODING_MODEL`, `VISION_MODEL` | optional | Capability-specific routing overrides |
| `DEFAULT_EMBEDDING_MODEL` | yes for RAG | Embedding model; matching provider key must exist |
| `PERPLEXITY_API_KEY` or `TAVILY_API_KEY` | for web research | Research provider |
| `COMPOSIO_API_KEY` | for connected apps | Server-only Composio gateway key |
| `COMPOSIO_GMAIL_AUTH_CONFIG_ID` | for Gmail | Gmail OAuth configuration |
| `COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID` | for Calendar | Calendar OAuth configuration |
| Other `COMPOSIO_*_AUTH_CONFIG_ID` values in `.env.example` | per enabled app | Toolkit OAuth configuration |
| `ADMIN_EMAIL` | yes | Comma-separated administrators |
| `CHAT_TOOLS_ENABLED` | recommended | Emergency connected-tool rollback switch |
| `AUTH_DISABLED` | yes | Must be `false`; production code blocks bypass even if mis-set |

Do not put `COMPOSIO_API_KEY`, provider keys, or the Supabase service-role key in any `NEXT_PUBLIC_*` variable. Redeploy after changing Vercel environment values.

## 2. Supabase migration

Apply migrations in filename order through `0014_agent_reliability.sql` using the Supabase CLI or SQL migration workflow used by the project. Migration 0014 adds durable turn states, idempotency, message events, chat-linked approvals, action receipts, memory metadata, profile fields, search indexes, and RLS policies.

After applying it:

1. Open `/admin` as an administrator.
2. Confirm **Agent reliability migration** is green.
3. Confirm no blank legacy assistant records remain; migration 0014 converts them to visible failed turns.
4. Run an authenticated chat and confirm `messages.status` reaches `completed`.

Migration 0014 is additive. A code rollback can ignore its new columns/tables; do not drop them during an incident because they contain audit and receipt history.

## 3. Composio and Gmail

1. Create a Gmail auth config in Composio for the production Google OAuth client.
2. Configure the redirect/callback URL shown by Composio in Google Cloud exactly.
3. Grant the least scopes needed. Read features need Gmail metadata/read scopes; real send needs `gmail.send`. Avoid full mailbox scope unless another enabled feature requires it.
4. Put the auth-config ID in `COMPOSIO_GMAIL_AUTH_CONFIG_ID` and the project API key in `COMPOSIO_API_KEY`.
5. Sign into Aria as the target user and connect Gmail from Connections. Aria passes the stable Supabase Auth user UUID as the Composio entity ID.
6. Confirm the Aria connection row is `connected`, has a Composio connected-account reference, and tool discovery reports a supported Gmail send capability.

Reconnect after changing OAuth scopes. An old connected account does not automatically gain newly requested scopes.

## 4. Manual live Gmail verification

Use a dedicated test mailbox and recipient. This is intentionally manual and must not be reported as passed until Composio returns a real provider confirmation.

1. Ask: `Send an email to recipient@example.com explaining that they should consider TrustCode System for their software project.`
2. Confirm an inline card shows the Gmail action, recipient, subject, safe preview, and risk. Confirm the recipient has received nothing.
3. Edit the content and save. Reload the card and verify the changed payload remains locked.
4. Approve once. Confirm the card moves through executing to a provider-confirmed receipt.
5. Verify the receipt stores provider, action, destination, subject, timestamps, final `succeeded` status, and provider reference when returned.
6. Verify the message arrived in the recipient mailbox.
7. Click Approve again. Confirm Aria rejects replay and no second message arrives.
8. Disconnect Gmail and repeat the request. Confirm Aria gives reconnection guidance and makes no send/access claim.

## 5. Production smoke tests

- Anonymous `/chat`, `/dashboard`, connector, approval, memory, and admin requests must redirect to login or return 401/403.
- `Hi` produces a short answer without connector discovery, RAG, or memory extraction.
- Explicit `Remember that my company is TrustCode System.` creates one approved memory and an Undo card.
- A normal durable preference produces a suggestion that is inactive until approved.
- Provider quota failure creates one failed assistant turn with a trace and Retry; it creates no duplicate user row.
- Calendar reads use only a connected Calendar read tool and do not invent events.
- Admin health exposes only status and counts, never keys, prompts, bodies, tokens, or connector payloads.

## 6. Failure-layer troubleshooting

| Layer | Safe check | Correct action |
| --- | --- | --- |
| Environment | `/admin` configured/missing state | Correct Vercel variable and redeploy |
| Database | Migration 0014 health | Apply ordered migrations; do not mask missing columns |
| Aria connection | Connection status and toolkit | Reconnect from Connections |
| Composio identity | Entity ID equals Supabase user UUID | Remove incorrect connection and reconnect as the same Aria user |
| Connected account | Account reference exists and is active | Reauthorize in Composio/Aria |
| OAuth permission | Capability missing after discovery | Add least required scope, then reconnect |
| Tool discovery | Requested toolkit/tool absent | Check auth config, scopes, and discovered slug variants |
| Model action | No compatible tool model | Configure an action model whose capability map includes tools |
| Approval | Card absent or expired | Inspect sanitized trace; prepare a new approval |
| Execution | Receipt is failed | Use trace and provider dashboard; never relabel it success |
| Provider confirmation | No success signal/reference | Treat as failed/unknown and create a fresh request only after diagnosis |

## 7. Rollback

- Set `CHAT_TOOLS_ENABLED=false` and redeploy to stop loading connected-app tools while retaining normal chat.
- Disconnect an individual app to revoke its execution path.
- Disable a faulty provider by removing its key/model routing overrides and redeploying; keep at least one compatible provider.
- Keep authentication enabled. Never use `AUTH_DISABLED` as a production incident workaround.
- Preserve approval, event, audit, and receipt rows for investigation. Redact private content from tickets and logs.
