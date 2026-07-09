"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, RotateCw, Trash2 } from "lucide-react";
import { Badge, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatRelative, bytesToSize } from "@/lib/utils";

export interface DocRow {
  id: string;
  filename: string;
  file_type: string;
  byte_size: number | null;
  ingestion_status: string;
  chunk_count: number;
  error_message: string | null;
  updated_at: string;
}

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge tone="success">Indexed</Badge>;
    case "processing":
      return <Badge tone="warning">Processing</Badge>;
    case "pending":
      return <Badge tone="muted">Pending</Badge>;
    case "failed":
      return <Badge tone="destructive">Failed</Badge>;
    default:
      return <Badge tone="muted">{status}</Badge>;
  }
}

export function DocumentList({ docs }: { docs: DocRow[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function retry(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === "completed") success("Re-indexed successfully");
      else error("Ingestion failed again", data.message);
      router.refresh();
    } catch (e) {
      error("Retry failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this document and its indexed chunks? This cannot be undone.")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      success("Document deleted");
      router.refresh();
    } catch (e) {
      error("Could not delete", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-3 px-4 py-3">
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{d.filename}</p>
            <p className="text-xs text-muted-foreground">
              {d.file_type.toUpperCase()} · {bytesToSize(d.byte_size ?? 0)} ·{" "}
              {d.chunk_count} chunks · {formatRelative(d.updated_at)}
            </p>
            {d.ingestion_status === "failed" && d.error_message && (
              <p className="mt-1 text-xs text-destructive">{d.error_message}</p>
            )}
          </div>
          {statusBadge(d.ingestion_status)}
          <div className="flex items-center gap-1">
            {(d.ingestion_status === "failed" || d.ingestion_status === "pending") && (
              <button
                onClick={() => retry(d.id)}
                disabled={busy === d.id}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                title="Retry ingestion"
              >
                {busy === d.id ? <Spinner /> : <RotateCw className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => remove(d.id)}
              disabled={busy === d.id}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
              title="Delete document"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
