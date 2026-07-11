import { z } from "zod";

import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const purgeSchema = z.object({
  /** The user must type DELETE in the UI — a destructive action is never one click. */
  confirmation: z.literal("DELETE"),
  /** Optional narrowing: only purge memories with this approval status. */
  status: z.enum(["suggested", "approved", "disabled", "all"]).default("all"),
});

/** POST /api/memory/purge — bulk-delete memories in the active workspace. */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { confirmation, status } = purgeSchema.parse(await req.json().catch(() => ({})));
    if (confirmation !== "DELETE") {
      throw new AppError({ area: "memory", category: "validation", userMessage: "Confirmation missing." });
    }

    const supabase = createServerSupabase();
    let query = supabase.from("memories").delete({ count: "exact" }).eq("workspace_id", ctx.workspaceId);
    if (status !== "all") query = query.eq("approval_status", status);
    const { error, count } = await query;
    if (error) {
      throw new AppError({ area: "memory", category: "internal", userMessage: "Could not delete memories.", internal: error });
    }

    await logAudit({
      action: "memory.purge",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "memory",
      targetId: status,
    });
    return apiOk({ ok: true, deleted: count ?? 0 });
  } catch (error) {
    return apiError(error, { area: "memory", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
