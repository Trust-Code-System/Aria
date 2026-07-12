import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { getConnectionStatus } from "@/lib/connectors/composio";
import { env } from "@/lib/env";
import { logError } from "@/lib/logging/error-log";
import { persistableConnectionStatus, statusDetailForStorage } from "@/lib/connectors/status";
import { sanitizeForLog } from "@/lib/security/sanitize";
import {
  probeProviderCapabilities,
  refineStatusAfterProbe,
  scopesPayloadForPersist,
} from "@/lib/connectors/capabilities";

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

    const remote = await getConnectionStatus(accountId);
    let status = remote.status;
    let scopesUpdate: Record<string, unknown> | null = null;
    if (status === "connected") {
      try {
        const caps = await probeProviderCapabilities({
          supabaseUserId: ctx.userId,
          provider: provider || "gmail",
        });
        status = refineStatusAfterProbe(status, provider || "gmail", caps);
        if (caps) scopesUpdate = scopesPayloadForPersist(null, caps) as Record<string, unknown>;
      } catch (probeErr) {
        await logError({ area: "tools", error: probeErr, provider: "composio" });
      }
    }

    if (conn) {
      const detail = statusDetailForStorage(status);
      const patch: Record<string, unknown> = {
        status: persistableConnectionStatus(status),
        account_label: remote.label ?? null,
        error_message: detail
          ? sanitizeForLog(`${detail}: authorization incomplete`)
          : null,
      };
      if (scopesUpdate) patch.scopes = scopesUpdate;
      await supabase.from("connections").update(patch).eq("id", conn.id);
    }

    return back(status === "connected" || oauthStatus === "success" ? "connected" : "error");
  } catch (error) {
    await logError({ area: "tools", error, provider: "composio" });
    return back("error");
  }
}
