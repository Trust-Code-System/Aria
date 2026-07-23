"use client";

import * as React from "react";
import { Activity, Wrench } from "lucide-react";

import { Badge, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type ReachabilityState =
  | "reachable"
  | "rate_limited"
  | "auth_failed"
  | "unreachable"
  | "not_configured";

interface ProviderReachability {
  provider: string;
  label: string;
  state: ReachabilityState;
  httpStatus?: number;
  detail?: string;
  toolCapable: boolean;
}

const STATE_META: Record<
  ReachabilityState,
  { tone: "success" | "warning" | "destructive" | "muted"; text: string }
> = {
  reachable: { tone: "success", text: "Reachable" },
  rate_limited: { tone: "warning", text: "Rate-limited / over quota" },
  auth_failed: { tone: "destructive", text: "Auth failed" },
  unreachable: { tone: "destructive", text: "Unreachable" },
  not_configured: { tone: "muted", text: "Not configured" },
};

/**
 * On-demand provider reachability. Not credits-remaining (providers don't expose
 * that) — a live minimal call that shows reachable / over-quota / auth-failed /
 * down. It is exactly the signal that explains a failed connected-app action:
 * both tool-capable providers over quota means no tool turn can run.
 */
export function ProviderReachability() {
  const { error } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [rows, setRows] = React.useState<ProviderReachability[] | null>(null);
  const [checkedAt, setCheckedAt] = React.useState<string | null>(null);

  async function check() {
    setBusy(true);
    try {
      const res = await fetch("/api/providers/reachability", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reachability check failed.");
      setRows(data.providers ?? []);
      setCheckedAt(data.checkedAt ?? null);
    } catch (e) {
      error("Could not check providers", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const toolCapableUp = rows?.some((r) => r.toolCapable && r.state === "reachable");
  const anyToolCapable = rows?.some((r) => r.toolCapable);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Live reachability</p>
          <p className="text-xs text-muted-foreground">
            A minimal live call per provider — not credits remaining, which providers don&apos;t expose.
          </p>
        </div>
        <button
          type="button"
          onClick={check}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium transition hover:border-primary/40 disabled:opacity-50"
        >
          {busy ? <Spinner /> : <Activity className="h-3.5 w-3.5" />} Check now
        </button>
      </div>

      {rows && (
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => {
            const meta = STATE_META[r.state];
            return (
              <div key={r.provider} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  {r.label}
                  {r.toolCapable && (
                    <span title="Can run connected-app (tool) turns">
                      <Wrench className="h-3 w-3 text-muted-foreground" />
                    </span>
                  )}
                </span>
                <Badge tone={meta.tone}>{meta.text}</Badge>
              </div>
            );
          })}

          {anyToolCapable && !toolCapableUp && (
            <p className="mt-2 rounded-lg border border-warning/40 bg-warning/5 p-2 text-xs text-muted-foreground">
              No tool-capable provider is reachable right now — connected-app actions (e.g. sending
              email) can&apos;t run until OpenAI or Anthropic is back. Add credits to one of them.
            </p>
          )}
          {checkedAt && (
            <p className="pt-1 text-[11px] text-muted-foreground">
              Checked {new Date(checkedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
