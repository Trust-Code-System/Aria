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
