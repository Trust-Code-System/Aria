"use client";

import * as React from "react";
import { Download, Trash2, AlertTriangle } from "lucide-react";

import { Spinner, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/**
 * User-facing data controls: export everything Aria remembers, or delete it.
 * Deletion demands typing DELETE — destructive actions are never one click.
 */
export function PrivacyControls() {
  const { success, error } = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function purge() {
    if (confirmText !== "DELETE") return;
    setBusy(true);
    try {
      const res = await fetch("/api/memory/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE", status: "all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      success("Memories deleted", `${data.deleted ?? 0} memories were removed from this workspace.`);
      setConfirming(false);
      setConfirmText("");
    } catch (e) {
      error("Could not delete memories", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/memory/export"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium transition hover:border-primary/40"
        >
          <Download className="h-3.5 w-3.5" /> Export all memories (JSON)
        </a>
        <button
          type="button"
          onClick={() => setConfirming((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3.5 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete all memories…
        </button>
      </div>

      {confirming && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            This permanently deletes every memory in the current workspace.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              className="max-w-[220px]"
            />
            <button
              type="button"
              onClick={purge}
              disabled={busy || confirmText !== "DELETE"}
              className="rounded-full bg-destructive px-3.5 py-1.5 text-xs font-medium text-destructive-foreground transition disabled:opacity-50"
            >
              {busy ? <Spinner /> : "Delete permanently"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
