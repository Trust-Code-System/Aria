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
