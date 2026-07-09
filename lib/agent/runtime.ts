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
import { getChatModel, resolveUsableChatModelId } from "@/lib/ai/providers";
import { runResearch } from "@/lib/ai/research";
import { classifyStepRisk } from "@/lib/agent/risk";
import { gateForRiskLevel, resolveApprovalOutcome } from "@/lib/agent/approval-policy";
import { performApprovedStep } from "@/lib/agent/execute";
import { RISK_LABELS } from "@/lib/agent/types";
import type { AgentTask, AgentTaskStep } from "@/lib/agent/types";
import { logError } from "@/lib/logging/error-log";

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
      temperature: 0.2,
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
    temperature: 0.4,
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
 * Start a task in the background (fire-and-forget) and return immediately.
 * The UI polls the task for live status. Failures are logged, never thrown.
 *
 * Note: relies on a long-lived Node server (`next dev`/`next start`). On
 * scale-to-zero serverless the work could be cut off — move to a real queue
 * before deploying there.
 */
export function startTaskInBackground(taskId: string, ctx: SessionContext): void {
  void runTask(taskId, ctx).catch(async (err) => {
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

      // Level 4 is BLOCKED by policy: never ask, never execute.
      if (gateForRiskLevel(risk.riskLevel) === "blocked") {
        const outcome = resolveApprovalOutcome(risk.riskLevel, null);
        const note = outcome.action === "blocked" ? outcome.note : "Blocked by policy.";
        result += `\n\n### ${step.summary}\n${note}`;
        await supabase.from("agent_task_steps").update({ status: "skipped" }).eq("id", step.id);
        executed += 1;
        continue;
      }

      if (risk.risky) {
        // Look for an existing decision on this step.
        const { data: existing } = await supabase
          .from("approvals")
          .select("id, status")
          .eq("step_id", step.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existing) {
          await supabase.from("approvals").insert({
            workspace_id: ctx.workspaceId,
            user_id: ctx.userId,
            task_id: taskId,
            step_id: step.id,
            action_type: risk.actionType,
            risk_level: risk.riskLevel,
            status: "pending",
            summary: step.summary,
            tool_name: risk.actionType,
            safe_metadata: { step: step.idx, risk: RISK_LABELS[risk.riskLevel] },
          });
          await supabase.from("agent_task_steps").update({ status: "running" }).eq("id", step.id);
          await supabase.from("agent_tasks").update({ status: "waiting_for_approval", current_step: step.idx }).eq("id", taskId);
          return { status: "waiting_for_approval", message: "Waiting for your approval." };
        }
        const outcome = resolveApprovalOutcome(
          risk.riskLevel,
          existing.status as Parameters<typeof resolveApprovalOutcome>[1],
        );

        if (outcome.action === "wait") {
          await supabase.from("agent_tasks").update({ status: "waiting_for_approval", current_step: step.idx }).eq("id", taskId);
          return { status: "waiting_for_approval", message: "Waiting for your approval." };
        }
        if (outcome.action === "cancel_task") {
          await supabase.from("agent_task_steps").update({ status: "skipped" }).eq("id", step.id);
          await finishTask(supabase, taskId, "cancelled", result, outcome.note);
          return { status: "cancelled", message: "Action was rejected." };
        }
        if (outcome.action === "skip" || outcome.action === "blocked") {
          result += `\n\n### ${step.summary}\n${outcome.note}`;
          await supabase.from("agent_task_steps").update({ status: "skipped" }).eq("id", step.id);
          executed += 1;
          continue;
        }
        // outcome.action === "execute" — the ONLY path that performs the action.
        // Email actions create a real Gmail DRAFT when Gmail is connected (never
        // an auto-send); everything else records an honest simulation note.
        await supabase.from("agent_task_steps").update({ status: "running" }).eq("id", step.id);
        const performed = await performApprovedStep(task, step, risk.actionType, result, ctx);
        result += `\n\n### ${step.summary}\n${performed.note}`;
        await supabase.from("agent_task_steps").update({ status: "completed" }).eq("id", step.id);
        executed += 1;
        continue;
      }

      // Safe step — execute for real using LLM/research.
      await supabase.from("agent_task_steps").update({ status: "running" }).eq("id", step.id);
      const output = await executeSafeStep(task, step);
      result += `\n\n### ${step.summary}\n${output}`;
      await supabase
        .from("agent_task_steps")
        .update({ status: "completed" })
        .eq("id", step.id);
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
