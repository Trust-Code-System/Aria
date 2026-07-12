"use client";

import * as React from "react";
import Link from "next/link";
import { Check, X, Pencil, ShieldCheck, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { Approval, RiskLevel } from "@/lib/agent/types";
import { RISK_LABELS } from "@/lib/agent/types";
import { isApprovable } from "@/lib/agent/approval-policy";
import { haptic } from "@/lib/ui/haptics";
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
  // Level-3 (high-risk) approvals require a second, explicit confirmation click.
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  async function decide(approval: Approval, decision: Decision) {
    setBusyId(approval.id);
    haptic(decision === "approve" ? "medium" : "light");
    try {
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not record your decision.");
      setItems((list) => list.filter((a) => a.id !== approval.id));

      // Approving unblocks the linked task — resume it in the background.
      if (decision === "approve" && approval.task_id) {
        const run = await fetch(`/api/agent/tasks/${approval.task_id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ background: true }),
        });
        if (run.ok) {
          haptic("success");
          success("Approved — task resumed in the background", "Watch live progress on its task page.");
        } else {
          error("Approved, but the task could not resume", "Open it in Tasks and press Run.");
        }
      } else if (decision === "approve" && data.execution?.ok) {
        haptic("success");
        const ref = data.execution?.receipt?.provider_reference;
        success(
          "Approved and completed",
          ref
            ? `Provider confirmed the action (ref: ${ref}).`
            : "The connected app confirmed the action.",
        );
      } else {
        if (decision === "reject") haptic("error");
        success(
          decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "Changes requested",
        );
      }
    } catch (err) {
      haptic("error");
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

            {/* Structured preview only — never render agent markdown as trusted HTML. */}
            {a.payload_hash && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Locked payload · sha256:{a.payload_hash.slice(0, 12)}…
              </p>
            )}

            {meta.length > 0 && (
              <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
                {meta.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 truncate font-mono text-xs">{String(v)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isApprovable(a.risk_level) ? (
                a.risk_level >= 3 && confirmId !== a.id ? (
                  <Button size="sm" variant="destructive" onClick={() => setConfirmId(a.id)} disabled={busy}>
                    <AlertTriangle className="mr-1 h-4 w-4" /> Approve high-risk…
                  </Button>
                ) : a.risk_level >= 3 ? (
                  <>
                    <Button size="sm" variant="destructive" onClick={() => { setConfirmId(null); decide(a, "approve"); }} disabled={busy}>
                      <Check className="mr-1 h-4 w-4" /> Yes, I approve this high-risk action
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmId(null)} disabled={busy}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => decide(a, "approve")} disabled={busy}>
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                )
              ) : (
                <span className="text-xs text-destructive">
                  Blocked by policy — this action cannot be approved.
                </span>
              )}
              <Button size="sm" variant="destructive" onClick={() => decide(a, "reject")} disabled={busy}>
                <X className="mr-1 h-4 w-4" /> Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide(a, "request_changes")} disabled={busy}>
                <Pencil className="mr-1 h-4 w-4" /> Request changes
              </Button>
              {a.task_id && (
                <Link
                  href={`/tasks/${a.task_id}`}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  View task <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
