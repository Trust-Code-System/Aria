/**
 * Real execution of APPROVED agent steps.
 *
 * Safety posture:
 *  - This module is only ever called after `resolveApprovalOutcome` returned
 *    `execute` — i.e. the user explicitly approved the step.
 *  - Email actions create a Gmail DRAFT, never send. Sending remains a manual,
 *    separately-confirmed act (see /api/cowork/email-action). Even an approved
 *    "send email" step therefore produces a reviewable draft — the most
 *    conservative real-world interpretation.
 *  - Anything we don't have a real integration for falls back to a clearly
 *    labeled simulation note. Nothing pretends to have happened.
 *  - Connector failures never kill the task: they return an honest note and the
 *    error is logged for the admin portal.
 */
import { generateText } from "ai";

import type { SessionContext } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { getChatModel, resolveUsableChatModelId } from "@/lib/ai/providers";
import { configured } from "@/lib/env";
import { createDraft } from "@/lib/connectors/gmail";
import { logError } from "@/lib/logging/error-log";
import type { AgentTask, AgentTaskStep } from "@/lib/agent/types";

const EMAIL_ACTIONS = new Set(["send_email", "draft_email", "send_message"]);
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const SIMULATED_NOTE =
  "✅ Approved — action recorded (simulated; no real integration is wired for this action type yet).";

export interface ExecutionResult {
  /** Markdown appended to the task result — always states what REALLY happened. */
  note: string;
  /** True if a real external side effect (e.g. a Gmail draft) was produced. */
  real: boolean;
}

/** Perform an approved step for real where possible; otherwise simulate honestly. */
export async function performApprovedStep(
  task: AgentTask,
  step: AgentTaskStep,
  actionType: string,
  priorResult: string,
  ctx: SessionContext,
): Promise<ExecutionResult> {
  if (EMAIL_ACTIONS.has(actionType)) {
    return performEmailStep(task, step, priorResult, ctx);
  }
  return { note: SIMULATED_NOTE, real: false };
}

/**
 * Email step: always produce the draft text; if Gmail is connected AND a
 * recipient address is present, also create a real Gmail draft.
 */
async function performEmailStep(
  task: AgentTask,
  step: AgentTaskStep,
  priorResult: string,
  ctx: SessionContext,
): Promise<ExecutionResult> {
  const draft = await composeEmailDraft(task, step, priorResult);
  if (!draft) {
    return {
      note: "⚠️ Approved, but no LLM provider is configured to compose the email. Add an LLM key and run again.",
      real: false,
    };
  }

  const rendered = [
    draft.to ? `**To:** ${draft.to}` : "**To:** _(no recipient address found in the task)_",
    `**Subject:** ${draft.subject}`,
    "",
    draft.body,
  ].join("\n");

  const connection = await getActiveGmailConnection(ctx);
  if (!connection) {
    return {
      note: `📝 Draft composed below. Gmail is not connected, so no draft was created in your mailbox — connect Gmail on the Connections page to enable that.\n\n${rendered}`,
      real: false,
    };
  }
  if (!draft.to) {
    return {
      note: `📝 Draft composed below, but the task doesn't name a recipient email address, so no Gmail draft was created. Add the address to the task and run again, or copy the draft manually.\n\n${rendered}`,
      real: false,
    };
  }

  try {
    await createDraft({
      entityId: connection.entityId,
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    });
    return {
      note: `✉️ **Created a Gmail draft to ${draft.to}** (nothing was sent — review and send it from Gmail, or use the email tools here).\n\n${rendered}`,
      real: true,
    };
  } catch (err) {
    await logError({ area: "tools", error: err, workspaceId: ctx.workspaceId, userId: ctx.userId, provider: "composio" });
    return {
      note: `⚠️ Approved, but creating the Gmail draft failed (the error was logged). The composed draft is below — you can copy it manually or run the task again.\n\n${rendered}`,
      real: false,
    };
  }
}

interface EmailDraft {
  to: string | null;
  subject: string;
  body: string;
}

/** LLM-compose a structured draft from the task, the step, and prior step output. */
async function composeEmailDraft(
  task: AgentTask,
  step: AgentTaskStep,
  priorResult: string,
): Promise<EmailDraft | null> {
  const modelId = resolveUsableChatModelId();
  if (!modelId) return null;

  const { text } = await generateText({
    model: getChatModel(modelId, "tools"),
    system:
      "You compose one email for a step of a larger task. Respond with ONLY a JSON object: " +
      '{"to": "<recipient email address found in the task, or null if none is given>", ' +
      '"subject": "...", "body": "..."}. The body is plain text, ready to send, no placeholders ' +
      "like [Name] unless the information is genuinely unknown. Never invent a recipient address.",
    prompt:
      `Task: ${task.title}\n${task.description ?? ""}\n\n` +
      `Step to perform: ${step.summary}\n\n` +
      (priorResult ? `Work done so far (use it for content):\n${priorResult.slice(-4000)}` : ""),
    temperature: 0.4,
  });

  const parsed = parseDraft(text);
  if (!parsed) return null;
  // Trust an address only if it also appears in the user's own task text.
  const taskText = `${task.title} ${task.description ?? ""} ${step.summary}`;
  const to =
    parsed.to && EMAIL_RE.test(parsed.to) && taskText.includes(parsed.to.trim())
      ? parsed.to.trim()
      : (taskText.match(EMAIL_RE)?.[0] ?? null);
  return { to, subject: parsed.subject, body: parsed.body };
}

function parseDraft(text: string): EmailDraft | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    if (typeof raw.subject !== "string" || typeof raw.body !== "string") return null;
    return {
      to: typeof raw.to === "string" ? raw.to : null,
      subject: raw.subject.slice(0, 300),
      body: raw.body.slice(0, 10000),
    };
  } catch {
    return null;
  }
}

async function getActiveGmailConnection(
  ctx: SessionContext,
): Promise<{ entityId: string } | null> {
  if (!configured.connectors) return null;
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("connections")
    .select("status, composio_entity_id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("provider", "gmail")
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return { entityId: data.composio_entity_id ?? ctx.userId };
}
