"use client";

import * as React from "react";
import { Brain, Check, Pencil, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";

export function MemoryEventCard({
  memoryId,
  content,
  kind,
}: {
  memoryId: string;
  content: string;
  kind: "saved" | "suggested";
}) {
  const [status, setStatus] = React.useState<"active" | "approved" | "dismissed" | "undone">("active");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(content);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function update(fields: Record<string, unknown>, next: typeof status) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memoryId, ...fields }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update this memory.");
      setStatus(next);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this memory.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/memory?id=${memoryId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not undo the memory.");
      setStatus("undone");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not undo the memory.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-xs">
      <div className="flex items-start gap-2">
        <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{kind === "saved" ? "Saved to memory" : "Suggested memory"}</p>
          {editing ? (
            <Textarea className="mt-2" value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
          ) : (
            <p className="mt-1 text-muted-foreground">{draft}</p>
          )}
          {status !== "active" && <p className="mt-2 font-medium capitalize text-primary">{status}</p>}
          {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
          {status === "active" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {kind === "suggested" ? (
                <>
                  <Button size="sm" onClick={() => void update({ content: draft, approval_status: "approved" }, "approved")} disabled={busy}><Check className="h-3.5 w-3.5" /> Approve</Button>
                  <Button size="sm" variant="secondary" onClick={() => editing ? void update({ content: draft }, "active") : setEditing(true)} disabled={busy}><Pencil className="h-3.5 w-3.5" /> {editing ? "Save edit" : "Edit"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void update({ approval_status: "disabled" }, "dismissed")} disabled={busy}><X className="h-3.5 w-3.5" /> Dismiss</Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => void undo()} disabled={busy}><RotateCcw className="h-3.5 w-3.5" /> Undo</Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
