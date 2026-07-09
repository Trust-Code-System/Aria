import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { AgentsClient } from "@/components/agents/agents-client";
import { TEAM_TEMPLATES } from "@/lib/ai/agents";
import { configured } from "@/lib/env";

export const metadata = { title: "Agents · Aria" };

export default async function AgentsPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const [runsRes, projRes] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id, kind, title, status, iterations, report_id, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase.from("projects").select("id, name").eq("workspace_id", ctx.workspaceId).eq("status", "active"),
  ]);

  const teams = TEAM_TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    steps: t.steps.map((s) => s.name),
  }));

  return (
    <PageShell
      title="Agents"
      description="Run agent teams (a pipeline of specialists) or self-checking loops that iterate until they hit your bar."
    >
      {!configured.anyLlm && (
        <div className="mb-5 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-warning">No LLM configured.</span> Add a provider key to run agents.
        </div>
      )}
      <AgentsClient teams={teams} projects={projRes.data ?? []} recent={runsRes.data ?? []} />
    </PageShell>
  );
}
