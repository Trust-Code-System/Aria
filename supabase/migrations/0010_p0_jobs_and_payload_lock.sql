-- ============================================================================
-- 0010 — P0: approval payload locks + durable job metadata.
--
-- payload_canonical / payload_hash freeze the exact action approved (LITL).
-- jobs.payload / jobs.idempotency_key support enqueue + resume without dupes.
-- ============================================================================

alter table public.approvals
  add column if not exists payload_canonical text,
  add column if not exists payload_hash text;

comment on column public.approvals.payload_canonical is
  'Canonical JSON of the locked executable payload (versioned).';
comment on column public.approvals.payload_hash is
  'SHA-256 hex of payload_canonical; verified at execute time.';

alter table public.jobs
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text;

create unique index if not exists jobs_ws_idempotency_uidx
  on public.jobs (workspace_id, idempotency_key)
  where idempotency_key is not null and status in ('pending', 'processing');

create index if not exists jobs_ws_pending_idx
  on public.jobs (workspace_id, status, created_at)
  where status = 'pending';
