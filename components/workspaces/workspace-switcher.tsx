"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";

import { Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface WorkspaceRow {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

/**
 * Compact workspace switcher. Every private table is RLS-scoped by
 * workspace_id, so switching re-scopes chat, knowledge, memory, tasks,
 * approvals, contacts — everything — with zero cross-workspace leakage.
 */
export function WorkspaceSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [workspaces, setWorkspaces] = React.useState<WorkspaceRow[] | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      const data = await res.json();
      if (res.ok) setWorkspaces(data.workspaces);
    } catch {
      /* leave null — switcher renders nothing on failure */
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function switchTo(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setOpen(false);
      success("Workspace switched");
      router.refresh();
      await load();
    } catch (e) {
      error("Could not switch workspace", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const name = newName.trim();
    if (name.length < 2) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewName("");
      setCreating(false);
      success("Workspace created", `"${name}" is ready.`);
      await switchTo(data.workspace.id);
    } catch (e) {
      error("Could not create workspace", e instanceof Error ? e.message : undefined);
      setBusy(false);
    }
  }

  // Render nothing until loaded, and hide entirely for single-workspace users
  // unless they open the create flow — the switcher should never add noise.
  if (!workspaces) return null;
  const active = workspaces.find((w) => w.active);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface-container-low px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="h-3.5 w-3.5" />
        <span className="max-w-[120px] truncate">{active?.name ?? "Workspace"}</span>
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-surface-container-high p-1.5 shadow-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Workspaces
          </p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={busy || w.active}
              onClick={() => switchTo(w.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition",
                w.active ? "bg-primary/10 font-medium" : "hover:bg-muted",
              )}
            >
              <span className="truncate">{w.name}</span>
              <span className="ml-2 flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                {w.role}
                {w.active && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
            </button>
          ))}

          <div className="mt-1 border-t border-border pt-1.5">
            {creating ? (
              <div className="flex items-center gap-1.5 px-1 pb-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void create();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="Business name…"
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
                />
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={busy || newName.trim().length < 2}
                  className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {busy ? <Spinner /> : "Add"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-4 w-4" /> New business workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
