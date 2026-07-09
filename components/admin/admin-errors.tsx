"use client";

import * as React from "react";
import { Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/states";
import { ShieldCheck } from "lucide-react";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export interface ErrorRow {
  id: string;
  feature_area: string;
  provider: string | null;
  category: string;
  sanitized_message: string;
  status_code: number | null;
  latency_ms: number | null;
  trace_id: string | null;
  resolved: boolean;
  created_at: string;
}

export function AdminErrors({ initial }: { initial: ErrorRow[] }) {
  const { error } = useToast();
  const [rows, setRows] = React.useState(initial);
  const [showResolved, setShowResolved] = React.useState(false);

  const visible = rows.filter((r) => showResolved || !r.resolved);

  function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return DATE_TIME_FORMATTER.format(date);
  }

  async function toggle(row: ErrorRow) {
    const next = !row.resolved;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, resolved: next } : r)));
    try {
      const res = await fetch("/api/admin/errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, resolved: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, resolved: !next } : r)));
      error("Could not update status");
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-5 w-5" />}
        title="No errors logged"
        description="When something fails, a sanitized record will appear here — never private content or secrets."
      />
    );
  }

  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        Show resolved
      </label>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Area</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Message</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Trace</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r) => (
              <tr key={r.id} className={r.resolved ? "opacity-50" : ""}>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {formatTime(r.created_at)}
                </td>
                <td className="px-3 py-2">
                  <Badge tone="muted">{r.feature_area}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">{r.category}</td>
                <td className="max-w-sm px-3 py-2 text-xs text-muted-foreground">
                  {r.sanitized_message}
                  {r.provider && <span className="ml-1 text-muted-foreground/70">· {r.provider}</span>}
                </td>
                <td className="px-3 py-2 text-xs">{r.status_code ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{r.trace_id ?? "—"}</td>
                <td className="px-3 py-2">
                  <button onClick={() => toggle(r)} className="text-xs text-primary hover:underline">
                    {r.resolved ? "Reopen" : "Resolve"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
