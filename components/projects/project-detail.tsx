"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, Save, Archive, Trash2, FolderKanban } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, Input, Textarea, Label, Badge, Spinner } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { UploadZone } from "@/components/knowledge/upload-zone";
import { DocumentList, type DocRow } from "@/components/knowledge/document-list";
import { useToast } from "@/components/ui/toast";
import { formatRelative } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  status: string;
  updated_at: string;
}

type Tab = "overview" | "files" | "chats" | "memory";

export function ProjectDetail({
  project,
  documents,
  conversations,
  memories,
}: {
  project: Project;
  documents: DocRow[];
  conversations: { id: string; title: string; mode: string; updated_at: string }[];
  memories: { id: string; content: string; type: string; approval_status: string }[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description ?? "");
  const [instructions, setInstructions] = React.useState(project.instructions ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, name, description, instructions }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      success("Project saved");
      router.refresh();
    } catch (e) {
      error("Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    setBusy(true);
    try {
      const next = project.status === "archived" ? "active" : "archived";
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, status: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      success(next === "archived" ? "Project archived" : "Project restored");
      router.refresh();
    } catch (e) {
      error("Could not update", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this project? Documents and chats stay but are unlinked. This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects?id=${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      success("Project deleted");
      router.push("/projects");
      router.refresh();
    } catch (e) {
      error("Could not delete", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "files", label: "Files", count: documents.length },
    { id: "chats", label: "Chats", count: conversations.length },
    { id: "memory", label: "Memory", count: memories.length },
  ];

  return (
    <PageShell
      title={project.name}
      description={project.description || "Project space"}
      actions={
        <Link href={`/chat?project=${project.id}`}>
          <Button>
            <MessageSquare className="h-4 w-4" /> Chat in project
          </Button>
        </Link>
      }
    >
      {project.status === "archived" && (
        <div className="mb-4">
          <Badge tone="muted">Archived</Badge>
        </div>
      )}

      <div className="mb-6 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span className="ml-1.5 text-xs text-muted-foreground">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <Card className="p-5">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst">Instructions</Label>
              <Textarea
                id="inst"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Standing instructions Aria should follow inside this project (tone, goals, constraints)."
                className="min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                These instructions are injected into every chat scoped to this project.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={save} disabled={busy}>
                {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
              </Button>
              <Button variant="outline" onClick={toggleArchive} disabled={busy}>
                <Archive className="h-4 w-4" />
                {project.status === "archived" ? "Restore" : "Archive"}
              </Button>
              <Button variant="ghost" onClick={remove} disabled={busy} className="text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "files" && (
        <div className="space-y-6">
          <UploadZone projectId={project.id} />
          {documents.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-5 w-5" />}
              title="No files in this project"
              description="Upload files above. They’ll be scoped to this project for retrieval."
            />
          ) : (
            <DocumentList docs={documents} />
          )}
        </div>
      )}

      {tab === "chats" && (
        <div>
          {conversations.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-5 w-5" />}
              title="No chats yet"
              description="Start a project-scoped conversation."
              action={
                <Link href={`/chat?project=${project.id}`}>
                  <Button>New chat</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {conversations.map((c) => (
                <Link key={c.id} href={`/chat/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-xs capitalize text-muted-foreground">{c.mode} mode</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatRelative(c.updated_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "memory" && (
        <div>
          {memories.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-5 w-5" />}
              title="No project memories"
              description="Add project facts and preferences from the Memory page — scope them to this project."
              action={
                <Link href="/memory">
                  <Button variant="outline">Go to Memory</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <Card key={m.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge tone="accent">{m.type.replace("_", " ")}</Badge>
                    <Badge tone={m.approval_status === "approved" ? "success" : "muted"}>
                      {m.approval_status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm">{m.content}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
