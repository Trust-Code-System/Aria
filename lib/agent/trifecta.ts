/**
 * Lethal-trifecta capability policy (pure, deterministic, unit-tested).
 *
 * An agent session that combines all three of
 *   1. access to private data,
 *   2. exposure to untrusted content (web pages, emails, files, issues), and
 *   3. a channel that communicates externally
 * is an exfiltration risk even when every individual step looks harmless
 * (Willison 2025; Meta "Agents Rule of Two" 2025; OWASP Agentic Top 10 2026).
 *
 * Aria's tasks always run with private workspace context, so `readsPrivate`
 * is treated as permanently true. The enforceable budget is therefore:
 * once a task has ingested ANY untrusted content, every step that
 * communicates externally must be gated at approval level >= 2 — even if the
 * plain risk classifier scored it lower. Escalation is sticky for the rest
 * of the task: untrusted exposure never resets.
 */
import type { RiskLevel } from "@/lib/agent/types";

export interface CapabilityFlags {
  /** Reads workspace documents, memories, email bodies, private repos, ... */
  readsPrivate: boolean;
  /** Ingests content an attacker could have authored (web, inbox, files, issues). */
  acceptsUntrusted: boolean;
  /** Can move information out of the workspace (send, post, invite, push). */
  communicatesExternally: boolean;
}

/** Action types (from lib/agent/risk.ts) that ingest untrusted content. */
const UNTRUSTED_INTAKE_ACTIONS = new Set(["safe_research", "read_email", "read_file"]);

/** Action types that can carry data out of the workspace. */
const EXTERNAL_COMMS_ACTIONS = new Set([
  "send_email",
  "send_message",
  "calendar_write",
  "code_commit",
  "external_share",
  "payment",
  "deploy_production",
  "bulk_action",
]);

/**
 * Step summaries that imply reading content produced outside the workspace.
 * Mirrors the research trigger in runtime.ts plus inbox/file reads.
 */
const UNTRUSTED_INTAKE_RE =
  /\b(research|search|look up|investigate|gather|browse|scrape|fetch|read (my )?(email|emails|inbox|mail)|check (the )?(inbox|web)|triage)\b/i;

/** True when executing this step would ingest untrusted external content. */
export function stepAcceptsUntrusted(summary: string, actionType?: string): boolean {
  if (actionType && UNTRUSTED_INTAKE_ACTIONS.has(actionType)) return true;
  return UNTRUSTED_INTAKE_RE.test(summary);
}

/** True when this action type can move data out of the workspace. */
export function stepCommunicatesExternally(actionType: string): boolean {
  return EXTERNAL_COMMS_ACTIONS.has(actionType);
}

export interface TaskExposure {
  /** The task has already ingested untrusted content in an earlier step. */
  touchedUntrusted: boolean;
}

/**
 * Recompute exposure from the steps executed so far. Pure — callers pass the
 * (summary, actionType, done) triples; resumed tasks recompute identically.
 */
export function exposureFromSteps(
  steps: Array<{ summary: string; actionType?: string; done: boolean }>,
): TaskExposure {
  return {
    touchedUntrusted: steps.some(
      (s) => s.done && stepAcceptsUntrusted(s.summary, s.actionType),
    ),
  };
}

export interface TrifectaDecision {
  /** The risk level the step must be gated at (never lower than base). */
  effectiveRisk: RiskLevel;
  /** True when the trifecta rule raised the level above the base classifier. */
  escalated: boolean;
  /** Human-readable reason, shown in the approval card's safe metadata. */
  reason: string | null;
}

/**
 * Decide the effective gate for one step. Level 4 (blocked) is never reduced;
 * a step that completes the trifecta is raised to at least level 2 (approval).
 */
export function gateStepForTrifecta(params: {
  baseRisk: RiskLevel;
  actionType: string;
  exposure: TaskExposure;
}): TrifectaDecision {
  const { baseRisk, actionType, exposure } = params;
  if (baseRisk >= 2) {
    return { effectiveRisk: baseRisk, escalated: false, reason: null };
  }
  const completesTrifecta =
    exposure.touchedUntrusted && stepCommunicatesExternally(actionType);
  if (!completesTrifecta) {
    return { effectiveRisk: baseRisk, escalated: false, reason: null };
  }
  return {
    effectiveRisk: 2,
    escalated: true,
    reason:
      "This task read external content earlier, so any outward-facing step needs your approval (untrusted content + private data + external send must never combine silently).",
  };
}
