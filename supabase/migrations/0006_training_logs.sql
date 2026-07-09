-- ============================================================================
-- Continuous Distillation: LLM Training Logs
-- Stores exact prompt/response pairs with user feedback for fine-tuning.
-- ============================================================================

create table if not exists public.llm_training_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  
  -- The exact model used to generate this response (e.g., openai:gpt-4o, google:gemini-1.5-pro)
  model_id text not null,
  
  -- Full context passed to the model
  system_prompt text not null,
  messages_json jsonb not null default '[]'::jsonb,
  
  -- What the model outputted
  response_text text not null,
  
  -- Was this a good response for training? (up/down/none)
  quality_rating text check (quality_rating in ('up', 'down')),
  
  -- How long it took, cost, tokens, etc.
  metadata jsonb not null default '{}'::jsonb,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trainlog_ws on public.llm_training_logs(workspace_id);
create index if not exists idx_trainlog_rating on public.llm_training_logs(quality_rating);

-- RLS Policies
alter table public.llm_training_logs enable row level security;

create policy "Users can view their own workspace training logs"
  on public.llm_training_logs for select
  using (public.is_workspace_member(workspace_id));

create policy "Users can insert their own workspace training logs"
  on public.llm_training_logs for insert
  with check (public.is_workspace_member(workspace_id));

create policy "Users can update their own workspace training logs"
  on public.llm_training_logs for update
  using (public.is_workspace_member(workspace_id));

-- Trigger for updated_at
create trigger trg_touch_llm_training_logs
  before update on public.llm_training_logs
  for each row execute function public.touch_updated_at();
