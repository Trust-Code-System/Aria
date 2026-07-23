import { z } from "zod";
import { generateText } from "ai";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getChatModel, resolveUsableChatModelId, resolveTemperature } from "@/lib/ai/providers";
import {
  pipelineSystem,
  pipelinePrompt,
  LOOP_MAKER_SYSTEM,
  LOOP_CHECKER_SYSTEM,
  makerPrompt,
  checkerPrompt,
  parseVerdict,
  type AgentStepDef,
} from "@/lib/ai/agents";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ runId: z.string().uuid() });

/**
 * Advance an agent run by exactly one step (one pipeline agent, or one loop
 * iteration = maker + checker). Returns the updated run and whether it's done.
 * The client calls this repeatedly so the UI can show live progress.
 */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { runId } = schema.parse(await req.json());
    const supabase = createServerSupabase();

    const { data: run } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("id", runId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!run) throw new AppError({ area: "tools", category: "not_found", userMessage: "Run not found." });
    if (run.status !== "running") return apiOk({ run, done: true });

    const modelId = resolveUsableChatModelId()!;
    const model = getChatModel(modelId, "tools");
    const steps: any[] = Array.isArray(run.steps) ? run.steps : [];

    if (run.kind === "pipeline") {
      const defs: AgentStepDef[] = run.config.steps;
      const idx = steps.length;
      const def = defs[idx];
      const prior = idx > 0 ? steps[idx - 1] : null;

      const { text } = await generateText({
        model,
        system: pipelineSystem(def),
        prompt: pipelinePrompt(run.input, prior?.name ?? null, prior?.output ?? null),
        temperature: resolveTemperature(modelId, 0.5),
      });

      steps.push({ name: def.name, key: def.key, outputLabel: def.outputLabel, output: text });
      const done = steps.length >= defs.length;
      await finalize(supabase, run, steps, done, done ? text : null, ctx);
      return apiOk({ run: { ...run, steps }, done, stepName: def.name });
    }

    // --- loop iteration: maker then checker ---
    const criteria: string[] = run.config.criteria;
    const maxIterations: number = run.config.maxIterations;
    const iteration = steps.length;
    const priorDraft = iteration > 0 ? steps[iteration - 1].output : null;
    const weakest = iteration > 0 ? steps[iteration - 1].weakest : null;

    const maker = await generateText({
      model,
      system: LOOP_MAKER_SYSTEM,
      prompt: makerPrompt(run.input, criteria, priorDraft, weakest),
      temperature: resolveTemperature(modelId, 0.5),
    });

    const checker = await generateText({
      model,
      system: LOOP_CHECKER_SYSTEM,
      prompt: checkerPrompt(run.input, criteria, maker.text),
      temperature: resolveTemperature(modelId, 0.1),
    });
    const verdict = parseVerdict(checker.text, criteria);

    steps.push({
      iteration: iteration + 1,
      output: maker.text,
      scores: verdict.scores,
      weakest: verdict.weakest,
      pass: verdict.pass,
    });

    const reachedCap = steps.length >= maxIterations;
    const done = verdict.pass || reachedCap;
    await finalize(supabase, run, steps, done, done ? maker.text : null, ctx);

    return apiOk({
      run: { ...run, steps },
      done,
      pass: verdict.pass,
      stepName: `Iteration ${iteration + 1}`,
    });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

/** Persist progress; on completion, also save a report for the final output. */
async function finalize(
  supabase: ReturnType<typeof createServerSupabase>,
  run: any,
  steps: any[],
  done: boolean,
  finalOutput: string | null,
  ctx: { workspaceId: string; userId: string },
) {
  let reportId: string | null = run.report_id ?? null;

  if (done && finalOutput && !reportId) {
    const { data: report } = await supabase
      .from("reports")
      .insert({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        project_id: run.project_id,
        kind: run.kind === "pipeline" ? "project_summary" : "proposal",
        title: run.title,
        content_md: finalOutput,
        citations: [],
      })
      .select("id")
      .single();
    reportId = report?.id ?? null;
  }

  await supabase
    .from("agent_runs")
    .update({
      steps,
      iterations: steps.length,
      status: done ? "completed" : "running",
      final_output: finalOutput ?? run.final_output ?? null,
      report_id: reportId,
    })
    .eq("id", run.id);
}
