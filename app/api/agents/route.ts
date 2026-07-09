import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError, configMissing } from "@/lib/errors";
import { resolveUsableChatModelId } from "@/lib/ai/providers";
import { getTeam } from "@/lib/ai/agents";
import { truncate } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Create an agent run (pipeline or loop). Returns the run record; the client
 * then drives it one step at a time via /api/agents/step for live progress.
 */
const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pipeline"),
    teamKey: z.string(),
    topic: z.string().min(2).max(8000),
    projectId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    kind: z.literal("loop"),
    goal: z.string().min(2).max(8000),
    criteria: z.array(z.string().min(1).max(400)).min(1).max(8),
    maxIterations: z.number().int().min(1).max(8),
    projectId: z.string().uuid().nullable().optional(),
  }),
]);

export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    if (!resolveUsableChatModelId()) throw configMissing("chat", "An LLM provider");
    const body = schema.parse(await req.json());
    const supabase = createServerSupabase();

    let title: string;
    let config: Record<string, unknown>;
    let input: string;

    if (body.kind === "pipeline") {
      const team = getTeam(body.teamKey);
      if (!team)
        throw new AppError({ area: "tools", category: "validation", userMessage: "Unknown agent team." });
      title = `${team.name}: ${truncate(body.topic, 50)}`;
      input = body.topic;
      config = { teamKey: team.key, steps: team.steps };
    } else {
      title = `Loop: ${truncate(body.goal, 50)}`;
      input = body.goal;
      config = { criteria: body.criteria, maxIterations: body.maxIterations };
    }

    const { data, error } = await supabase
      .from("agent_runs")
      .insert({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        project_id: body.projectId ?? null,
        kind: body.kind,
        title,
        input,
        config,
        steps: [],
        status: "running",
      })
      .select("*")
      .single();
    if (error) throw new AppError({ area: "tools", category: "internal", userMessage: "Could not start the run.", internal: error });

    return apiOk({ run: data });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
