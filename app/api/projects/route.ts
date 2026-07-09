import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  instructions: z.string().max(4000).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  instructions: z.string().max(4000).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const body = createSchema.parse(await req.json());
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        name: body.name,
        description: body.description ?? null,
        instructions: body.instructions ?? null,
      })
      .select("id")
      .single();
    if (error) throw new AppError({ area: "system", category: "internal", userMessage: "Could not create the project.", internal: error });
    return apiOk({ id: data.id });
  } catch (error) {
    return apiError(error, { area: "system", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

export async function PATCH(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { id, ...fields } = updateSchema.parse(await req.json());
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("projects")
      .update(fields)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) throw new AppError({ area: "system", category: "internal", userMessage: "Could not update the project.", internal: error });
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "system", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

export async function DELETE(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError({ area: "system", category: "validation", userMessage: "Missing project id." });
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) throw new AppError({ area: "system", category: "internal", userMessage: "Could not delete the project.", internal: error });
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "system", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
