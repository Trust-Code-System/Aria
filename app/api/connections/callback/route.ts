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
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "";
  // Composio appends status=success|failed; we also emit connected|error ourselves.
  const oauthStatus = url.searchParams.get("status");
  const connectedAccountId = url.searchParams.get("connected_account_id");
  const back = (status: string) =>
    NextResponse.redirect(`${env.appUrl}/connections?provider=${encodeURIComponent(provider)}&status=${status}`);

  if (oauthStatus === "failed") return back("error");

  try {
    const ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    let query = supabase
      .from("connections")
      .select("id, composio_connection_id")
      .eq("workspace_id", ctx.workspaceId);
    if (provider) query = query.eq("provider", provider);
    const { data: conn } = await query.maybeSingle();

    const accountId = conn?.composio_connection_id || connectedAccountId;
    if (!accountId) return back("error");

    // Persist Composio's connected_account_id if we only had a pending placeholder.
    if (conn && connectedAccountId && conn.composio_connection_id !== connectedAccountId) {
      await supabase
        .from("connections")
        .update({ composio_connection_id: connectedAccountId })
        .eq("id", conn.id);
    }

    const { status, label } = await getConnectionStatus(accountId);
    if (conn) {
      await supabase
        .from("connections")
        .update({
          status,
          account_label: label ?? null,
          error_message: status === "error" ? "Authorization failed" : null,
        })
        .eq("id", conn.id);
    }

    return back(status === "active" || oauthStatus === "success" ? "connected" : status);
  } catch (error) {
    await logError({ area: "tools", error, provider: "composio" });
    return back("error");
  }
}
