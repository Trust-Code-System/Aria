/**
 * Heuristic risk classification for a planned agent step.
 *
 * Pure and deterministic so it's unit-testable and can run with no LLM. Maps a
 * step's text to the product's risk ladder (see lib/agent/types.ts):
 *   0 safe (research/summarize)
 *   1 confirm (external drafts)
 *   2 needs approval (send/post/commit)
 *   3 high/admin (pay/purchase/deploy/bulk)
 *   4 blocked (secrets/policy)
 *
 * Anything level >= 1 must pass through the Approval Inbox before it "runs".
 */
import type { RiskLevel } from "@/lib/agent/types";

export interface RiskAssessment {
  risky: boolean; // requires human approval (level >= 1)
  riskLevel: RiskLevel;
  actionType: string; // short slug, e.g. "send_email"
}

// Ordered high -> low so the most severe match wins.
const RULES: { level: RiskLevel; action: string; pattern: RegExp }[] = [
  // Level 4: blocked outright.
  { level: 4, action: "expose_secret", pattern: /\b(api key|secret key|password|private key|credential|\.env)\b/i },
  // Level 3: money / destructive / bulk / production.
  { level: 3, action: "payment", pattern: /\b(pay|payment|purchase|buy|invoice|charge|refund|wire|transfer (money|funds)|trade)\b/i },
  { level: 3, action: "deploy_production", pattern: /\b(deploy|release|ship)\b.*\bprod(uction)?\b|\bpush to prod\b/i },
  { level: 3, action: "bulk_action", pattern: /\b(bulk|mass|all contacts|everyone|delete all|wipe)\b/i },
  // Level 2: outward-facing / state-changing.
  { level: 2, action: "send_email", pattern: /\b(send|reply to|email|e-mail)\b.*\b(email|mail|message|client|customer)\b|\bsend an? email\b/i },
  { level: 2, action: "send_message", pattern: /\b(send|post|publish|tweet|dm|message)\b/i },
  { level: 2, action: "calendar_write", pattern: /\b(schedule|book|invite|create (a )?(meeting|event)|reschedule|cancel (the )?meeting)\b/i },
  { level: 2, action: "code_commit", pattern: /\b(commit|open (a )?pr|pull request|merge|push)\b/i },
  { level: 2, action: "delete", pattern: /\b(delete|remove|erase|drop)\b/i },
  { level: 2, action: "external_share", pattern: /\b(share|grant access|add (a )?collaborator)\b/i },
  // Level 1: low-risk external drafts that still need user confirmation.
  { level: 1, action: "draft_email", pattern: /\b(draft|write|prepare|create)\b.*\b(email|e-mail|message|reply)\b/i },
];

export function classifyStepRisk(text: string): RiskAssessment {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { risky: rule.level >= 1, riskLevel: rule.level, actionType: rule.action };
    }
  }
  return { risky: false, riskLevel: 0, actionType: "safe" };
}
