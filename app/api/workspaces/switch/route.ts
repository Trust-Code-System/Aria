import { z } from "zod";
import { cookies } from "next/headers";

import { requireSessionApi } from "@/lib/auth/guards";
import { WORKSPACE_COOKIE } from "@/lib/auth/workspace-cookie";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const switchSchema = z.object({ workspaceId: z.string().uuid() });

/**
 * POST /api/workspaces/switch — set the active workspace cookie.
 * Membership is verified here AND re-verified on every request in
 * getSessionContext, so a forged cookie can never reach another tenant.
 */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { workspaceId } = switchSchema.parse(await req.json());

    const supabase = createServerSupabase();
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!membership) {
      throw new AppError({
        area: "auth",
        category: "auth",
        statusCode: 403,
        userMessage: "You are not a member of that workspace.",
      });
    }

    cookies().set(WORKSPACE_COOKIE, workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });

    await logAudit({
      action: "workspace.switch",
      workspaceId,
      userId: ctx.userId,
      targetType: "workspace",
      targetId: workspaceId,
    });
    return apiOk({ ok: true, workspaceId });
  } catch (error) {
    return apiError(error, { area: "auth", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
