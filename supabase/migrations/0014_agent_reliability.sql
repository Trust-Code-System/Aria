-- ============================================================================
-- 0014 — Durable chat turns, inline events/receipts, and memory/profile metadata.
-- Backward-compatible: existing rows become completed except unexplained blank
-- assistant rows, which become failed with a safe visible explanation.
-- ============================================================================

alter table public.conversations
  add column if not exists initial_request_id uuid,
  add column if not exists summary text,
  add column if not exists history_retrieval_enabled boolean not null default true;

create unique index if not exists conversations_initial_request_uidx
  on public.conversations (workspace_id, user_id, initial_request_id)
  where initial_request_id is not null;

alter table public.messages
  add column if not exists status text not null default 'completed',
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists trace_id text,
  add column if not exists idempotency_key uuid,
  add column if not exists parent_message_id uuid references public.messages(id) on delete set null,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('pending', 'streaming', 'completed', 'failed', 'cancelled'));

update public.messages
set
  status = 'failed',
  content = 'This earlier response did not complete. You can retry it.',
  error_code = 'legacy_empty_assistant',
  error_message = 'The earlier assistant turn ended without a saved response.',
  completed_at = coalesce(completed_at, created_at),
  updated_at = now()
where role = 'assistant' and btrim(content) = '' and status = 'completed';

update public.messages
set completed_at = coalesce(completed_at, created_at)
where status = 'completed';

create unique index if not exists messages_turn_role_uidx
  on public.messages (workspace_id, user_id, idempotency_key, role)
  where idempotency_key is not null;

create index if not exists messages_conversation_status_idx
  on public.messages (conversation_id, status, created_at);

create index if not exists messages_parent_idx
  on public.messages (parent_message_id)
  where parent_message_id is not null;

create index if not exists messages_content_search_idx
  on public.messages using gin (to_tsvector('simple', coalesce(content, '')));

drop trigger if exists messages_touch on public.messages;
create trigger messages_touch before update on public.messages
  for each row execute function public.touch_updated_at();

alter table public.approvals
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists message_id uuid references public.messages(id) on delete set null,
  add column if not exists expires_at timestamptz,
  add column if not exists execution_started_at timestamptz,
  add column if not exists completed_at timestamptz;

update public.approvals
set expires_at = created_at + interval '24 hours'
where expires_at is null;

create index if not exists approvals_conversation_idx
  on public.approvals (conversation_id, created_at desc)
  where conversation_id is not null;

create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in ('tool_call', 'tool_result', 'approval', 'receipt', 'error', 'memory_saved', 'memory_suggestion')
  ),
  status text not null default 'completed',
  tool_name text,
  approval_id uuid references public.approvals(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists message_events_message_idx
  on public.message_events (message_id, created_at);
create index if not exists message_events_conversation_idx
  on public.message_events (conversation_id, created_at);

create table if not exists public.action_receipts (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid unique references public.approvals(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  provider text not null,
  action_type text not null,
  destination text,
  subject text,
  provider_reference text,
  status text not null check (status in ('succeeded', 'failed')),
  error_message text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists action_receipts_conversation_idx
  on public.action_receipts (conversation_id, created_at desc)
  where conversation_id is not null;

alter table public.message_events enable row level security;
alter table public.action_receipts enable row level security;

drop policy if exists message_events_ws_all on public.message_events;
create policy message_events_ws_all on public.message_events
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists action_receipts_ws_all on public.action_receipts;
create policy action_receipts_ws_all on public.action_receipts
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

alter table public.profiles
  add column if not exists preferred_name text,
  add column if not exists company text,
  add column if not exists role_title text,
  add column if not exists signature text,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists language text not null default 'en',
  add column if not exists communication_preferences jsonb not null default '{}'::jsonb,
  add column if not exists history_retrieval_enabled boolean not null default true;

alter table public.memories
  add column if not exists category text,
  add column if not exists importance smallint not null default 3,
  add column if not exists provenance jsonb not null default '{}'::jsonb,
  add column if not exists last_used_at timestamptz,
  add column if not exists superseded_by uuid references public.memories(id) on delete set null,
  add column if not exists active boolean not null default true,
  add column if not exists expires_at timestamptz,
  add column if not exists normalized_content text,
  add column if not exists source_message_id uuid references public.messages(id) on delete set null;

alter table public.memories drop constraint if exists memories_importance_check;
alter table public.memories add constraint memories_importance_check
  check (importance between 1 and 5);

update public.memories
set
  category = coalesce(category, type),
  normalized_content = coalesce(
    normalized_content,
    lower(btrim(regexp_replace(content, '\\s+', ' ', 'g')))
  ),
  active = approval_status = 'approved'
where category is null or normalized_content is null;

create index if not exists memories_retrieval_idx
  on public.memories (workspace_id, project_id, active, approval_status, importance desc, updated_at desc);
create index if not exists memories_source_message_idx
  on public.memories (source_message_id)
  where source_message_id is not null;

drop trigger if exists memories_touch on public.memories;
create trigger memories_touch before update on public.memories
  for each row execute function public.touch_updated_at();
