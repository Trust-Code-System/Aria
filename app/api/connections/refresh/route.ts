import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getConnectionStatus } from "@/lib/connectors/composio";
import { sanitizeForLog } from "@/lib/security/sanitize";
import {
  persistableConnectionStatus,
  statusDetailForStorage,
  type ConnectionStatus,
} from "@/lib/connectors/status";
import {
  probeProviderCapabilities,
  refineStatusAfterProbe,
  scopesPayloadForPersist,
} from "@/lib/connectors/capabilities";
import { logError } from "@/lib/logging/error-log";

export const runtime = "nodejs";

const schema = z.object({ provider: z.string().min(2) });

/** Poll Composio for the latest status of a connection and persist it. */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { provider } = schema.parse(await req.json());
    const supabase = createServerSupabase();

    const { data: conn } = await supabase
      .from("connections")
      .select("id, composio_connection_id, scopes, composio_entity_id, capabilities")
      .eq("workspace_id", ctx.workspaceId)
      .eq("provider", provider)
      .maybeSingle();

    if (!conn?.composio_connection_id) {
      throw new AppError({
        area: "tools",
        category: "not_found",
        userMessage: "No connection found to refresh.",
      });
    }

    let canonical: ConnectionStatus;
    let label: string | undefined;

    try {
      const remote = await getConnectionStatus(conn.composio_connection_id);
      canonical = remote.status;
      label = remote.label;
    } catch {
      canonical = "provider_unavailable";
    }

    let capabilities = null;
    if (canonical === "connected") {
      try {
        capabilities = await probeProviderCapabilities({
          supabaseUserId: ctx.userId,
          provider,
        });
        canonical = refineStatusAfterProbe(canonical, provider, capabilities);
      } catch (probeErr) {
        await logError({
          area: "tools",
          error: probeErr,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          provider: "composio",
        });
        capabilities = null;
      }
    }

    const status = persistableConnectionStatus(canonical);
    const detail = statusDetailForStorage(canonical);
    const update: Record<string, unknown> = {
      status,
      account_label: label ?? null,
      error_message: detail ? sanitizeForLog(`${detail}: connector validation`) : null,
    };
    if (capabilities) {
      update.scopes = scopesPayloadForPersist(conn.scopes, capabilities);
      update.last_validated_at = capabilities.probed_at;
      update.capabilities = {
        read: capabilities.read,
        draft: capabilities.draft,
        send: capabilities.send,
        write: capabilities.write,
      };
    }

    const { data: updated, error: updErr } = await supabase
      .from("connections")
      .update(update)
      .eq("id", conn.id)
      .select("id, provider, status, account_label, updated_at, scopes, capabilities, last_validated_at")
      .single();

    if (updErr) {
      throw new AppError({
        area: "tools",
        category: "internal",
        userMessage: "Could not update connection status.",
        internal: updErr,
      });
    }

    const capsOut = capabilities
      ? {
          read: capabilities.read,
          draft: capabilities.draft,
          send: capabilities.send,
          write: capabilities.write,
          tool_count: capabilities.tool_count,
        }
      : null;

    return apiOk({
      status: canonical === "connected" || canonical === "active" ? "connected" : canonical,
      connection: updated
        ? {
            ...updated,
            capabilities: capsOut
              ? {
                  read: capsOut.read,
                  draft: capsOut.draft,
                  send: capsOut.send,
                  write: capsOut.write,
                }
              : updated.capabilities ?? null,
          }
        : null,
      capabilities: capsOut,
    });
  } catch (error) {
    return apiError(error, {
      area: "tools",
      workspaceId: ctx?.workspaceId,
      userId: ctx?.userId,
      provider: "composio",
    });
  }
}
