"use client";

import * as React from "react";
import { Check, X, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { Approval, RiskLevel } from "@/lib/agent/types";
import { RISK_LABELS } from "@/lib/agent/types";
import { formatDate } from "@/lib/utils";

const RISK_TONE: Record<RiskLevel, React.ComponentProps<typeof Badge>["tone"]> = {
  0: "muted",
  1: "muted",
  2: "warning",
  3: "destructive",
  4: "destructive",
};

type Decision = "approve" | "reject" | "request_changes";

export function ApprovalsClient({ initial }: { initial: Approval[] }) {
  const { success, error } = useToast();
  const [items, setItems] = React.useState<Approval[]>(initial);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function decide(id: string, decision: Decision) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not record your decision.");
      setItems((list) => list.filter((a) => a.id !== id));
      success(
        decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "Changes requested",
      );
    } catch (err) {
      error("Could not submit decision", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-5 w-5" />}
        title="You're all caught up"
        description="When an agent needs to send, spend, or change something, it will appear here for your approval."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((a) => {
        const meta = Object.entries(a.safe_metadata ?? {});
        const busy = busyId === a.id;
        return (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={RISK_TONE[a.risk_level]}>{RISK_LABELS[a.risk_level]}</Badge>
              <Badge tone="muted">{a.action_type}</Badge>
              {a.tool_name && <Badge tone="muted">{a.tool_name}</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(a.created_at)}
              </span>
            </div>

            <p className="mt-2 font-medium">{a.summary}</p>

            {meta.length > 0 && (
              <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
                {meta.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 truncate">{String(v)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => decide(a.id, "approve")} disabled={busy}>
                <Check className="mr-1 h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => decide(a.id, "reject")} disabled={busy}>
                <X className="mr-1 h-4 w-4" /> Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide(a.id, "request_changes")} disabled={busy}>
                <Pencil className="mr-1 h-4 w-4" /> Request changes
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
