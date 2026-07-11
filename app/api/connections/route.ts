import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import {
  initiateConnection,
  deleteConnection,
  authConfigIdFor,
} from "@/lib/connectors/composio";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    const { data } = await supabase
      .from("connections")
      .select("id, provider, status, account_label, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false });
    return apiOk({ connections: data ?? [] });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

const initiateSchema = z.object({ provider: z.string().min(2) });

/** Start an OAuth connection; returns a redirect URL to send the user to. */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { provider } = initiateSchema.parse(await req.json());

    const authConfigId = authConfigIdFor(provider);
    if (!authConfigId) {
      throw new AppError({
        area: "tools",
        category: "config_missing",
        userMessage: `${provider} is not set up yet. Add its Composio auth-config id to the environment.`,
      });
    }

    const callbackUrl = `${env.appUrl}/api/connections/callback?provider=${encodeURIComponent(provider)}`;
    const { redirectUrl, connectedAccountId } = await initiateConnection({
      entityId: ctx.userId,
      authConfigId,
      callbackUrl,
    });

    const supabase = createServerSupabase();
    const { error: upsertError } = await supabase
      .from("connections")
      .upsert(
        {
          workspace_id: ctx.workspaceId,
          user_id: ctx.userId,
          provider,
          composio_connection_id: connectedAccountId,
          composio_entity_id: ctx.userId,
          status: "pending",
        },
        { onConflict: "workspace_id,provider" },
      );
    if (upsertError) {
      throw new AppError({
        area: "tools",
        category: "internal",
        userMessage: "Could not save the connection. Please try again.",
        internal: upsertError,
      });
    }

    await logAudit({
      action: "connection.initiate",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "connection",
      targetId: provider,
    });

    return apiOk({ redirectUrl });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId, provider: "composio" });
  }
}

export async function DELETE(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const provider = url.searchParams.get("provider");
    if (!id && !provider) {
      throw new AppError({ area: "tools", category: "validation", userMessage: "Missing connection id." });
    }
    const supabase = createServerSupabase();
    let query = supabase
      .from("connections")
      .select("id, composio_connection_id, provider")
      .eq("workspace_id", ctx.workspaceId);
    if (id) query = query.eq("id", id);
    else if (provider) query = query.eq("provider", provider);
    const { data: conn } = await query.maybeSingle();
    if (!conn) throw new AppError({ area: "tools", category: "not_found", userMessage: "Connection not found." });

    if (conn.composio_connection_id) {
      try {
        await deleteConnection(conn.composio_connection_id);
      } catch {
        /* best-effort; still remove our record */
      }
    }
    const { error: deleteError } = await supabase
      .from("connections")
      .delete()
      .eq("id", conn.id)
      .eq("workspace_id", ctx.workspaceId);
    if (deleteError) {
      throw new AppError({
        area: "tools",
        category: "internal",
        userMessage: "Could not disconnect. Please try again.",
        internal: deleteError,
      });
    }
    await logAudit({
      action: "connection.disconnect",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "connection",
      targetId: conn.id,
    });
    return apiOk({ ok: true, id: conn.id, provider: conn.provider });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
