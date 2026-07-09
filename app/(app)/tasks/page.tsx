import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { TasksClient } from "@/components/tasks/tasks-client";
import type { AgentTask } from "@/lib/agent/types";

export const metadata = { title: "Tasks · Aria" };

export default async function TasksPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();

  // Degrade gracefully if the 0008 migration hasn't been applied yet.
  let tasks: AgentTask[] = [];
  try {
    const { data } = await supabase
      .from("agent_tasks")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    tasks = (data ?? []) as AgentTask[];
  } catch {
    tasks = [];
  }

  return (
    <PageShell
      title="Tasks"
      description="Long-running agent work with step-by-step progress and human approval gates."
    >
      <TasksClient initial={tasks} />
    </PageShell>
  );
}
