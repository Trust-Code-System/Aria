import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { getConnectionStatus } from "@/lib/connectors/composio";
import { env } from "@/lib/env";
import { logError } from "@/lib/logging/error-log";

export const runtime = "nodejs";

/**
 * OAuth return URL. Composio redirects the user here after consent. We refresh
 * the connection status from Composio, persist it, and bounce back to the
 * Connections page with a result flag. Always redirects (never shows raw JSON).
 */
export async function GET(req: Request) {
  const provider = new URL(req.url).searchParams.get("provider") ?? "";
  const back = (status: string) =>
    NextResponse.redirect(`${env.appUrl}/connections?provider=${encodeURIComponent(provider)}&status=${status}`);

  try {
    const ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    const { data: conn } = await supabase
      .from("connections")
      .select("id, composio_connection_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("provider", provider)
      .maybeSingle();

    if (!conn?.composio_connection_id) return back("error");

    const { status, label } = await getConnectionStatus(conn.composio_connection_id);
    await supabase
      .from("connections")
      .update({ status, account_label: label ?? null, error_message: status === "error" ? "Authorization failed" : null })
      .eq("id", conn.id);

    return back(status === "active" ? "connected" : status);
  } catch (error) {
    await logError({ area: "tools", error, provider: "composio" });
    return back("error");
  }
}
