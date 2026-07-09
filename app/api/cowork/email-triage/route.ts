import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { fetchRecentEmails, triageEmails } from "@/lib/connectors/gmail";

export const runtime = "nodejs";
export const maxDuration = 90;

/** Read the inbox and return a prioritized, summarized triage. Read-only. */
export async function POST() {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    const { data: conn } = await supabase
      .from("connections")
      .select("status, composio_entity_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("provider", "gmail")
      .maybeSingle();

    if (!conn || conn.status !== "active") {
      throw new AppError({
        area: "tools",
        category: "validation",
        userMessage: "Connect your Gmail account first (Connections page).",
      });
    }

    const emails = await fetchRecentEmails(conn.composio_entity_id ?? ctx.userId);
    const triaged = await triageEmails(emails);
    return apiOk({ emails: triaged });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId, provider: "composio" });
  }
}
