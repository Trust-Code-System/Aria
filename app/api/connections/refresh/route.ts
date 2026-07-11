import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getConnectionStatus } from "@/lib/connectors/composio";

export const runtime = "nodejs";

const schema = z.object({ provider: z.string().min(2) });

/** Poll Composio for the latest status of a pending connection and persist it. */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { provider } = schema.parse(await req.json());
    const supabase = createServerSupabase();

    const { data: conn } = await supabase
      .from("connections")
      .select("id, composio_connection_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("provider", provider)
      .maybeSingle();
    if (!conn?.composio_connection_id) {
      throw new AppError({ area: "tools", category: "not_found", userMessage: "No pending connection." });
    }

    const { status, label } = await getConnectionStatus(conn.composio_connection_id);
    const { data: updated } = await supabase
      .from("connections")
      .update({ status, account_label: label ?? null })
      .eq("id", conn.id)
      .select("id, provider, status, account_label, updated_at")
      .single();

    return apiOk({ status, connection: updated ?? null });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId, provider: "composio" });
  }
}
