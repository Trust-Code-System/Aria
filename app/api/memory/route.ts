import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

const createSchema = z.object({
  content: z.string().min(2).max(2000),
  type: z.enum(["preference", "project_fact", "writing_style", "tool_preference", "workflow"]),
  projectId: z.string().uuid().nullable().optional(),
  sensitivity: z.enum(["low", "medium", "high"]).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(2).max(2000).optional(),
  approval_status: z.enum(["approved", "suggested", "disabled"]).optional(),
  type: z.enum(["preference", "project_fact", "writing_style", "tool_preference", "workflow"]).optional(),
});

// Never store obvious secrets as memory.
const SECRETY = /(password|api[_-]?key|secret|token|ssn|credit\s?card|cvv)/i;

export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const body = createSchema.parse(await req.json());
    if (SECRETY.test(body.content)) {
      throw new AppError({
        area: "memory",
        category: "validation",
        userMessage:
          "That looks like it may contain a secret or credential. For your safety, Aria won’t store passwords, keys, or sensitive data as memory.",
      });
    }
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("memories")
      .insert({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        project_id: body.projectId ?? null,
        type: body.type,
        content: body.content,
        source: "manual",
        sensitivity: body.sensitivity ?? "low",
        approval_status: "approved",
      })
      .select("id")
      .single();
    if (error) throw new AppError({ area: "memory", category: "internal", userMessage: "Could not save memory.", internal: error });
    return apiOk({ id: data.id });
  } catch (error) {
    return apiError(error, { area: "memory", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

export async function PATCH(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const body = updateSchema.parse(await req.json());
    const { id, ...fields } = body;
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("memories")
      .update(fields)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) throw new AppError({ area: "memory", category: "internal", userMessage: "Could not update memory.", internal: error });
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "memory", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

export async function DELETE(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new AppError({ area: "memory", category: "validation", userMessage: "Missing memory id." });
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) throw new AppError({ area: "memory", category: "internal", userMessage: "Could not delete memory.", internal: error });
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "memory", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
