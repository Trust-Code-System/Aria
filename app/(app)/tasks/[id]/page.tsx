import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { TaskDetailClient } from "@/components/tasks/task-detail-client";
import type { AgentTask, AgentTaskStep, Approval } from "@/lib/agent/types";

export const metadata = { title: "Task · Aria" };

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createServerSupabase();

  const { data: task } = await supabase
    .from("agent_tasks")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!task) notFound();

  const [{ data: steps }, { data: approvals }] = await Promise.all([
    supabase.from("agent_task_steps").select("*").eq("task_id", params.id).order("idx", { ascending: true }),
    supabase.from("approvals").select("*").eq("task_id", params.id).order("created_at", { ascending: false }),
  ]);

  return (
    <PageShell title={task.title} description="Task timeline, approvals, and result.">
      <TaskDetailClient
        task={task as AgentTask}
        initialSteps={(steps ?? []) as AgentTaskStep[]}
        initialApprovals={(approvals ?? []) as Approval[]}
      />
    </PageShell>
  );
}
