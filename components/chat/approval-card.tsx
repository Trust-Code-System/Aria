"use client";

import * as React from "react";
import { Check, Loader2, Pencil, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";

type ApprovalDetails = {
  approval: {
    id: string;
    status: string;
    summary: string;
    action_type: string;
    risk_level: number;
    tool_name: string | null;
    safe_metadata: Record<string, unknown> | null;
    expires_at: string | null;
  };
  receipt: {
    provider: string | null;
    destination: string | null;
    subject: string | null;
    provider_reference: string | null;
    status: string;
    error_message: string | null;
  } | null;
};

export function ApprovalCard({ approvalId, summary }: { approvalId: string; summary: string }) {
  const [details, setDetails] = React.useState<ApprovalDetails | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [confirmHighRisk, setConfirmHighRisk] = React.useState(false);
  const [localStatus, setLocalStatus] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState({ to: "", subject: "", body: "" });

  const load = React.useCallback(async () => {
    const response = await fetch(`/api/approvals/${approvalId}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load approval details.");
    setDetails(data);
    const safe = (data.approval?.safe_metadata ?? {}) as Record<string, unknown>;
    setFields({
      to: typeof safe.to === "string" ? safe.to : "",
      subject: typeof safe.subject === "string" ? safe.subject : "",
      body: typeof safe.body_preview === "string" ? safe.body_preview : "",
    });
  }, [approvalId]);

  React.useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load approval."));
  }, [load]);

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    if (decision === "approve") setLocalStatus("executing");
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update this approval.");
      await load();
      setLocalStatus(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this approval.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save the edits.");
      setEditing(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the edits.");
    } finally {
      setBusy(false);
    }
  }

  const status = localStatus ?? details?.approval.status ?? "pending";
  const pending = status === "pending";
  const safe = details?.approval.safe_metadata ?? {};
  const isEmail = Boolean(safe.to || safe.subject);

  return (
    <section className="mt-3 rounded-2xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm dark:border-amber-700/50 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{details?.approval.summary || summary}</p>
            <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
              {status.replace("_", " ")}
            </span>
          </div>
          {pending && <p className="mt-1 text-xs text-muted-foreground">Nothing has been sent or changed yet.</p>}
          {status === "executing" && <p className="mt-1 text-xs text-muted-foreground">Executing the exact locked action with the connected providerâ€¦</p>}

          {details && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-background/70 p-3 text-xs">
              <div><dt className="text-muted-foreground">Application</dt><dd className="font-medium">{details.approval.tool_name?.split("_")[0] || "Connected app"}</dd></div>
              <div><dt className="text-muted-foreground">Action</dt><dd className="font-medium">{details.approval.action_type.replace(/_/g, " ")}</dd></div>
              <div><dt className="text-muted-foreground">Risk</dt><dd className="font-medium">Level {details.approval.risk_level}</dd></div>
              <div><dt className="text-muted-foreground">Connection</dt><dd className="font-medium">Verified when prepared</dd></div>
            </dl>
          )}

          {editing ? (
            <div className="mt-3 space-y-2">
              <Input aria-label="Recipient" placeholder="Recipient" value={fields.to} onChange={(event) => setFields((value) => ({ ...value, to: event.target.value }))} />
              <Input aria-label="Subject" placeholder="Subject" value={fields.subject} onChange={(event) => setFields((value) => ({ ...value, subject: event.target.value }))} />
              <Textarea aria-label="Body" placeholder="Body" value={fields.body} onChange={(event) => setFields((value) => ({ ...value, body: event.target.value }))} />
            </div>
          ) : isEmail ? (
            <dl className="mt-3 grid gap-1 rounded-xl bg-background/70 p-3 text-xs">
              {typeof safe.to === "string" && safe.to && <div><dt className="inline font-medium">To: </dt><dd className="inline">{safe.to}</dd></div>}
              {typeof safe.subject === "string" && safe.subject && <div><dt className="inline font-medium">Subject: </dt><dd className="inline">{safe.subject}</dd></div>}
              {typeof safe.body_preview === "string" && safe.body_preview && <div><dt className="inline font-medium">Preview: </dt><dd className="inline">{safe.body_preview}</dd></div>}
            </dl>
          ) : null}

          {details?.receipt && (
            <div className={`mt-3 rounded-xl p-3 text-xs ${details.receipt.status === "succeeded" ? "bg-emerald-100/70 dark:bg-emerald-950/30" : "bg-red-100/70 dark:bg-red-950/30"}`}>
              <p className="font-medium">{details.receipt.status === "succeeded" ? "Provider-confirmed receipt" : "Execution failed"}</p>
              {details.receipt.provider_reference && <p className="mt-1 break-all">Reference: {details.receipt.provider_reference}</p>}
              {details.receipt.error_message && <p className="mt-1">{details.receipt.error_message}</p>}
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}

          {pending && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={confirmHighRisk ? "destructive" : "default"}
                onClick={() =>
                  (details?.approval.risk_level ?? 0) >= 3 && !confirmHighRisk
                    ? setConfirmHighRisk(true)
                    : void decide("approve")
                }
                disabled={busy}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {confirmHighRisk ? "Confirm high-risk action" : "Approve and run"}
              </Button>
              {isEmail && (
                <Button size="sm" variant="secondary" onClick={() => editing ? void saveEdits() : setEditing(true)} disabled={busy}>
                  <Pencil className="h-3.5 w-3.5" /> {editing ? "Save edits" : "Edit"}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => confirmHighRisk ? setConfirmHighRisk(false) : void decide("reject")} disabled={busy}>
                <X className="h-3.5 w-3.5" /> {confirmHighRisk ? "Back" : "Reject"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
