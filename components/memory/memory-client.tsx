"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Brain, Plus, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Input, Textarea, Label, Badge, Spinner } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export interface MemoryRow {
  id: string;
  content: string;
  type: string;
  source: string;
  sensitivity: string;
  approval_status: string;
  project_id: string | null;
  updated_at: string;
}

const TYPES = [
  { id: "preference", label: "Preference" },
  { id: "project_fact", label: "Project fact" },
  { id: "writing_style", label: "Writing style" },
  { id: "tool_preference", label: "Tool preference" },
  { id: "workflow", label: "Workflow" },
] as const;

export function MemoryClient({
  initial,
  projects,
}: {
  initial: MemoryRow[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [adding, setAdding] = React.useState(false);
  const [content, setContent] = React.useState("");
  const [type, setType] = React.useState<string>("preference");
  const [projectId, setProjectId] = React.useState<string>("");
  const [filter, setFilter] = React.useState<"all" | "global" | "project">("all");
  const [busy, setBusy] = React.useState<string | null>(null);

  const filtered = initial.filter((m) => {
    if (filter === "global") return m.project_id === null;
    if (filter === "project") return m.project_id !== null;
    return true;
  });

  async function add() {
    if (!content.trim()) return;
    setBusy("add");
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, type, projectId: projectId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      success("Memory added");
      setContent("");
      setAdding(false);
      router.refresh();
    } catch (e) {
      error("Could not add memory", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(m: MemoryRow) {
    setBusy(m.id);
    const next = m.approval_status === "approved" ? "disabled" : "approved";
    try {
      const res = await fetch("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, approval_status: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      router.refresh();
    } catch (e) {
      error("Could not update", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this memory?")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      success("Memory deleted");
      router.refresh();
    } catch (e) {
      error("Could not delete", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {(["all", "global", "project"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <Button onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> Add memory
        </Button>
      </div>

      {adding && (
        <Card className="p-5">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Memory</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="e.g. I prefer concise answers with bullet points and a clear recommendation first."
                autoFocus
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={type}
                  onChange={setType}
                  options={TYPES.map((item) => ({ value: item.id, label: item.label }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Scope</Label>
                <Select
                  value={projectId}
                  onChange={setProjectId}
                  options={[
                    { value: "", label: "Global (all projects)" },
                    ...projects.map((project) => ({ value: project.id, label: project.name })),
                  ]}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Aria will not store passwords, API keys, or sensitive credentials as memory.
            </p>
            <div className="flex gap-2">
              <Button onClick={add} disabled={busy === "add" || !content.trim()}>
                {busy === "add" && <Spinner />} Save memory
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Brain className="h-5 w-5" />}
          title="No memories yet"
          description="Add stable preferences or project facts. Approved memories are used automatically in chat."
          action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add your first memory</Button>}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <Card key={m.id} className={`p-4 ${m.approval_status !== "approved" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="accent">{m.type.replace("_", " ")}</Badge>
                    {m.project_id ? (
                      <Badge tone="muted">{projName(m.project_id) ?? "Project"}</Badge>
                    ) : (
                      <Badge tone="muted">Global</Badge>
                    )}
                    {m.approval_status === "suggested" && <Badge tone="warning">Suggested</Badge>}
                    {m.approval_status === "disabled" && <Badge tone="muted">Disabled</Badge>}
                  </div>
                  <p className="text-sm">{m.content}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggle(m)}
                    disabled={busy === m.id}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                    title={m.approval_status === "approved" ? "Disable" : "Enable"}
                  >
                    {busy === m.id ? <Spinner /> : <Power className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => remove(m.id)}
                    disabled={busy === m.id}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
