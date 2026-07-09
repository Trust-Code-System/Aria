/**
 * Pure decision logic for what the runtime may do with a risky step, given the
 * step's risk level and the latest approval decision. Kept free of I/O so it is
 * unit-testable and there is exactly ONE place that answers "can this run?".
 *
 * Rules (mirror the product's risk ladder in lib/agent/types.ts):
 *  - Level 4 is BLOCKED: never create an approval, never execute — the step is
 *    skipped with an explanatory note.
 *  - Only an explicit `approved` decision executes a gated step.
 *  - `rejected` cancels the whole task (the user said no to a required action).
 *  - `changes_requested` does NOT execute: the step is skipped with a note and
 *    the rest of the task continues. (Revision flows can supersede this later.)
 *  - `pending` / missing keeps the task parked at waiting_for_approval.
 */
import type { ApprovalStatus, RiskLevel } from "@/lib/agent/types";

export type GateOutcome =
  | { action: "blocked"; note: string }
  | { action: "wait" }
  | { action: "execute" }
  | { action: "skip"; note: string }
  | { action: "cancel_task"; note: string };

/** Decide before an approval exists: should we even ask? */
export function gateForRiskLevel(riskLevel: RiskLevel): "blocked" | "needs_approval" | "safe" {
  if (riskLevel >= 4) return "blocked";
  if (riskLevel >= 1) return "needs_approval";
  return "safe";
}

/** Decide what to do with a gated step given the latest approval decision. */
export function resolveApprovalOutcome(
  riskLevel: RiskLevel,
  approvalStatus: ApprovalStatus | null,
): GateOutcome {
  if (riskLevel >= 4) {
    return {
      action: "blocked",
      note: "⛔ Blocked by policy (Level 4) — this action will not be performed.",
    };
  }
  switch (approvalStatus) {
    case null:
    case "pending":
      return { action: "wait" };
    case "approved":
      return { action: "execute" };
    case "rejected":
      return { action: "cancel_task", note: "You rejected a required action." };
    case "changes_requested":
      return {
        action: "skip",
        note: "✋ Changes requested — action not performed. Edit the task and run it again, or create a new task with the corrected instructions.",
      };
    case "expired":
      return { action: "wait" }; // a fresh approval must be created
    default:
      return { action: "wait" }; // unknown status: fail safe, never execute
  }
}

/** Whether an approval with this risk level may be approved at all (UI + API guard). */
export function isApprovable(riskLevel: RiskLevel): boolean {
  return riskLevel < 4;
}
