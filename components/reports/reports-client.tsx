"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, FileText, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Badge, Input, Spinner } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/states";
import { NewReportButton } from "@/components/reports/new-report-button";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelative } from "@/lib/utils";

interface ReportRow {
  id: string;
  title: string;
  kind: string;
  updated_at: string;
}

const KIND_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "research", label: "Research" },
  { value: "project_summary", label: "Project summary" },
  { value: "proposal", label: "Proposal" },
  { value: "kb_summary", label: "Knowledge base" },
];

export function ReportsClient({ initial }: { initial: ReportRow[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState("all");
  const [sort, setSort] = React.useState("updated_desc");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...initial]
      .filter((report) => kind === "all" || report.kind === kind)
      .filter((report) => !q || `${report.title} ${report.kind}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === "title_asc") return a.title.localeCompare(b.title);
        if (sort === "title_desc") return b.title.localeCompare(a.title);
        if (sort === "updated_asc") return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [initial, kind, query, sort]);
  const selectedIds = Array.from(selected).filter((id) => filtered.some((report) => report.id === id));

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
      const allSelected = filtered.length > 0 && filtered.every((report) => next.has(report.id));
      for (const report of filtered) {
        if (allSelected) next.delete(report.id);
        else next.add(report.id);
      }
      return next;
    });
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} report${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/reports?id=${id}`, { method: "DELETE" }).then(async (res) => {
            if (!res.ok) throw new Error((await res.json()).error);
          }),
        ),
      );
      success("Reports deleted");
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      error("Could not delete reports", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (initial.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="No reports yet"
        description="Generate a research report or project summary. You can preview and export it as a PDF."
        action={<NewReportButton />}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_190px_190px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports..." className="pl-9" />
          </div>
          <Select value={kind} onChange={setKind} options={KIND_OPTIONS} />
          <Select
            value={sort}
            onChange={setSort}
            options={[
              { value: "updated_desc", label: "Newest updated" },
              { value: "updated_asc", label: "Oldest updated" },
              { value: "title_asc", label: "Title A-Z" },
              { value: "title_desc", label: "Title Z-A" },
            ]}
          />
          <Button variant="outline" onClick={toggleAllVisible} disabled={filtered.length === 0}>
            <CheckSquare className="h-4 w-4" /> Select
          </Button>
        </div>
        {selectedIds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
            <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
            <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={busy}>
              {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete
            </Button>
          </div>
        )}
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No matching reports"
          description="Adjust the search, filter, or sort controls to find a report."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((report) => (
            <Card key={report.id} className={cn("h-full p-5 transition hover:-translate-y-0.5 hover:border-primary/35", selected.has(report.id) && "border-primary bg-primary/10")}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(report.id)}
                  onChange={() => toggleSelected(report.id)}
                  className="mt-1 h-4 w-4 accent-primary"
                  aria-label={`Select ${report.title}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <Badge tone="muted">{report.kind.replace("_", " ")}</Badge>
                  </div>
                  <h3 className="mt-3 line-clamp-2 font-semibold">{report.title}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">Updated {formatRelative(report.updated_at)}</p>
                  <Link href={`/reports/${report.id}`} className="mt-4 inline-flex text-xs font-medium text-primary hover:underline">
                    Open report
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
