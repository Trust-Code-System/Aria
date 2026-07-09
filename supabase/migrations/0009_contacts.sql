-- ============================================================================
-- 0009 — Contacts / relationship manager.
--
-- People Aria helps you stay on top of: who they are, how you know them, when
-- you last talked, and when to follow up. Workspace-scoped with the same RLS
-- convention as 0002/0008. Message drafts/sends still go through approvals.
-- ============================================================================

create table if not exists public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  full_name           text not null,
  email               text,
  phone               text,
  company             text,
  role                text,                              -- their job title / relation
  tags                text[] not null default '{}',      -- e.g. {client, investor, friend}
  notes               text,                              -- free-form relationship notes
  relationship        text,                              -- one-line summary of the relationship
  last_interaction_at timestamptz,
  follow_up_at        timestamptz,                       -- when Aria should surface a nudge
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists contacts_ws_idx on public.contacts (workspace_id, full_name);
create index if not exists contacts_followup_idx on public.contacts (workspace_id, follow_up_at)
  where follow_up_at is not null;

alter table public.contacts enable row level security;

drop policy if exists contacts_ws_all on public.contacts;
create policy contacts_ws_all on public.contacts
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();
