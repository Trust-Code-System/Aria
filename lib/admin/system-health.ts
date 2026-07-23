import type { SupabaseClient } from "@supabase/supabase-js";
import { configured, env } from "@/lib/env";
import { authConfigIdFor } from "@/lib/connectors/composio";
import { stuckTurnCutoffIso } from "@/lib/chat/stuck-turns";

export type HealthLevel = "ok" | "warning" | "critical";
export interface HealthCheck {
  name: string;
  level: HealthLevel;
  detail: string;
}

export async function getSystemHealth(admin: SupabaseClient): Promise<{
  level: HealthLevel;
  checks: HealthCheck[];
  metrics: Record<string, number>;
}> {
  const checks: HealthCheck[] = [];
  checks.push(
    env.isProduction && env.authDisabled
      ? { name: "Production authentication", level: "critical", detail: "AUTH_DISABLED was requested but is blocked; remove the unsafe variable." }
      : { name: "Production authentication", level: "ok", detail: env.isProduction ? "Authentication is enforced." : "Development environment." },
  );
  checks.push(
    configured.supabase && configured.supabaseAdmin
      ? { name: "Supabase configuration", level: "ok", detail: "URL, anonymous key, and server-only service key are configured." }
      : { name: "Supabase configuration", level: "critical", detail: "A required Supabase setting is missing." },
  );
  checks.push(
    configured.embeddings
      ? { name: "Embedding provider", level: "ok", detail: "Knowledge retrieval embeddings are configured." }
      : { name: "Embedding provider", level: "warning", detail: "Knowledge ingestion and semantic retrieval are unavailable." },
  );
  checks.push(
    configured.research
      ? { name: "Research provider", level: "ok", detail: "A web research provider is configured." }
      : { name: "Research provider", level: "warning", detail: "Web research is unavailable." },
  );
  checks.push({
    name: "Chat tools feature flag",
    level: env.chatToolsEnabled ? "ok" : "warning",
    detail: env.chatToolsEnabled ? "Selective connected-app tools are enabled." : "Connected-app tools are disabled by rollback flag.",
  });
  const appConfigs = ["gmail", "google_calendar", "google_drive", "slack", "notion", "github"]
    .filter((provider) => Boolean(authConfigIdFor(provider)))
    .map((provider) => provider.replace(/_/g, " "));
  checks.push({
    name: "Composio auth configs",
    level: configured.connectors && appConfigs.length === 0 ? "warning" : "ok",
    detail: appConfigs.length ? `Configured: ${appConfigs.join(", ")}.` : "No per-app auth config IDs are configured.",
  });
  checks.push(
    configured.anyLlm
      ? { name: "Model providers", level: "ok", detail: "At least one supported provider is configured." }
      : { name: "Model providers", level: "critical", detail: "No supported chat provider is configured." },
  );
  checks.push(
    configured.connectors
      ? { name: "Connected apps", level: "ok", detail: "Connector gateway is configured." }
      : { name: "Connected apps", level: "warning", detail: "Connector gateway is not configured; app actions are unavailable." },
  );

  const stuckCutoff = stuckTurnCutoffIso();
  const [messageState, eventsTable, receiptsTable, failedTurns, pendingApprovals, failedReceipts, stuckTurns] = await Promise.all([
    admin.from("messages").select("id, status, idempotency_key, trace_id").limit(1),
    admin.from("message_events").select("id").limit(1),
    admin.from("action_receipts").select("id").limit(1),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("action_receipts").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "assistant")
      .in("status", ["pending", "streaming"])
      .lt("updated_at", stuckCutoff),
  ]);
  const migrationReady = !messageState.error && !eventsTable.error && !receiptsTable.error;
  checks.push(
    migrationReady
      ? { name: "Agent reliability migration", level: "ok", detail: "Turn states, events, and verified receipts are available." }
      : { name: "Agent reliability migration", level: "critical", detail: "Migration 0014 is missing or inaccessible." },
  );

  const metrics = {
    failedTurns: failedTurns.count ?? 0,
    pendingApprovals: pendingApprovals.count ?? 0,
    failedReceipts: failedReceipts.count ?? 0,
    stuckTurns: stuckTurns.count ?? 0,
  };
  if (metrics.failedTurns > 0) {
    checks.push({ name: "Failed chat turns", level: "warning", detail: `${metrics.failedTurns} failed turn(s) require review.` });
  }
  if (metrics.stuckTurns > 0) {
    checks.push({ name: "Stuck chat turns", level: "warning", detail: `${metrics.stuckTurns} turn(s) have been pending/streaming past the recovery threshold. POST /api/admin/health to recover them.` });
  }
  if (metrics.failedReceipts > 0) {
    checks.push({ name: "Failed app actions", level: "warning", detail: `${metrics.failedReceipts} verified execution failure(s) are recorded.` });
  }

  const level: HealthLevel = checks.some((check) => check.level === "critical")
    ? "critical"
    : checks.some((check) => check.level === "warning")
      ? "warning"
      : "ok";
  return { level, checks, metrics };
}
