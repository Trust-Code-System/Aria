-- ============================================================================
-- Agent Teams (pipelines) + Self-Checking Loops.
-- A single run record captures either a multi-agent pipeline or an iterative
-- loop, with each step/iteration appended to `steps` (jsonb). Workspace-scoped
-- with RLS, like every other private table.
-- ============================================================================

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null check (kind in ('pipeline', 'loop')),
  title text not null,
  input text not null default '',
  config jsonb not null default '{}'::jsonb,   -- pipeline: {teamKey, steps[]}; loop: {criteria[], maxIterations}
  steps jsonb not null default '[]'::jsonb,      -- appended per step/iteration
  final_output text,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  iterations int not null default 0,
  report_id uuid references public.reports(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_agent_runs_ws on public.agent_runs(workspace_id);
create index if not exists idx_agent_runs_project on public.agent_runs(project_id);

alter table public.agent_runs enable row level security;

drop policy if exists agent_runs_ws_all on public.agent_runs;
create policy agent_runs_ws_all on public.agent_runs
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop trigger if exists trg_touch_agent_runs on public.agent_runs;
create trigger trg_touch_agent_runs before update on public.agent_runs
  for each row execute function public.touch_updated_at();
