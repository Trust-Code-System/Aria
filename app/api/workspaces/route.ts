import { z } from "zod";

import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workspaces — every workspace the user belongs to, with role. */
export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, workspaces(id, name, created_at)")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: true });
    if (error) {
      throw new AppError({ area: "auth", category: "internal", userMessage: "Could not load workspaces.", internal: error });
    }
    const workspaces = (data ?? [])
      .map((m: any) => ({
        id: m.workspaces?.id as string,
        name: m.workspaces?.name as string,
        role: m.role as string,
        active: m.workspaces?.id === ctx!.workspaceId,
      }))
      .filter((w) => w.id);
    return apiOk({ workspaces });
  } catch (error) {
    return apiError(error, { area: "auth", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

const createSchema = z.object({ name: z.string().trim().min(2).max(60) });

/**
 * POST /api/workspaces — create a new (business) workspace owned by the user.
 * Data isolation is automatic: every private table is RLS-scoped by
 * workspace_id, so nothing from other workspaces is ever retrievable here.
 */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { name } = createSchema.parse(await req.json());
    const supabase = createServerSupabase();

    const { data: ws, error } = await supabase
      .from("workspaces")
      .insert({ name, owner_id: ctx.userId })
      .select("id, name")
      .single();
    if (error || !ws) {
      throw new AppError({ area: "auth", category: "internal", userMessage: "Could not create the workspace.", internal: error });
    }
    await supabase
      .from("workspace_members")
      .insert({ workspace_id: ws.id, user_id: ctx.userId, role: "owner" });

    await logAudit({
      action: "workspace.create",
      workspaceId: ws.id,
      userId: ctx.userId,
      targetType: "workspace",
      targetId: ws.id,
    });
    return apiOk({ workspace: ws });
  } catch (error) {
    return apiError(error, { area: "auth", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
