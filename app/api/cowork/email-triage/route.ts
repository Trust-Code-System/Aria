import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { fetchRecentEmails, triageEmails } from "@/lib/connectors/gmail";
import { configured } from "@/lib/env";
import { isUsableConnectionStatus } from "@/lib/connectors/status";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Read the inbox and return a prioritized, summarized triage. Read-only. */
export async function POST() {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();

    if (!configured.connectors) {
      throw new AppError({
        area: "tools",
        category: "config_missing",
        userMessage: "Connectors are not configured. Add COMPOSIO_API_KEY.",
      });
    }

    const supabase = createServerSupabase();
    const { data: conn } = await supabase
      .from("connections")
      .select("status, composio_entity_id, composio_connection_id, user_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("provider", "gmail")
      .maybeSingle();

    if (!conn || !isUsableConnectionStatus(conn.status)) {
      throw new AppError({
        area: "tools",
        category: "validation",
        userMessage: "Connect your Gmail account first (Connections page).",
      });
    }

    const entityId = conn.composio_entity_id || conn.user_id || ctx.userId;
    const emails = await fetchRecentEmails(entityId, 8, conn.composio_connection_id ?? undefined);
    const triaged = await triageEmails(emails);
    return apiOk({ emails: triaged });
  } catch (error) {
    return apiError(error, {
      area: "tools",
      workspaceId: ctx?.workspaceId,
      userId: ctx?.userId,
      provider: "composio",
    });
  }
}
