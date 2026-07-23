import { requireAdminApi } from "@/lib/auth/guards";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getSystemHealth } from "@/lib/admin/system-health";
import { recoverStuckTurns } from "@/lib/chat/stuck-turns";
import { apiError, apiOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireAdminApi>> | null = null;
  try {
    ctx = await requireAdminApi();
    return apiOk(await getSystemHealth(createAdminSupabase()));
  } catch (error) {
    return apiError(error, { area: "admin", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

/** Recover stuck turns: move abandoned pending/streaming turns to a terminal
 * failed state so they can be retried and never animate forever. */
export async function POST() {
  let ctx: Awaited<ReturnType<typeof requireAdminApi>> | null = null;
  try {
    ctx = await requireAdminApi();
    const result = await recoverStuckTurns(createAdminSupabase());
    return apiOk(result);
  } catch (error) {
    return apiError(error, { area: "admin", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
