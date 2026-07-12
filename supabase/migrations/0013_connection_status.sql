-- ============================================================================
-- Connection status truthfulness: expand status vocabulary, store validation
-- metadata and capability flags. Tokens remain in Composio — we only store
-- connected-account references (existing columns).
-- ============================================================================

-- Drop old check, add expanded statuses (keep legacy 'active' / 'error').
alter table public.connections drop constraint if exists connections_status_check;

alter table public.connections
  add constraint connections_status_check check (
    status in (
      'pending',
      'active',              -- legacy synonym of connected
      'connected',
      'error',               -- legacy; prefer action_required
      'disconnected',
      'action_required',
      'expired',
      'missing_permission',
      'reconnecting',
      'provider_unavailable',
      'setup_incomplete'
    )
  );

alter table public.connections
  add column if not exists last_validated_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message_redacted text,
  add column if not exists capabilities jsonb not null default '{}'::jsonb,
  add column if not exists provider_account_id text,
  add column if not exists revoked_at timestamptz;

-- Normalize legacy rows for clearer UI (active → connected).
update public.connections
set status = 'connected'
where status = 'active';

update public.connections
set status = 'action_required'
where status = 'error';
