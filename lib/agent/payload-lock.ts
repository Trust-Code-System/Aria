/**
 * Approval payload locking — mitigates Lies-in-the-Loop (LITL).
 *
 * At gate time we freeze a canonical JSON payload + SHA-256 hash. Execution
 * must use that exact payload; if the hash no longer matches, refuse to run.
 * Approval UI should render structured fields from this payload only — never
 * trust agent-authored markdown as executable intent.
 */
import { createHash } from "crypto";

import type { RiskLevel } from "@/lib/agent/types";

/** Fields that define what will actually execute after approval. */
export interface LockedApprovalPayload {
  version: 1;
  action_type: string;
  risk_level: RiskLevel;
  task_id: string;
  step_id: string;
  step_idx: number;
  /** Plain-text step summary (no markdown rendering as policy). */
  summary: string;
  tool_name: string | null;
}

/** Stable JSON with sorted keys so hashes are deterministic. */
export function canonicalizePayload(payload: LockedApprovalPayload): string {
  return stableStringify(payload);
}

export function hashCanonical(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function lockPayload(payload: LockedApprovalPayload): {
  canonical: string;
  hash: string;
  payload: LockedApprovalPayload;
} {
  const normalized: LockedApprovalPayload = {
    version: 1,
    action_type: payload.action_type,
    risk_level: payload.risk_level,
    task_id: payload.task_id,
    step_id: payload.step_id,
    step_idx: payload.step_idx,
    summary: payload.summary.slice(0, 500),
    tool_name: payload.tool_name,
  };
  const canonical = canonicalizePayload(normalized);
  return { canonical, hash: hashCanonical(canonical), payload: normalized };
}

/**
 * Verify a stored lock. Returns the parsed payload on success, or an error
 * reason on failure (never throws — callers decide how to fail closed).
 */
export function verifyLockedPayload(
  canonical: string | null | undefined,
  expectedHash: string | null | undefined,
): { ok: true; payload: LockedApprovalPayload } | { ok: false; reason: string } {
  if (!canonical || !expectedHash) {
    return { ok: false, reason: "Missing locked payload — refusing to execute." };
  }
  if (hashCanonical(canonical) !== expectedHash) {
    return { ok: false, reason: "Payload hash mismatch — approval may have been tampered with." };
  }
  try {
    const parsed = JSON.parse(canonical) as LockedApprovalPayload;
    if (parsed?.version !== 1 || typeof parsed.action_type !== "string" || typeof parsed.summary !== "string") {
      return { ok: false, reason: "Locked payload is malformed." };
    }
    // Re-canonicalize to reject extra/reordered-but-different semantics.
    const again = lockPayload(parsed);
    if (again.hash !== expectedHash) {
      return { ok: false, reason: "Locked payload failed re-canonicalization." };
    }
    return { ok: true, payload: again.payload };
  } catch {
    return { ok: false, reason: "Locked payload is not valid JSON." };
  }
}

/** Safe, structured fields for the approval inbox (no free-form markdown). */
export function payloadPreviewFields(payload: LockedApprovalPayload): Record<string, string> {
  return {
    action: payload.action_type,
    risk: String(payload.risk_level),
    step: String(payload.step_idx + 1),
    tool: payload.tool_name ?? "—",
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}
