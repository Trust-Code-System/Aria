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
