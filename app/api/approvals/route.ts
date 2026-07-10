import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiOk, apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cookies (auth) — never prerender

/**
 * Pending approvals older than this are lazily marked `expired` whenever the
 * inbox is read. An expired approval never executes (approval-policy fails
 * safe) and the runtime re-asks with a fresh approval on the next task run —
 * so a stale "yes" can't be redeemed days later when context has changed.
 */
const APPROVAL_TTL_HOURS = 72;

/** GET /api/approvals?status=pending — the approval inbox for the workspace. */
export async function GET(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const status = new URL(req.url).searchParams.get("status");

    const supabase = createServerSupabase();

    // Lazy expiry — no cron required; RLS scopes it to this workspace.
    const cutoff = new Date(Date.now() - APPROVAL_TTL_HOURS * 3600_000).toISOString();
    await supabase
      .from("approvals")
      .update({ status: "expired" })
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "pending")
      .lt("created_at", cutoff);
    let query = supabase
      .from("approvals")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      throw new AppError({ area: "approvals", category: "internal", userMessage: "Could not load approvals.", internal: error });
    }
    return apiOk({ approvals: data ?? [] });
  } catch (error) {
    return apiError(error, { area: "approvals", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
