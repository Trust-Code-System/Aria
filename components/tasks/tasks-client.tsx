"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, X, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Badge, Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { AgentTask, TaskStatus } from "@/lib/agent/types";
import { isTerminal } from "@/lib/agent/types";
import { formatDate } from "@/lib/utils";

const STATUS_TONE: Record<TaskStatus, React.ComponentProps<typeof Badge>["tone"]> = {
  queued: "muted",
  running: "accent",
  waiting_for_approval: "warning",
  completed: "success",
  failed: "destructive",
  cancelled: "muted",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting_for_approval: "Waiting for approval",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function TasksClient({ initial }: { initial: AgentTask[] }) {
  const { success, error } = useToast();
  const [tasks, setTasks] = React.useState<AgentTask[]>(initial);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<"low" | "normal" | "high">("normal");

  async function createTask() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, priority }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the task.");
      setTasks((t) => [data.task as AgentTask, ...t]);
      setTitle("");
      setDescription("");
      setPriority("normal");
      setCreating(false);
      success("Task created");
    } catch (err) {
      error("Could not create task", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function cancelTask(id: string) {
    try {
      const res = await fetch(`/api/agent/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTasks((t) => t.map((x) => (x.id === id ? (data.task as AgentTask) : x)));
    } catch (err) {
      error("Could not cancel task", err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <div className="space-y-5">
      {creating ? (
        <Card className="p-4">
          <div className="space-y-3">
            <Input placeholder="What should the agent do?" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <Textarea
              placeholder="Add detail, constraints, or context (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Priority</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={createTask} disabled={!title.trim() || busy}>
                  {busy ? "Creating…" : "Create task"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New task
        </Button>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="h-5 w-5" />}
          title="No tasks yet"
          description="Create a task and the agent will plan it, run safe steps, and ask you to approve anything risky."
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Card key={task.id} className="flex items-start justify-between gap-4 p-4">
              <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 transition-opacity hover:opacity-80">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{task.title}</span>
                  <Badge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
                  {task.priority !== "normal" && <Badge tone="muted">{task.priority}</Badge>}
                </div>
                {task.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  Step {task.current_step}/{task.max_steps} · {formatDate(task.created_at)}
                </p>
              </Link>
              {!isTerminal(task.status) && (
                <button
                  onClick={() => cancelTask(task.id)}
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Cancel task"
                  title="Cancel task"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
