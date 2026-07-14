export interface ProviderVerification {
  ok: boolean;
  reference: string | null;
  reason?: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function referenceFrom(value: unknown): string | null {
  const root = record(value);
  if (!root) return null;
  const nested = [root, record(root.data), record(root.response_data), record(root.result)].filter(
    (v): v is Record<string, unknown> => Boolean(v),
  );
  for (const item of nested) {
    for (const key of ["id", "messageId", "message_id", "threadId", "thread_id", "eventId", "event_id"]) {
      const candidate = item[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 160);
      if (typeof candidate === "number") return String(candidate);
    }
  }
  return null;
}

/**
 * Composio can return an HTTP-success payload that still represents provider
 * failure. Require an explicit success signal or a provider reference.
 */
export function verifyProviderExecutionResult(value: unknown): ProviderVerification {
  const root = record(value);
  if (!root) return { ok: false, reference: null, reason: "Provider returned no structured confirmation." };

  const failureReason = providerResultFailureReason(root);
  if (failureReason) return { ok: false, reference: null, reason: failureReason };

  const reference = referenceFrom(root);
  const status = String(root.status ?? root.state ?? "").toLowerCase();
  const explicitSuccess =
    root.success === true ||
    root.successful === true ||
    root.ok === true ||
    ["success", "succeeded", "completed", "ok"].includes(status);
  if (!explicitSuccess && !reference) {
    return { ok: false, reference: null, reason: "The provider response did not contain a verifiable success signal." };
  }
  return { ok: true, reference };
}

/** Detect explicit failure without requiring write-style receipt fields. */
export function providerResultFailureReason(value: unknown): string | null {
  const root = record(value);
  if (!root) return null;
  const status = String(root.status ?? root.state ?? "").toLowerCase();
  if (
    root.success === false ||
    root.successful === false ||
    root.ok === false ||
    Boolean(root.error) ||
    ["failed", "error", "rejected", "cancelled"].includes(status)
  ) {
    return "The provider reported that the operation failed.";
  }
  return null;
}

export { referenceFrom as extractVerifiedProviderReference };
