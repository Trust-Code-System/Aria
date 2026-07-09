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
