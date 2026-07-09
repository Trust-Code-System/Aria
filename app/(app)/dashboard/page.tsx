import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { FierceDashboard } from "@/components/dashboard/fierce-dashboard";

export const metadata = { title: "Dashboard · Aria" };

export default async function DashboardPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const since = new Date(Date.now() - 13 * 86400000);
  since.setHours(0, 0, 0, 0);

  const head = (table: string, extra?: (q: any) => any) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspaceId);
    if (extra) q = extra(q);
    return q;
  };

  const [projects, documents, chunks, memories, reports, conversations, agentRuns, msgRows, recent, gmail] =
    await Promise.all([
      head("projects", (q) => q.eq("status", "active")),
      head("documents"),
      head("document_chunks"),
      head("memories", (q) => q.eq("approval_status", "approved")),
      head("reports"),
      head("conversations"),
      head("agent_runs"),
      supabase
        .from("messages")
        .select("created_at")
        .eq("workspace_id", ctx.workspaceId)
        .gte("created_at", since.toISOString())
        .limit(5000),
      supabase
        .from("conversations")
        .select("id, title, mode, updated_at")
        .eq("workspace_id", ctx.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(4),
      supabase
        .from("connections")
        .select("provider, status, account_label")
        .eq("workspace_id", ctx.workspaceId),
    ]);

  // Build a real 14-day activity series (messages per day).
  const buckets: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    d.setHours(0, 0, 0, 0);
    buckets.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.date, i]));
  for (const m of msgRows.data ?? []) {
    const key = new Date(m.created_at as string).toISOString().slice(0, 10);
    const i = idx.get(key);
    if (i !== undefined) buckets[i].count++;
  }

  const metrics = {
    projects: projects.count ?? 0,
    documents: documents.count ?? 0,
    chunks: chunks.count ?? 0,
    memories: memories.count ?? 0,
    reports: reports.count ?? 0,
    conversations: conversations.count ?? 0,
    agentRuns: agentRuns.count ?? 0,
    messages: (msgRows.data ?? []).length,
  };

  const gmailConn = (gmail.data ?? []).find((c) => c.provider === "gmail");

  return (
    <FierceDashboard
      name={ctx.email?.split("@")[0] ?? "there"}
      metrics={metrics}
      series={buckets}
      recent={recent.data ?? []}
      gmail={gmailConn ? { status: gmailConn.status as string, label: (gmailConn.account_label as string) ?? null } : null}
    />
  );
}
