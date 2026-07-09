import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { getChatModel, resolveUsableChatModelId } from "@/lib/ai/providers";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { generateText } from "ai";
import { apiError, apiOk } from "@/lib/api";
import { AppError, configMissing } from "@/lib/errors";
import type { Citation } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const schema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(["research", "project_summary", "proposal", "kb_summary"]),
  projectId: z.string().uuid().nullable().optional(),
  // Either provide finished content to save, or a prompt to generate from.
  contentMd: z.string().optional(),
  generateFrom: z.string().max(8000).optional(),
  citations: z.array(z.any()).optional(),
});

/** Create a report — either save provided content, or generate it with the LLM. */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const body = schema.parse(await req.json());
    const supabase = createServerSupabase();

    let contentMd = body.contentMd ?? "";
    let citations: Citation[] = (body.citations as Citation[]) ?? [];

    if (!contentMd && body.generateFrom) {
      const modelId = resolveUsableChatModelId();
      if (!modelId) throw configMissing("reports", "An LLM provider");
      const system = buildSystemPrompt({ mode: "report" });
      const { text } = await generateText({
        model: getChatModel(modelId, "reports"),
        system,
        prompt: `Create a "${body.kind.replace("_", " ")}" titled "${body.title}" from the following material:\n\n${body.generateFrom}`,
        temperature: 0.4,
      });
      contentMd = text;
    }

    if (!contentMd) {
      throw new AppError({
        area: "reports",
        category: "validation",
        userMessage: "Provide report content or material to generate from.",
      });
    }

    const { data, error } = await supabase
      .from("reports")
      .insert({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        project_id: body.projectId ?? null,
        kind: body.kind,
        title: body.title,
        content_md: contentMd,
        citations,
      })
      .select("id")
      .single();
    if (error) throw new AppError({ area: "reports", category: "internal", userMessage: "Could not save the report.", internal: error });

    return apiOk({ id: data.id, contentMd });
  } catch (error) {
    return apiError(error, { area: "reports", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

export async function DELETE(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      throw new AppError({
        area: "reports",
        category: "validation",
        userMessage: "Missing report id.",
      });
    }

    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("reports")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) {
      throw new AppError({
        area: "reports",
        category: "internal",
        userMessage: "Could not delete the report.",
        internal: error,
      });
    }

    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "reports", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
