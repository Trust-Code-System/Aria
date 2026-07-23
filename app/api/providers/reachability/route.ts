import { requireAdminApi } from "@/lib/auth/guards";
import { probeAllProviders } from "@/lib/ai/reachability";
import { apiOk, apiError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand provider reachability. Admin-only because it issues real (minimal)
 * provider calls. Returns per-provider state: reachable / rate-limited (over
 * quota) / auth-failed / unreachable / not-configured. This is the closest
 * feasible signal to "why did my action turn fail" — not credits remaining,
 * which providers do not expose.
 */
export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireAdminApi>> | null = null;
  try {
    ctx = await requireAdminApi();
    return apiOk({ providers: await probeAllProviders(), checkedAt: new Date().toISOString() });
  } catch (error) {
    return apiError(error, { area: "admin", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
