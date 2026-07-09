"use client";

import * as React from "react";
import { Play, Loader2, Check, X, Circle, MinusCircle, AlertCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { Markdown } from "@/components/chat/markdown";
import type { AgentTask, AgentTaskStep, Approval, StepStatus, TaskStatus } from "@/lib/agent/types";
import { isTerminal, RISK_LABELS } from "@/lib/agent/types";

const STATUS_TONE: Record<TaskStatus, React.ComponentProps<typeof Badge>["tone"]> = {
  queued: "muted",
  running: "accent",
  waiting_for_approval: "warning",
  completed: "success",
  failed: "destructive",
  cancelled: "muted",
};

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return <Check className="h-4 w-4 text-success" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case "skipped":
      return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" />;
  }
}

export function TaskDetailClient({
  task: initialTask,
  initialSteps,
  initialApprovals,
}: {
  task: AgentTask;
  initialSteps: AgentTaskStep[];
  initialApprovals: Approval[];
}) {
  const { success, error } = useToast();
  const [task, setTask] = React.useState(initialTask);
  const [steps, setSteps] = React.useState(initialSteps);
  const [approvals, setApprovals] = React.useState(initialApprovals);
  const [running, setRunning] = React.useState(false);
  const [deciding, setDeciding] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await fetch(`/api/agent/tasks/${task.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setTask(data.task);
    setSteps(data.steps);
    setApprovals(data.approvals);
  }, [task.id]);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch(`/api/agent/tasks/${task.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The task could not run.");
      await refresh();
      if (data.status === "waiting_for_approval") success("Paused for your approval");
      else if (data.status === "completed") success("Task completed");
    } catch (err) {
      error("Run failed", err instanceof Error ? err.message : undefined);
    } finally {
      setRunning(false);
    }
  }

  async function decide(id: string, decision: "approve" | "reject" | "request_changes") {
    setDeciding(id);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refresh();
      // Approving unblocks the task — continue running automatically.
      if (decision === "approve") await run();
    } catch (err) {
      error("Could not submit decision", err instanceof Error ? err.message : undefined);
    } finally {
      setDeciding(null);
    }
  }

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const canRun = !isTerminal(task.status) && !running;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={STATUS_TONE[task.status]}>{task.status.replace(/_/g, " ")}</Badge>
        <span className="text-sm text-muted-foreground">
          Step {task.current_step}/{task.max_steps}
          {task.cost_actual > 0 && ` · ~$${task.cost_actual.toFixed(2)}`}
        </span>
        <div className="ml-auto">
          <Button onClick={run} disabled={!canRun}>
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
            {task.status === "queued" ? "Run" : task.status === "waiting_for_approval" ? "Resume" : "Run again"}
          </Button>
        </div>
      </div>

      {task.error_message && (
        <Card className="border-destructive/40 p-3 text-sm text-destructive">{task.error_message}</Card>
      )}

      {pendingApprovals.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-warning">Needs your approval</h2>
          {pendingApprovals.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={a.risk_level >= 3 ? "destructive" : "warning"}>{RISK_LABELS[a.risk_level]}</Badge>
                <Badge tone="muted">{a.action_type}</Badge>
              </div>
              <p className="mt-2 font-medium">{a.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => decide(a.id, "approve")} disabled={deciding === a.id}>
                  <Check className="mr-1 h-4 w-4" /> Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => decide(a.id, "reject")} disabled={deciding === a.id}>
                  <X className="mr-1 h-4 w-4" /> Reject
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(a.id, "request_changes")} disabled={deciding === a.id}>
                  <Pencil className="mr-1 h-4 w-4" /> Request changes
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold">Timeline</h2>
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No steps yet — run the task to generate a plan.</p>
        ) : (
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                <div className="mt-0.5">
                  <StepIcon status={s.status} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{s.summary}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge tone="muted">{s.kind}</Badge>
                    {s.tool_name && <span className="text-xs text-muted-foreground">{s.tool_name}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {task.result && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Result</h2>
          <Card className="p-4">
            <Markdown content={task.result} />
          </Card>
        </div>
      )}
    </div>
  );
}
