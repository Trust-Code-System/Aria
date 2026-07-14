import { requireAdminApi } from "@/lib/auth/guards";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getSystemHealth } from "@/lib/admin/system-health";
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
