"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Input, Textarea, Label, Spinner } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

const KINDS = [
  { id: "research", label: "Research report" },
  { id: "project_summary", label: "Project summary" },
  { id: "proposal", label: "Proposal" },
  { id: "kb_summary", label: "Knowledge base summary" },
] as const;

export function NewReportButton() {
  const router = useRouter();
  const { error } = useToast();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<string>("research");
  const [material, setMaterial] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function generate() {
    if (!title.trim() || !material.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, kind, generateFrom: material }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/reports/${data.id}`);
      router.refresh();
    } catch (e) {
      error("Could not generate report", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New report
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <Card className="w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Generate a report</h2>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Market landscape — Q3" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={kind}
              onChange={setKind}
              options={KINDS.map((item) => ({ value: item.id, label: item.label }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Source material / prompt</Label>
            <Textarea
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="Paste notes, research, or describe what the report should cover. Aria will structure and write it."
              className="min-h-[140px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={busy || !title.trim() || !material.trim()}>
              {busy && <Spinner />} Generate
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
