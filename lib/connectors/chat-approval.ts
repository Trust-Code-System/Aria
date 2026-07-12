/**
 * Chat-originated tool approval locking + execution.
 * Reuses approvals table (task_id nullable) with payload_canonical/hash.
 *
 * Execution is claim-once: approved → executing → succeeded|failed.
 * Replaying a succeeded approval is rejected (idempotency).
 */
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTool } from "@/lib/ai/tools";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";
import { sanitizeForLog } from "@/lib/security/sanitize";

export interface ChatToolLockV1 {
  version: 1;
  kind: "chat_tool";
  tool_name: string;
  conversation_id: string | null;
  workspace_id: string;
  args: {
    to?: string;
    subject?: string;
    body?: string;
    cc?: string;
    bcc?: string;
    [key: string]: unknown;
  };
}

export interface ExtractedMailFields {
  to: string;
  subject: string;
  body: string;
  cc: string;
  bcc: string;
}

/**
 * Normalize common local + Composio Gmail argument shapes.
 * Composio GMAIL_SEND_EMAIL uses recipient_email (see lib/connectors/gmail.ts).
 */
export function extractMailFields(args: Record<string, unknown>): ExtractedMailFields {
  const str = (...keys: string[]): string => {
    for (const k of keys) {
      const v = args[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  // Nested recipients: { to: [{ email: "..." }] } or { to: ["a@b.com"] }
  const fromList = (key: string): string => {
    const v = args[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v)) {
      return v
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            if (typeof o.email === "string") return o.email.trim();
            if (typeof o.address === "string") return o.address.trim();
          }
          return "";
        })
        .filter(Boolean)
        .join(", ");
    }
    return "";
  };

  return {
    to:
      str("to", "recipient_email", "recipient", "recipientEmail", "email", "to_email") ||
      fromList("to") ||
      fromList("recipients"),
    subject: str("subject", "email_subject", "Subject"),
    body: str("body", "message", "email_body", "html_body", "text", "Body"),
    cc: str("cc", "cc_email") || fromList("cc"),
    bcc: str("bcc", "bcc_email") || fromList("bcc"),
  };
}

function isSendLikeTool(toolName: string): boolean {
  const u = toolName.toUpperCase();
  return u === "GMAIL_SEND" || u.includes("GMAIL_SEND") || u === "SEND_EMAIL";
}

export function summarizeChatToolApproval(toolName: string, args: Record<string, unknown>): string {
  if (isSendLikeTool(toolName)) {
    const mail = extractMailFields(args);
    return `Send email to ${mail.to || "(unknown)"} — ${mail.subject || "(no subject)"}`;
  }
  return `Run ${toolName}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function lockChatToolPayload(payload: ChatToolLockV1): { canonical: string; hash: string } {
  const canonical = stableStringify(payload);
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return { canonical, hash };
}

export function verifyChatToolLock(
  canonical: string | null | undefined,
  hash: string | null | undefined,
): { ok: true; payload: ChatToolLockV1 } | { ok: false; reason: string } {
  if (!canonical || !hash) return { ok: false, reason: "Missing locked payload." };
  if (createHash("sha256").update(canonical, "utf8").digest("hex") !== hash) {
    return { ok: false, reason: "Payload hash mismatch." };
  }
  try {
    const parsed = JSON.parse(canonical) as ChatToolLockV1;
    if (parsed?.version !== 1 || parsed.kind !== "chat_tool" || !parsed.tool_name) {
      return { ok: false, reason: "Malformed chat tool lock." };
    }
    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, reason: "Invalid lock JSON." };
  }
}

/** Sanitize provider result for storage / UI — never tokens or full private bodies. */
export function buildActionReceipt(params: {
  toolName: string;
  args: Record<string, unknown>;
  providerResult: unknown;
  startedAt: string;
  completedAt: string;
}): Record<string, unknown> {
  const mail = extractMailFields(params.args);
  const ref = extractProviderReference(params.providerResult);
  return {
    provider: params.toolName.toUpperCase().startsWith("GMAIL") ? "gmail" : "composio",
    tool_name: params.toolName,
    to: mail.to || null,
    subject: mail.subject || null,
    body_preview: mail.body ? sanitizeForLog(mail.body.slice(0, 180)) : null,
    provider_reference: ref,
    started_at: params.startedAt,
    completed_at: params.completedAt,
    status: "succeeded",
  };
}

function extractProviderReference(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const candidates = [
    r.id,
    r.messageId,
    r.message_id,
    r.threadId,
    r.thread_id,
    (r.data as Record<string, unknown> | undefined)?.id,
    (r.response_data as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 120);
    if (typeof c === "number") return String(c);
  }
  return null;
}

export async function createChatToolApproval(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  conversationId: string | null;
  toolName: string;
  args: Record<string, unknown>;
  riskLevel?: number;
}): Promise<{ approvalId: string; summary: string }> {
  const mail = extractMailFields(params.args);
  const summary = summarizeChatToolApproval(params.toolName, params.args);

  const lock = lockChatToolPayload({
    version: 1,
    kind: "chat_tool",
    tool_name: params.toolName,
    conversation_id: params.conversationId,
    workspace_id: params.workspaceId,
    args: params.args,
  });

  const { data, error } = await params.supabase
    .from("approvals")
    .insert({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      task_id: null,
      step_id: null,
      action_type: isSendLikeTool(params.toolName) ? "send_email" : params.toolName,
      risk_level: params.riskLevel ?? 3,
      status: "pending",
      summary: summary.slice(0, 500),
      tool_name: params.toolName,
      safe_metadata: {
        source: "chat",
        conversation_id: params.conversationId,
        to: mail.to || null,
        cc: mail.cc || null,
        bcc: mail.bcc || null,
        subject: mail.subject || null,
        body_preview: mail.body ? sanitizeForLog(mail.body.slice(0, 180)) : null,
      },
      payload_canonical: lock.canonical,
      payload_hash: lock.hash,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new AppError({
      area: "approvals",
      category: "internal",
      userMessage: "Could not create an approval request for this action.",
      internal: error,
    });
  }

  await logAudit({
    action: "approval.create",
    workspaceId: params.workspaceId,
    userId: params.userId,
    targetType: "approval",
    targetId: data.id,
    metadata: { tool_name: params.toolName, source: "chat", to: mail.to || undefined },
  });

  return { approvalId: data.id, summary };
}

type MetaBag = Record<string, unknown>;

function asMeta(value: unknown): MetaBag {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as MetaBag) }
    : {};
}

/**
 * Atomically claim an approved chat tool for execution.
 * Returns false if already executing/succeeded/failed or not approved.
 */
export async function claimChatToolExecution(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  approvalId: string;
}): Promise<
  | { ok: true; toolName: string; payload: ChatToolLockV1; priorMeta: MetaBag }
  | { ok: false; reason: string; status: string }
> {
  const { data: approval } = await params.supabase
    .from("approvals")
    .select("id, status, tool_name, payload_canonical, payload_hash, safe_metadata")
    .eq("id", params.approvalId)
    .eq("workspace_id", params.workspaceId)
    .maybeSingle();

  if (!approval) return { ok: false, reason: "Approval not found.", status: "missing" };

  if (approval.status === "succeeded") {
    return { ok: false, reason: "This approval already completed successfully. Create a new request to send again.", status: "succeeded" };
  }
  if (approval.status === "executing") {
    return { ok: false, reason: "This approval is already executing.", status: "executing" };
  }
  if (approval.status === "failed") {
    return {
      ok: false,
      reason: "This approval already failed. Request the action again from chat (do not reuse).",
      status: "failed",
    };
  }
  if (approval.status !== "approved") {
    return { ok: false, reason: "This approval is not in an approved state.", status: approval.status };
  }

  const priorMeta = asMeta(approval.safe_metadata);
  if (priorMeta.executed_at || priorMeta.execution_ok === true) {
    return {
      ok: false,
      reason: "This approval already has an execution receipt. Create a new request to send again.",
      status: "succeeded",
    };
  }

  const verified = verifyChatToolLock(approval.payload_canonical, approval.payload_hash);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason, status: approval.status };
  }

  const startedAt = new Date().toISOString();
  const { data: claimed, error } = await params.supabase
    .from("approvals")
    .update({
      status: "executing",
      safe_metadata: {
        ...priorMeta,
        execution_started_at: startedAt,
        idempotency_key: `approval:${params.approvalId}`,
      },
    })
    .eq("id", params.approvalId)
    .eq("workspace_id", params.workspaceId)
    .eq("status", "approved")
    .select("id, tool_name")
    .maybeSingle();

  if (error || !claimed) {
    return {
      ok: false,
      reason: "Could not claim this approval for execution (it may have already started).",
      status: "race",
    };
  }

  return {
    ok: true,
    toolName: verified.payload.tool_name,
    payload: verified.payload,
    priorMeta: {
      ...priorMeta,
      execution_started_at: startedAt,
      idempotency_key: `approval:${params.approvalId}`,
    },
  };
}

/** Execute a chat-tool approval after the user approved (payload lock verified + claim). */
export async function executeApprovedChatTool(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  approvalId: string;
}): Promise<{ ok: boolean; result: unknown; receipt?: Record<string, unknown> }> {
  const claimed = await claimChatToolExecution({
    supabase: params.supabase,
    workspaceId: params.workspaceId,
    approvalId: params.approvalId,
  });

  if (!claimed.ok) {
    throw new AppError({
      area: "approvals",
      category: claimed.status === "succeeded" || claimed.status === "executing" ? "validation" : "validation",
      userMessage: claimed.reason,
      internal: { status: claimed.status },
    });
  }

  const startedAt =
    typeof claimed.priorMeta.execution_started_at === "string"
      ? claimed.priorMeta.execution_started_at
      : new Date().toISOString();

  const tool = getTool(claimed.toolName);
  const isComposioSlug = /^[A-Z0-9_]+$/.test(claimed.toolName);

  let result: unknown;
  try {
    if (isComposioSlug || !tool?.execute) {
      const { executeComposioToolFromApproval } = await import("@/lib/connectors/composio-session");
      result = await executeComposioToolFromApproval({
        toolSlug: claimed.toolName,
        supabaseUserId: params.userId,
        args: claimed.payload.args as Record<string, unknown>,
      });
    } else {
      result = await tool.execute(claimed.payload.args as Record<string, unknown>, {
        workspaceId: params.workspaceId,
        userId: params.userId,
        confirmed: true,
      });
    }
  } catch (err) {
    const completedAt = new Date().toISOString();
    await params.supabase
      .from("approvals")
      .update({
        status: "failed",
        safe_metadata: {
          ...claimed.priorMeta,
          executed_at: completedAt,
          execution_ok: false,
          error_redacted: sanitizeForLog(
            err instanceof Error ? err.message.slice(0, 200) : "execution_failed",
          ),
        },
      })
      .eq("id", params.approvalId)
      .eq("workspace_id", params.workspaceId);

    await logAudit({
      action: "tool.execute.failed",
      workspaceId: params.workspaceId,
      userId: params.userId,
      targetType: "approval",
      targetId: params.approvalId,
      metadata: { tool_name: claimed.toolName, source: "chat" },
    });

    throw err instanceof AppError
      ? err
      : new AppError({
          area: "tools",
          category: "provider_error",
          userMessage:
            "Approved, but the connected app failed to complete the action. Nothing was marked as sent. Try again from chat.",
          internal: err instanceof Error ? err.message : err,
        });
  }

  const completedAt = new Date().toISOString();
  const receipt = buildActionReceipt({
    toolName: claimed.toolName,
    args: claimed.payload.args as Record<string, unknown>,
    providerResult: result,
    startedAt,
    completedAt,
  });

  await params.supabase
    .from("approvals")
    .update({
      status: "succeeded",
      safe_metadata: {
        ...claimed.priorMeta,
        executed_at: completedAt,
        execution_ok: true,
        receipt,
      },
    })
    .eq("id", params.approvalId)
    .eq("workspace_id", params.workspaceId);

  await logAudit({
    action: "tool.execute",
    workspaceId: params.workspaceId,
    userId: params.userId,
    targetType: "approval",
    targetId: params.approvalId,
    metadata: {
      tool_name: claimed.toolName,
      source: "chat",
      provider_reference: receipt.provider_reference ?? undefined,
    },
  });

  return { ok: true, result, receipt };
}
