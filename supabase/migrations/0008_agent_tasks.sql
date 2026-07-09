-- ============================================================================
-- 0008 — Agent task engine + human-in-the-loop approvals.
--
-- The core of the "AI OS": a durable, auditable record of multi-step agent work
-- and the approvals that gate any risky action. Mirrors the RLS convention from
-- 0002 (workspace-scoped via public.is_workspace_member).
-- ============================================================================

-- Long-running unit of agent work.
create table if not exists public.agent_tasks (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid references public.projects(id) on delete set null,
  title          text not null,
  description    text,
  -- queued | running | waiting_for_approval | completed | failed | cancelled
  status         text not null default 'queued',
  priority       text not null default 'normal',   -- low | normal | high
  risk_level     smallint not null default 0,      -- 0..4 (see lib/agent/types.ts)
  current_step   integer not null default 0,
  max_steps      integer not null default 25,      -- guard against runaway loops
  cost_estimate  numeric(10,4) not null default 0,
  cost_actual    numeric(10,4) not null default 0,
  result         text,
  error_message  text,                              -- user-safe; no stack traces
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz,
  failed_at      timestamptz
);

create index if not exists agent_tasks_ws_idx on public.agent_tasks (workspace_id, created_at desc);
create index if not exists agent_tasks_status_idx on public.agent_tasks (workspace_id, status);

-- One step within a task's plan/execution timeline.
create table if not exists public.agent_task_steps (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.agent_tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idx          integer not null,                    -- ordering within the task
  kind         text not null default 'action',      -- plan | action | tool | approval | review
  -- pending | running | completed | failed | skipped
  status       text not null default 'pending',
  summary      text not null,                        -- safe, human-readable
  tool_name    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists agent_steps_task_idx on public.agent_task_steps (task_id, idx);

-- A gate on a side-effecting action. `safe_metadata` must never contain private
-- payloads (email bodies, file contents, secrets) — only what's safe to display.
create table if not exists public.approvals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  task_id       uuid references public.agent_tasks(id) on delete cascade,
  step_id       uuid references public.agent_task_steps(id) on delete set null,
  action_type   text not null,                       -- e.g. send_email, book_calendar
  risk_level    smallint not null default 2,         -- 0..4
  -- pending | approved | rejected | changes_requested | expired
  status        text not null default 'pending',
  summary       text not null,                        -- safe one-line description
  tool_name     text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users(id) on delete set null
);

create index if not exists approvals_ws_status_idx on public.approvals (workspace_id, status, created_at desc);

-- ---- RLS: workspace-scoped, same pattern as 0002 --------------------------
alter table public.agent_tasks       enable row level security;
alter table public.agent_task_steps  enable row level security;
alter table public.approvals         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['agent_tasks','agent_task_steps','approvals'] loop
    execute format('drop policy if exists %1$s_ws_all on public.%1$s;', t);
    execute format($f$
      create policy %1$s_ws_all on public.%1$s
        for all
        using (public.is_workspace_member(workspace_id))
        with check (public.is_workspace_member(workspace_id));
    $f$, t);
  end loop;
end $$;

-- Keep updated_at fresh on writes.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists agent_tasks_touch on public.agent_tasks;
create trigger agent_tasks_touch before update on public.agent_tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists agent_steps_touch on public.agent_task_steps;
create trigger agent_steps_touch before update on public.agent_task_steps
  for each row execute function public.touch_updated_at();
