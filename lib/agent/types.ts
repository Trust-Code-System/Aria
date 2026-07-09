/**
 * Shared types for the agent task engine + approvals.
 *
 * Risk levels mirror the product spec's Level 0–4 approval ladder:
 *   0 no approval (research/summarize/draft)   1 simple confirm (save draft, internal msg)
 *   2 explicit approval (send email, commit)   3 admin/2FA (payments, bulk, deploy)
 *   4 blocked (policy violation / cross-tenant / secret exposure)
 */

export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskPriority = "low" | "normal" | "high";

export type StepKind = "plan" | "action" | "tool" | "approval" | "review";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "expired";

export type RiskLevel = 0 | 1 | 2 | 3 | 4;

export const RISK_LABELS: Record<RiskLevel, string> = {
  0: "No approval",
  1: "Low",
  2: "Needs approval",
  3: "High — admin",
  4: "Blocked",
};

export interface AgentTask {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  risk_level: RiskLevel;
  current_step: number;
  max_steps: number;
  cost_estimate: number;
  cost_actual: number;
  result: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  failed_at: string | null;
}

export interface AgentTaskStep {
  id: string;
  task_id: string;
  workspace_id: string;
  idx: number;
  kind: StepKind;
  status: StepStatus;
  summary: string;
  tool_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: string;
  workspace_id: string;
  user_id: string;
  task_id: string | null;
  step_id: string | null;
  action_type: string;
  risk_level: RiskLevel;
  status: ApprovalStatus;
  summary: string;
  tool_name: string | null;
  safe_metadata: Record<string, unknown>;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export const TERMINAL_TASK_STATUSES: TaskStatus[] = ["completed", "failed", "cancelled"];

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status);
}
