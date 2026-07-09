import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiOk, apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cookies (auth) — never prerender

/** GET /api/approvals?status=pending — the approval inbox for the workspace. */
export async function GET(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const status = new URL(req.url).searchParams.get("status");

    const supabase = createServerSupabase();
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
