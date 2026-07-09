"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { bytesToSize } from "@/lib/utils";

const ACCEPT = ".pdf,.txt,.md,.markdown,.docx,.csv,.json";

export function UploadZone({ projectId = null }: { projectId?: string | null }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [dragging, setDragging] = React.useState(false);
  const [uploads, setUploads] = React.useState<
    { name: string; size: number; state: "uploading" | "done" | "error"; msg?: string }[]
  >([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const entry = { name: file.name, size: file.size, state: "uploading" as const };
      setUploads((u) => [entry, ...u]);
      try {
        const form = new FormData();
        form.append("file", file);
        if (projectId) form.append("projectId", projectId);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setUploads((u) =>
          u.map((x) =>
            x === entry
              ? {
                  ...x,
                  state: data.status === "completed" ? "done" : "error",
                  msg:
                    data.status === "completed"
                      ? `${data.chunkCount} chunks indexed`
                      : data.message || "Ingestion failed",
                }
              : x,
          ),
        );
        if (data.status === "completed") success(`Ingested ${file.name}`);
        else error(`Could not index ${file.name}`, data.message);
      } catch (e) {
        setUploads((u) =>
          u.map((x) =>
            x === entry ? { ...x, state: "error", msg: e instanceof Error ? e.message : "Failed" } : x,
          ),
        );
        error(`Upload failed: ${file.name}`);
      }
    }
    router.refresh();
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40",
        )}
      >
        <UploadCloud className="mb-3 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">Drop files here or click to upload</p>
        <p className="mt-1 text-xs text-muted-foreground">PDF, TXT, Markdown, DOCX, CSV, JSON</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploads.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">
                  {bytesToSize(u.size)} {u.msg ? `· ${u.msg}` : ""}
                </p>
              </div>
              {u.state === "uploading" && <Spinner className="text-muted-foreground" />}
              {u.state === "done" && <span className="text-xs font-medium text-success">Indexed</span>}
              {u.state === "error" && <span className="text-xs font-medium text-destructive">Failed</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
