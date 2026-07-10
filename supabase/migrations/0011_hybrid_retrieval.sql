-- ============================================================================
-- 0011 — Hybrid retrieval: tsvector keyword search + RRF fusion with pgvector.
-- Backfills content_tsv from existing chunks; keeps vector RPC intact.
-- ============================================================================

alter table public.document_chunks
  add column if not exists content_tsv tsvector;

update public.document_chunks
set content_tsv = to_tsvector('english', coalesce(content, ''))
where content_tsv is null;

create index if not exists idx_chunks_content_tsv
  on public.document_chunks using gin (content_tsv);

create or replace function public.document_chunks_tsv_trigger()
returns trigger language plpgsql as $$
begin
  new.content_tsv := to_tsvector('english', coalesce(new.content, ''));
  return new;
end;
$$;

drop trigger if exists trg_chunks_tsv on public.document_chunks;
create trigger trg_chunks_tsv
  before insert or update of content on public.document_chunks
  for each row execute function public.document_chunks_tsv_trigger();

-- Hybrid match: reciprocal rank fusion of vector similarity + keyword rank.
create or replace function public.hybrid_match_document_chunks(
  query_embedding vector(1536),
  query_text text,
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
declare
  lim int := greatest(match_count, 1);
  pool int := greatest(lim * 4, 20);
begin
  if not public.is_workspace_member(match_workspace_id) then
    return;
  end if;

  return query
  with vector_hits as (
    select
      c.id,
      c.document_id,
      c.content,
      c.page_number,
      c.section_title,
      c.chunk_index,
      (1 - (c.embedding <=> query_embedding))::real as sim,
      d.filename,
      d.source_url,
      row_number() over (order by c.embedding <=> query_embedding) as vrank
    from public.document_chunks c
    join public.documents d on d.id = c.document_id
    where c.workspace_id = match_workspace_id
      and c.embedding is not null
      and (match_project_id is null or c.project_id = match_project_id)
      and (1 - (c.embedding <=> query_embedding)) >= similarity_threshold
    order by c.embedding <=> query_embedding
    limit pool
  ),
  keyword_hits as (
    select
      c.id,
      c.document_id,
      c.content,
      c.page_number,
      c.section_title,
      c.chunk_index,
      ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', query_text))::real as kscore,
      d.filename,
      d.source_url,
      row_number() over (
        order by ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', query_text)) desc
      ) as krank
    from public.document_chunks c
    join public.documents d on d.id = c.document_id
    where c.workspace_id = match_workspace_id
      and c.content_tsv is not null
      and (match_project_id is null or c.project_id = match_project_id)
      and query_text is not null
      and length(trim(query_text)) > 0
      and c.content_tsv @@ websearch_to_tsquery('english', query_text)
    order by kscore desc
    limit pool
  ),
  fused as (
    select
      coalesce(v.id, k.id) as id,
      coalesce(v.document_id, k.document_id) as document_id,
      coalesce(v.content, k.content) as content,
      coalesce(v.page_number, k.page_number) as page_number,
      coalesce(v.section_title, k.section_title) as section_title,
      coalesce(v.chunk_index, k.chunk_index) as chunk_index,
      coalesce(v.sim, 0)::real as sim,
      coalesce(v.filename, k.filename) as filename,
      coalesce(v.source_url, k.source_url) as source_url,
      (
        coalesce(1.0 / (60 + v.vrank), 0) +
        coalesce(1.0 / (60 + k.krank), 0)
      )::real as rrf
    from vector_hits v
    full outer join keyword_hits k on k.id = v.id
  )
  select
    f.id as chunk_id,
    f.document_id,
    f.content,
    f.page_number,
    f.section_title,
    f.chunk_index,
    -- Expose fused score in the similarity field for ranking/UI (still 0..~1).
    least(1.0, greatest(f.sim, f.rrf * 30))::real as similarity,
    f.filename,
    f.source_url
  from fused f
  order by f.rrf desc, f.sim desc
  limit lim;
end;
$$;
