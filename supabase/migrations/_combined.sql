-- ============================================================
-- Aria — combined migrations (0001–0004). Run once in the
-- Supabase SQL Editor. Safe to re-run (idempotent guards).
-- ============================================================

-- >>>>>>>>>> 0001_init.sql <<<<<<<<<<
-- ============================================================================
-- Aria MVP — initial schema
-- Postgres + pgvector. Tenant-ready: every private row is scoped by
-- workspace_id (and user_id). RLS enforces isolation. Vector dim = 1536 to
-- match OpenAI text-embedding-3-small (change here + embeddings if you swap).
-- ============================================================================

create extension if not exists "vector";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Workspaces + membership (tenant boundary)
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Personal',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists idx_wm_user on public.workspace_members(user_id);
create index if not exists idx_wm_ws on public.workspace_members(workspace_id);

-- Helper: is the current user a member of a workspace?
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  instructions text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_ws on public.projects(workspace_id);

-- ---------------------------------------------------------------------------
-- Conversations + messages
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default 'New chat',
  mode text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_conv_ws on public.conversations(workspace_id);
create index if not exists idx_conv_project on public.conversations(project_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  citations jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_msg_conv on public.messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Documents + chunks (knowledge base)
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  filename text not null,
  file_type text not null,
  byte_size bigint,
  storage_path text,
  source_url text,
  extracted_text_status text not null default 'pending'
    check (extracted_text_status in ('pending', 'ok', 'empty', 'failed')),
  ingestion_status text not null default 'pending'
    check (ingestion_status in ('pending', 'processing', 'completed', 'failed')),
  chunk_count int not null default 0,
  error_message text,               -- sanitized only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_docs_ws on public.documents(workspace_id);
create index if not exists idx_docs_project on public.documents(project_id);
create index if not exists idx_docs_status on public.documents(ingestion_status);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  page_number int,
  section_title text,
  token_count int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_chunks_doc on public.document_chunks(document_id);
create index if not exists idx_chunks_ws on public.document_chunks(workspace_id);
-- Approximate NN index for cosine similarity.
create index if not exists idx_chunks_embedding
  on public.document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------------
-- Memories + suggestions
-- ---------------------------------------------------------------------------
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  type text not null default 'preference'
    check (type in ('preference', 'project_fact', 'writing_style', 'tool_preference', 'workflow')),
  content text not null,
  source text not null default 'manual',
  confidence real not null default 1.0,
  sensitivity text not null default 'low' check (sensitivity in ('low', 'medium', 'high')),
  approval_status text not null default 'approved'
    check (approval_status in ('approved', 'suggested', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mem_ws on public.memories(workspace_id);
create index if not exists idx_mem_project on public.memories(project_id);

-- ---------------------------------------------------------------------------
-- Reports (generated + research)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null default 'research'
    check (kind in ('research', 'project_summary', 'proposal', 'kb_summary')),
  title text not null,
  content_md text not null default '',
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reports_ws on public.reports(workspace_id);

-- ---------------------------------------------------------------------------
-- Feedback (evaluation)
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  rating text not null check (rating in ('up', 'down')),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists idx_feedback_ws on public.feedback(workspace_id);

-- ---------------------------------------------------------------------------
-- Jobs (simple background/ingestion queue record)
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  ref_id uuid,               -- e.g. document_id
  attempts int not null default 0,
  error_message text,        -- sanitized only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_jobs_status on public.jobs(status);

-- ---------------------------------------------------------------------------
-- Error logs (admin portal) — NEVER store secrets, raw content, or full prompts
-- ---------------------------------------------------------------------------
create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  project_id uuid,
  feature_area text not null,
  provider text,
  category text not null,
  sanitized_message text not null,
  status_code int,
  latency_ms int,
  trace_id text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_errlog_created on public.error_logs(created_at desc);
create index if not exists idx_errlog_area on public.error_logs(feature_area);

-- ---------------------------------------------------------------------------
-- Audit logs (important + dangerous actions)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  user_id uuid,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','workspaces','projects','conversations','documents','memories','reports','jobs'
  ] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s;', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile + Personal workspace + owner membership
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws_id uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email, 'you'), '@', 1))
  on conflict (id) do nothing;

  insert into public.workspaces (name, owner_id)
  values ('Personal', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- >>>>>>>>>> 0002_rls.sql <<<<<<<<<<
-- ============================================================================
-- Row Level Security. Every private table is workspace-scoped. A user may only
-- read/write rows in workspaces they are a member of. Service-role code
-- (ingestion, admin logging) bypasses RLS by design and scopes manually.
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.workspaces          enable row level security;
alter table public.workspace_members   enable row level security;
alter table public.projects            enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.documents           enable row level security;
alter table public.document_chunks     enable row level security;
alter table public.memories            enable row level security;
alter table public.reports             enable row level security;
alter table public.feedback            enable row level security;
alter table public.jobs                enable row level security;
alter table public.error_logs          enable row level security;
alter table public.audit_logs          enable row level security;

-- Profiles: a user sees/edits only their own.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Workspaces: members can read; only owner can update/delete; any user can create.
drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces
  for select using (public.is_workspace_member(id));
drop policy if exists ws_insert on public.workspaces;
create policy ws_insert on public.workspaces
  for insert with check (owner_id = auth.uid());
drop policy if exists ws_modify on public.workspaces;
create policy ws_modify on public.workspaces
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists ws_delete on public.workspaces;
create policy ws_delete on public.workspaces
  for delete using (owner_id = auth.uid());

-- Membership rows: a user can see their own memberships and insert themselves.
drop policy if exists wm_select on public.workspace_members;
create policy wm_select on public.workspace_members
  for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));
drop policy if exists wm_insert on public.workspace_members;
create policy wm_insert on public.workspace_members
  for insert with check (user_id = auth.uid());

-- Generic workspace-scoped tables: member-of-workspace for all operations.
do $$
declare t text;
begin
  foreach t in array array[
    'projects','conversations','messages','documents','document_chunks',
    'memories','reports','feedback','jobs'
  ] loop
    execute format('drop policy if exists %1$s_ws_all on public.%1$s;', t);
    execute format($f$
      create policy %1$s_ws_all on public.%1$s
        for all
        using (public.is_workspace_member(workspace_id))
        with check (public.is_workspace_member(workspace_id));
    $f$, t);
  end loop;
end $$;

-- Error logs + audit logs: members may read their workspace's rows.
-- Writes happen via service role (bypasses RLS). Rows with null workspace are
-- system-level and only visible to service role.
drop policy if exists errlog_select on public.error_logs;
create policy errlog_select on public.error_logs
  for select using (workspace_id is not null and public.is_workspace_member(workspace_id));

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs
  for select using (workspace_id is not null and public.is_workspace_member(workspace_id));


-- >>>>>>>>>> 0003_match_chunks.sql <<<<<<<<<<
-- ============================================================================
-- Vector similarity search RPC. Filters by workspace (and optional project) and
-- returns chunks with their parent document metadata for citation building.
-- Called via supabase.rpc('match_document_chunks', {...}).
-- SECURITY: runs as invoker so RLS still applies; we also pass the workspace id
-- explicitly and constrain to member workspaces.
-- ============================================================================

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_workspace_id uuid,
  match_project_id uuid default null,
  match_count int default 8,
  similarity_threshold real default 0.0
)
returns table (
  chunk_id uuid,
  document_id uuid,
  content text,
  page_number int,
  section_title text,
  chunk_index int,
  similarity real,
  filename text,
  source_url text
)
language plpgsql stable security invoker set search_path = public
as $$
begin
  if not public.is_workspace_member(match_workspace_id) then
    return;
  end if;

  return query
  select
    c.id as chunk_id,
    c.document_id,
    c.content,
    c.page_number,
    c.section_title,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::real as similarity,
    d.filename,
    d.source_url
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.workspace_id = match_workspace_id
    and c.embedding is not null
    and (match_project_id is null or c.project_id = match_project_id)
    and (1 - (c.embedding <=> query_embedding)) >= similarity_threshold
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
end;
$$;


-- >>>>>>>>>> 0004_storage.sql <<<<<<<<<<
-- ============================================================================
-- Private storage bucket for uploaded documents. Files are stored under a path
-- prefixed by workspace_id so RLS can scope access. Access is via signed URLs
-- generated server-side; the bucket itself is private.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Path convention: documents/{workspace_id}/{document_id}/{filename}
-- The first folder segment is the workspace id; only members may access.

drop policy if exists "docs read own workspace" on storage.objects;
create policy "docs read own workspace" on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "docs insert own workspace" on storage.objects;
create policy "docs insert own workspace" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "docs delete own workspace" on storage.objects;
create policy "docs delete own workspace" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.is_workspace_member((storage.foldername(name))[1]::uuid)
  );


