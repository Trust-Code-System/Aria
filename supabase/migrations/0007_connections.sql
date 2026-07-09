-- ============================================================================
-- Connectors / plugins (Composio). We store a reference to each connected
-- account, NOT the OAuth tokens themselves — Composio holds the tokens. Every
-- row is workspace-scoped with RLS. The Composio "entity" is the Aria user id.
-- ============================================================================

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,                 -- e.g. 'gmail', 'googlecalendar', 'github'
  composio_connection_id text,            -- Composio connected-account id
  composio_entity_id text not null,       -- entity used with Composio (= Aria user id)
  account_label text,                     -- e.g. the connected email address
  status text not null default 'pending'
    check (status in ('pending', 'active', 'error', 'disconnected')),
  scopes jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);
create index if not exists idx_connections_ws on public.connections(workspace_id);

alter table public.connections enable row level security;

drop policy if exists connections_ws_all on public.connections;
create policy connections_ws_all on public.connections
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop trigger if exists trg_touch_connections on public.connections;
create trigger trg_touch_connections before update on public.connections
  for each row execute function public.touch_updated_at();
