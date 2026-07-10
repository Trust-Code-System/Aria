-- ============================================================================
-- 0012 — Per-step output checkpoints.
--
-- The agent runtime now persists each step's output (and the task's
-- accumulated result) as it goes, so an interrupted or approval-parked task
-- resumes without losing completed work. Outputs are user-visible in the task
-- timeline; they must never contain secrets (the runtime writes model/tool
-- output only, and sanitized notes for skipped/blocked steps).
-- ============================================================================

alter table public.agent_task_steps
  add column if not exists output text;
