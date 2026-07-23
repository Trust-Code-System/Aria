/**
 * Minimal in-app agent runtime: plan → execute safe steps → gate risky ones.
 *
 * This is the "muscle" behind agent_tasks. It's deliberately conservative:
 *   - Safe steps (research/draft/summarize) run using the app's existing LLM +
 *     research providers.
 *   - Risky steps (send/post/pay/delete…) do NOT execute. They create an approval
 *     in the inbox and the task parks at `waiting_for_approval` until you decide.
 *   - After you approve, calling run again resumes and "performs" the action
 *     (currently simulated — no real send/charge happens until real tool
 *     integrations are wired; this keeps the loop safe by construction).
 *   - A `max_steps` guard prevents runaway loops.
 *
 * `runTask` is idempotent: it skips finished steps, so it doubles as resume.
 */
import { generateText } from "ai";

import type { SessionContext } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { getChatModel, resolveUsableChatModelId, resolveTemperature } from "@/lib/ai/providers";
import { runResearch } from "@/lib/ai/research";
import { classifyStepRisk } from "@/lib/agent/risk";
import { exposureFromSteps, gateStepForTrifecta } from "@/lib/agent/trifecta";
import { gateForRiskLevel, resolveApprovalOutcome } from "@/lib/agent/approval-policy";
import { performApprovedStep } from "@/lib/agent/execute";
import { lockPayload, payloadPreviewFields, verifyLockedPayload } from "@/lib/agent/payload-lock";
import { RISK_LABELS } from "@/lib/agent/types";
import type { AgentTask, AgentTaskStep } from "@/lib/agent/types";
import { logError } from "@/lib/logging/error-log";
import { enqueueAndKick } from "@/lib/jobs/enqueue";

type Supabase = ReturnType<typeof createServerSupabase>;

interface PlannedStep {
  summary: string;
  kind: "action" | "review";
}

const FALLBACK_PLAN: PlannedStep[] = [
  { summary: "Research and gather the relevant information", kind: "action" },
  { summary: "Draft the result based on the findings", kind: "action" },
  { summary: "Review the output for accuracy and completeness", kind: "review" },
];

/** Ask the LLM for a short ordered plan; fall back to a generic plan. */
async function plan(task: AgentTask): Promise<PlannedStep[]> {
  const modelId = resolveUsableChatModelId();
  if (!modelId) return FALLBACK_PLAN;
  try {
    const { text } = await generateText({
      model: getChatModel(modelId, "chat"),
      system:
        "You are a planning agent. Break the user's task into 2–5 concrete, ordered steps. " +
        "Respond with ONLY a JSON array of objects like " +
        '[{"summary":"...","kind":"action"}], where kind is "action" or "review". No prose.',
      prompt: `Task: ${task.title}\n${task.description ?? ""}`.trim(),
      temperature: resolveTemperature(modelId, 0.2),
    });
    const parsed = parsePlan(text);
    return parsed.length ? parsed.slice(0, 8) : FALLBACK_PLAN;
  } catch {
    return FALLBACK_PLAN;
  }
}

function parsePlan(text: string): PlannedStep[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s) => s && typeof s.summary === "string")
      .map((s) => ({ summary: String(s.summary).slice(0, 300), kind: s.kind === "review" ? "review" : "action" }));
  } catch {
    return [];
  }
}

/** Execute a safe step and return its textual output. */
async function executeSafeStep(task: AgentTask, step: AgentTaskStep): Promise<string> {
  const wantsResearch = /\b(research|find|search|look up|investigate|gather)\b/i.test(step.summary);
  if (wantsResearch) {
    const r = await runResearch(`${task.title}. ${step.summary}`);
    if (r.answer) return r.answer;
  }
  const modelId = resolveUsableChatModelId();
  if (!modelId) return "(No LLM configured — step recorded but not executed.)";
  const { text } = await generateText({
    model: getChatModel(modelId, "chat"),
    system: "You are an execution agent completing one step of a larger task. Be concise and concrete.",
    prompt: `Overall task: ${task.title}\n${task.description ?? ""}\n\nDo this step now: ${step.summary}`.trim(),
    temperature: resolveTemperature(modelId, 0.4),
  });
  return text;
}

export interface RunResult {
  status: AgentTask["status"];
  message: string;
}

/**
 * Wall-clock guard for a single run: complements `max_steps`. Especially
 * important in background mode, where no HTTP timeout bounds the work.
 */
const TASK_WALL_CLOCK_MS = 4 * 60_000;

/**
 * Start a task via the durable jobs table (then kick inline when JOBS_INLINE).
 * Prefer this over a bare void runTask() so work is visible and drainable.
 */
export function startTaskInBackground(taskId: string, ctx: SessionContext): void {
  void enqueueAndKick({
    kind: "agent_task",
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    refId: taskId,
    email: ctx.email,
    isAdmin: ctx.isAdmin,
    idempotencyKey: `agent_task:${taskId}:run`,
    wait: false,
  }).catch(async (err) => {
    await logError({ area: "tasks", error: err, workspaceId: ctx.workspaceId, userId: ctx.userId });
  });
}

/**
 * Run (or resume) a task. Returns the task's resulting status.
 * Uses the caller's RLS-scoped Supabase client, so it can only touch the
 * caller's own workspace rows.
 */
export async function runTask(taskId: string, ctx: SessionContext): Promise<RunResult> {
  const supabase = createServerSupabase();
  const startedAt = Date.now();

  const { data: task } = await supabase
    .from("agent_tasks")
    .select("*")
    .eq("id", taskId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle<AgentTask>();
  if (!task) return { status: "failed", message: "Task not found." };
  if (["completed", "cancelled"].includes(task.status)) {
    return { status: task.status, message: "Task already finished." };
  }

  await supabase.from("agent_tasks").update({ status: "running" }).eq("id", taskId);

  try {
    // 1. Plan if there are no steps yet.
    let { data: steps } = await supabase
      .from("agent_task_steps")
      .select("*")
      .eq("task_id", taskId)
      .order("idx", { ascending: true })
      .returns<AgentTaskStep[]>();

    if (!steps || steps.length === 0) {
      const planned = await plan(task);
      const rows = planned.map((p, i) => {
        const risk = classifyStepRisk(p.summary);
        return {
          task_id: taskId,
          workspace_id: ctx.workspaceId,
          idx: i,
          kind: risk.risky ? "approval" : p.kind,
          status: "pending",
          summary: p.summary,
          tool_name: risk.risky ? risk.actionType : null,
        };
      });
      const { data: inserted } = await supabase.from("agent_task_steps").insert(rows).select("*").returns<AgentTaskStep[]>();
      steps = inserted ?? [];
    }

    // 2. Walk pending steps in order.
    let executed = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
    let result = task.result ?? "";

    // Track which steps are done as we go, so lethal-trifecta exposure is
    // recomputed identically on fresh runs and resumes (pure over step rows).
    const stepDone = new Map(
      steps.map((s) => [s.id, s.status === "completed" || s.status === "skipped"] as const),
    );
    const exposureNow = () =>
      exposureFromSteps(
        steps!.map((s) => ({
          summary: s.summary,
          actionType: s.tool_name ?? undefined,
          done: stepDone.get(s.id) ?? false,
        })),
      );

    /** Persist step output + accumulated task result — the resume checkpoint. */
    const checkpointStep = async (stepId: string, status: "completed" | "skipped", output: string) => {
      await supabase.from("agent_task_steps").update({ status, output: output.slice(0, 20000) }).eq("id", stepId);
      await supabase.from("agent_tasks").update({ result }).eq("id", taskId);
      stepDone.set(stepId, true);
    };

    for (const step of steps) {
      if (step.status === "completed" || step.status === "skipped") continue;

      if (executed >= task.max_steps) {
        await finishTask(supabase, taskId, "failed", result, "Reached the step limit before finishing.");
        return { status: "failed", message: "Reached the step limit." };
      }
      if (Date.now() - startedAt > TASK_WALL_CLOCK_MS) {
        await finishTask(supabase, taskId, "failed", result, "The task took too long and was stopped. Run it again to resume from where it left off.");
        return { status: "failed", message: "Task timed out (progress saved)." };
      }

      const risk = classifyStepRisk(step.summary);
      // Lethal-trifecta gate: once the task has ingested untrusted content,
      // outward-facing steps are escalated to approval level >= 2 (sticky).
      const trifecta = gateStepForTrifecta({
        baseRisk: risk.riskLevel,
        actionType: risk.actionType,
        exposure: exposureNow(),
      });
      const effectiveRisk = trifecta.effectiveRisk;
      const risky = effectiveRisk >= 1;

      // Level 4 is BLOCKED by policy: never ask, never execute.
      if (gateForRiskLevel(effectiveRisk) === "blocked") {
        const outcome = resolveApprovalOutcome(effectiveRisk, null);
        const note = outcome.action === "blocked" ? outcome.note : "Blocked by policy.";
        result += `\n\n### ${step.summary}\n${note}`;
        await checkpointStep(step.id, "skipped", note);
        executed += 1;
        continue;
      }

      if (risky) {
        // Look for an existing decision on this step. Expired approvals are
        // ignored so a fresh one is created — a stale "pending" can never be
        // resurrected after its TTL.
        const { data: existing } = await supabase
          .from("approvals")
          .select("id, status")
          .eq("step_id", step.id)
          .neq("status", "expired")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existing) {
          const locked = lockPayload({
            version: 1,
            action_type: risk.actionType,
            risk_level: effectiveRisk,
            task_id: taskId,
            step_id: step.id,
            step_idx: step.idx,
            summary: step.summary,
            tool_name: risk.actionType,
          });
          await supabase.from("approvals").insert({
            workspace_id: ctx.workspaceId,
            user_id: ctx.userId,
            task_id: taskId,
            step_id: step.id,
            action_type: risk.actionType,
            risk_level: effectiveRisk,
            status: "pending",
            summary: step.summary,
            tool_name: risk.actionType,
            payload_canonical: locked.canonical,
            payload_hash: locked.hash,
            safe_metadata: {
              ...payloadPreviewFields(locked.payload),
              risk_label: RISK_LABELS[effectiveRisk],
              ...(trifecta.escalated ? { escalated_reason: trifecta.reason } : {}),
            },
          });
          await supabase.from("agent_task_steps").update({ status: "running" }).eq("id", step.id);
          await supabase.from("agent_tasks").update({ status: "waiting_for_approval", current_step: step.idx }).eq("id", taskId);
          return { status: "waiting_for_approval", message: "Waiting for your approval." };
        }
        // Load full approval (incl. payload lock) for execute path.
        const { data: approvalRow } = await supabase
          .from("approvals")
          .select("id, status, payload_canonical, payload_hash, action_type")
          .eq("id", existing.id)
          .maybeSingle();

        const outcome = resolveApprovalOutcome(
          effectiveRisk,
          (approvalRow?.status ?? existing.status) as Parameters<typeof resolveApprovalOutcome>[1],
        );

        if (outcome.action === "wait") {
          await supabase.from("agent_tasks").update({ status: "waiting_for_approval", current_step: step.idx }).eq("id", taskId);
          return { status: "waiting_for_approval", message: "Waiting for your approval." };
        }
        if (outcome.action === "cancel_task") {
          await checkpointStep(step.id, "skipped", outcome.note ?? "Rejected.");
          await finishTask(supabase, taskId, "cancelled", result, outcome.note);
          return { status: "cancelled", message: "Action was rejected." };
        }
        if (outcome.action === "skip" || outcome.action === "blocked") {
          result += `\n\n### ${step.summary}\n${outcome.note}`;
          await checkpointStep(step.id, "skipped", outcome.note);
          executed += 1;
          continue;
        }
        // outcome.action === "execute" — verify locked payload before any side effect.
        const verified = verifyLockedPayload(
          approvalRow?.payload_canonical,
          approvalRow?.payload_hash,
        );
        if (!verified.ok) {
          result += `\n\n### ${step.summary}\n⛔ ${verified.reason}`;
          await checkpointStep(step.id, "skipped", `⛔ ${verified.reason}`);
          await finishTask(supabase, taskId, "failed", result, verified.reason);
          return { status: "failed", message: verified.reason };
        }
        await supabase.from("agent_task_steps").update({ status: "running" }).eq("id", step.id);
        const performed = await performApprovedStep(
          task,
          step,
          verified.payload.action_type,
          result,
          ctx,
        );
        result += `\n\n### ${verified.payload.summary}\n${performed.note}`;
        await checkpointStep(step.id, "completed", performed.note);
        executed += 1;
        continue;
      }

      // Safe step — execute for real using LLM/research.
      await supabase.from("agent_task_steps").update({ status: "running" }).eq("id", step.id);
      const output = await executeSafeStep(task, step);
      result += `\n\n### ${step.summary}\n${output}`;
      await checkpointStep(step.id, "completed", output);
      executed += 1;
      await supabase
        .from("agent_tasks")
        .update({ current_step: step.idx + 1, cost_actual: (task.cost_actual ?? 0) + 0.01 })
        .eq("id", taskId);
    }

    await finishTask(supabase, taskId, "completed", result.trim(), null);
    return { status: "completed", message: "Task completed." };
  } catch (err) {
    await logError({ area: "tasks", error: err, workspaceId: ctx.workspaceId, userId: ctx.userId });
    await finishTask(supabase, taskId, "failed", null, "The task hit an unexpected error and was stopped.");
    return { status: "failed", message: "The task failed. The issue was logged." };
  }
}

async function finishTask(
  supabase: Supabase,
  taskId: string,
  status: "completed" | "failed" | "cancelled",
  result: string | null,
  errorMessage: string | null,
) {
  const patch: Record<string, unknown> = { status };
  if (result != null) patch.result = result;
  if (errorMessage != null) patch.error_message = errorMessage;
  if (status === "completed") patch.completed_at = new Date().toISOString();
  if (status === "failed") patch.failed_at = new Date().toISOString();
  await supabase.from("agent_tasks").update(patch).eq("id", taskId);
}
