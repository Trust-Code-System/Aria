"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CheckSquare, FolderKanban, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Input, Textarea, Label, Badge, Spinner } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelative } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  updated_at: string;
}

export function ProjectsClient({ initial }: { initial: Project[] }) {
  const router = useRouter();
  const { error, success } = useToast();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("active");
  const [sort, setSort] = React.useState("updated_desc");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...initial]
      .filter((project) => statusFilter === "all" || project.status === statusFilter)
      .filter((project) => {
        if (!q) return true;
        return `${project.name} ${project.description ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sort === "name_asc") return a.name.localeCompare(b.name);
        if (sort === "name_desc") return b.name.localeCompare(a.name);
        if (sort === "updated_asc") return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [initial, query, sort, statusFilter]);
  const selectedIds = Array.from(selected).filter((id) => filtered.some((project) => project.id === id));

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      success("Project created");
      setName("");
      setDescription("");
      setCreating(false);
      router.push(`/projects/${data.id}`);
      router.refresh();
    } catch (e) {
      error("Could not create project", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = filtered.length > 0 && filtered.every((project) => next.has(project.id));
      for (const project of filtered) {
        if (allSelected) next.delete(project.id);
        else next.add(project.id);
      }
      return next;
    });
  }

  async function updateSelected(status: "active" | "archived") {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch("/api/projects", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
          }).then(async (res) => {
            if (!res.ok) throw new Error((await res.json()).error);
          }),
        ),
      );
      success(status === "archived" ? "Projects archived" : "Projects restored");
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      error("Could not update projects", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} project${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/projects?id=${id}`, { method: "DELETE" }).then(async (res) => {
            if (!res.ok) throw new Error((await res.json()).error);
          }),
        ),
      );
      success("Projects deleted");
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      error("Could not delete projects", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </div>

      {creating && (
        <Card className="p-5">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pname">Name</Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Launch Plan" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdesc">Description (optional)</Label>
              <Textarea id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" />
            </div>
            <div className="flex gap-2">
              <Button onClick={create} disabled={busy || !name.trim()}>
                {busy && <Spinner />} Create
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects..." className="pl-9" />
          </div>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
              { value: "all", label: "All projects" },
            ]}
          />
          <Select
            value={sort}
            onChange={setSort}
            options={[
              { value: "updated_desc", label: "Newest updated" },
              { value: "updated_asc", label: "Oldest updated" },
              { value: "name_asc", label: "Name A-Z" },
              { value: "name_desc", label: "Name Z-A" },
            ]}
          />
          <Button variant="outline" onClick={toggleAllVisible} disabled={filtered.length === 0}>
            <CheckSquare className="h-4 w-4" /> Select
          </Button>
        </div>
        {selectedIds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
            <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
            <Button size="sm" variant="outline" onClick={() => updateSelected("archived")} disabled={busy}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
            <Button size="sm" variant="outline" onClick={() => updateSelected("active")} disabled={busy}>
              Restore
            </Button>
            <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={busy}>
              {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete
            </Button>
          </div>
        )}
      </Card>

      {filtered.length === 0 && !creating ? (
        <EmptyState
          icon={initial.length === 0 ? <FolderKanban className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          title={initial.length === 0 ? "No projects yet" : "No matching projects"}
          description={
            initial.length === 0
              ? "Create a project to keep related files, chats, and memory together."
              : "Adjust the search, filter, or sort controls to find a project."
          }
          action={initial.length === 0 ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create project</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
              <Card key={p.id} className={cn("h-full p-5 transition hover:-translate-y-0.5 hover:border-primary/35", selected.has(p.id) && "border-primary bg-primary/10")}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelected(p.id)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                    aria-label={`Select ${p.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-primary" />
                      <h3 className="truncate font-semibold">{p.name}</h3>
                      {p.status === "archived" && <Badge tone="muted">Archived</Badge>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {p.description || "No description"}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Updated {formatRelative(p.updated_at)}
                    </p>
                    <Link href={`/projects/${p.id}`} className="mt-4 inline-flex text-xs font-medium text-primary hover:underline">
                      Open project
                    </Link>
                  </div>
                </div>
              </Card>
          ))}
        </div>
      )}
    </div>
  );
}
