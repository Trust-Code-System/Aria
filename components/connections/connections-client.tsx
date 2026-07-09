"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plug, Check, Trash2, Inbox, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Badge, Spinner, Textarea, Input, Label } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export interface ConnectionRow {
  id: string;
  provider: string;
  status: string;
  account_label: string | null;
  updated_at: string;
}

interface TriagedEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  priority: "high" | "medium" | "low";
  reason: string;
  suggestedReply: string | null;
}

interface IntegrationApp {
  provider: string;
  name: string;
  logo: string;
  logoUrl: string;
  desc: string;
  category: string;
  accent: string;
}

const APPS: IntegrationApp[] = [
  { provider: "gmail", name: "Gmail", logo: "M", logoUrl: "https://cdn.simpleicons.org/gmail", category: "Email", accent: "#ea4335", desc: "Read, triage, draft, and send email with confirmation." },
  { provider: "google_drive", name: "Google Drive", logo: "D", logoUrl: "https://cdn.simpleicons.org/googledrive", category: "Files", accent: "#34a853", desc: "Search files, reference docs, and pull workspace context." },
  { provider: "slack", name: "Slack", logo: "S", logoUrl: "https://api.iconify.design/logos:slack-icon.svg", category: "Team chat", accent: "#611f69", desc: "Summarize channels, draft replies, and prepare updates." },
  { provider: "notion", name: "Notion", logo: "N", logoUrl: "https://cdn.simpleicons.org/notion", category: "Knowledge", accent: "#f4efe6", desc: "Read pages, create notes, and organize project knowledge." },
  { provider: "github", name: "GitHub", logo: "GH", logoUrl: "https://cdn.simpleicons.org/github", category: "Code", accent: "#c9c2b7", desc: "Inspect issues, pull requests, repositories, and release notes." },
  { provider: "linear", name: "Linear", logo: "L", logoUrl: "https://cdn.simpleicons.org/linear", category: "Issues", accent: "#8b5cf6", desc: "Create, search, and update product and engineering issues." },
  { provider: "jira", name: "Jira", logo: "J", logoUrl: "https://cdn.simpleicons.org/jira", category: "Issues", accent: "#2684ff", desc: "Track tickets, sprint work, blockers, and project status." },
  { provider: "trello", name: "Trello", logo: "T", logoUrl: "https://cdn.simpleicons.org/trello", category: "Boards", accent: "#0079bf", desc: "Read boards and turn cards into actionable plans." },
  { provider: "asana", name: "Asana", logo: "A", logoUrl: "https://cdn.simpleicons.org/asana", category: "Tasks", accent: "#f06a6a", desc: "Coordinate tasks, projects, owners, and due dates." },
  { provider: "hubspot", name: "HubSpot", logo: "H", logoUrl: "https://cdn.simpleicons.org/hubspot", category: "CRM", accent: "#ff7a59", desc: "Review contacts, deals, notes, and customer follow-ups." },
  { provider: "salesforce", name: "Salesforce", logo: "SF", logoUrl: "https://api.iconify.design/logos:salesforce.svg", category: "CRM", accent: "#00a1e0", desc: "Bring account, opportunity, and pipeline context into Aria." },
  { provider: "outlook", name: "Outlook", logo: "O", logoUrl: "https://api.iconify.design/simple-icons:microsoftoutlook.svg", category: "Email", accent: "#0078d4", desc: "Triage Microsoft mail and prepare confirmed replies." },
];

export function ConnectionsClient({
  connectorsEnabled,
  configuredProviders,
  initial,
}: {
  connectorsEnabled: boolean;
  configuredProviders: Record<string, boolean>;
  initial: ConnectionRow[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { success, error } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const byProvider = React.useMemo(() => {
    const m: Record<string, ConnectionRow> = {};
    for (const c of initial) m[c.provider] = c;
    return m;
  }, [initial]);

  // Surface the OAuth callback result.
  React.useEffect(() => {
    const status = params.get("status");
    if (!status) return;
    if (status === "connected") success("Connected", "Your account is linked.");
    else if (status === "error") error("Connection failed", "Please try connecting again.");
    // clear the query params
    router.replace("/connections");
  }, [params, router, success, error]);

  async function connect(provider: string) {
    setBusy(provider);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.redirectUrl) throw new Error("No authorization URL returned.");

      // Open Composio's hosted consent page in a new tab, then poll for activation.
      window.open(data.redirectUrl, "_blank", "noopener,noreferrer");
      success("Authorize in the new tab", "Waiting for you to connect…");
      pollUntilConnected(provider);
    } catch (e) {
      error("Could not start connection", e instanceof Error ? e.message : undefined);
      setBusy(null);
    }
  }

  async function pollUntilConnected(provider: string) {
    // Poll up to ~2.5 min for the user to finish OAuth.
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch("/api/connections/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        const data = await res.json();
        if (res.ok && data.status === "active") {
          success("Connected", `${provider} is linked.`);
          setBusy(null);
          router.refresh();
          return;
        }
        if (res.ok && data.status === "error") {
          error("Connection failed", "Authorization did not complete.");
          setBusy(null);
          router.refresh();
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    setBusy(null);
    router.refresh();
  }

  async function disconnect(id: string) {
    if (!confirm("Disconnect this account?")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/connections?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      success("Disconnected");
      router.refresh();
    } catch (e) {
      error("Could not disconnect", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const gmail = byProvider["gmail"];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {APPS.map((app) => {
          const conn = byProvider[app.provider];
          const active = conn?.status === "active";
          const configured = Boolean(configuredProviders[app.provider]);
          const canConnect = connectorsEnabled && configured;
          return (
            <Card key={app.provider} className="group p-5 transition hover:-translate-y-0.5 hover:border-primary/35">
              <div className="flex items-start justify-between">
                <LogoMark app={app} />
                {conn ? (
                  <Badge tone={active ? "success" : conn.status === "pending" ? "warning" : "destructive"}>
                    {conn.status}
                  </Badge>
                ) : !configured ? (
                  <Badge tone="warning">Setup needed</Badge>
                ) : (
                  <Badge tone="muted">Not connected</Badge>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <h3 className="font-semibold">{app.name}</h3>
                <span className="rounded-full border border-outline-variant bg-surface-container-low px-2 py-0.5 text-[11px] text-muted-foreground">
                  {app.category}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{app.desc}</p>
              {conn?.account_label && (
                <p className="mt-1 text-xs text-muted-foreground">{conn.account_label}</p>
              )}
              <div className="mt-4 flex gap-2">
                {active ? (
                  <Button variant="outline" size="sm" onClick={() => disconnect(conn.id)} disabled={busy === conn.id}>
                    {busy === conn.id ? <Spinner /> : <Trash2 className="h-4 w-4" />} Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => connect(app.provider)}
                    disabled={!canConnect || busy === app.provider}
                  >
                    {busy === app.provider ? <Spinner /> : <Plug className="h-4 w-4" />} Connect
                  </Button>
                )}
                {!canConnect && !active && (
                  <span className="self-center text-xs text-muted-foreground">
                    {connectorsEnabled ? "Add auth config" : "Add Composio key"}
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Cowork: email triage — only when Gmail is active */}
      {gmail?.status === "active" && <EmailTriage />}
    </div>
  );
}

function LogoMark({ app }: { app: IntegrationApp }) {
  const [failed, setFailed] = React.useState(false);

  return (
    <div
      className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-surface-container-high p-2 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,248,236,0.18)]"
      style={{
        boxShadow: `0 14px 30px ${app.accent}22, inset 0 1px 0 rgba(255,248,236,0.18)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background: `radial-gradient(circle at 28% 20%, rgba(255,255,255,0.55), transparent 26%), linear-gradient(135deg, ${app.accent}, rgba(48,44,37,0.92))`,
        }}
      />
      {failed ? (
        <span className="relative tracking-tight drop-shadow">{app.logo}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={app.logoUrl}
          alt={`${app.name} logo`}
          className="relative h-7 w-7 object-contain drop-shadow"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function EmailTriage() {
  const { success, error } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [emails, setEmails] = React.useState<TriagedEmail[] | null>(null);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/cowork/email-triage", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmails(data.emails);
    } catch (e) {
      error("Triage failed", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Email triage</h2>
        </div>
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? <><Spinner /> Reading inbox…</> : "Triage my inbox"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Aria reads your recent inbox, prioritizes it, and drafts replies. Nothing is sent without your confirmation.
      </p>

      {emails && emails.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No recent emails to triage.</p>
      )}

      {emails && emails.length > 0 && (
        <div className="mt-4 space-y-2">
          {emails.map((e) => (
            <EmailRow key={e.id} email={e} onSent={() => success("Email sent")} />
          ))}
        </div>
      )}
    </Card>
  );
}

function EmailRow({ email, onSent }: { email: TriagedEmail; onSent: () => void }) {
  const { error, success } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reply, setReply] = React.useState(email.suggestedReply ?? "");
  const [to, setTo] = React.useState(extractEmail(email.from));
  const [subject, setSubject] = React.useState("Re: " + email.subject);
  const [busy, setBusy] = React.useState(false);
  const [confirmSend, setConfirmSend] = React.useState(false);

  async function act(action: "draft" | "send") {
    if (action === "send" && !confirmSend) {
      setConfirmSend(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/cowork/email-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, to, subject, body: reply, confirmed: action === "send" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (action === "send") { onSent(); setOpen(false); }
      else success("Draft saved to Gmail");
      setConfirmSend(false);
    } catch (e) {
      error(action === "send" ? "Send failed" : "Draft failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const tone = email.priority === "high" ? "destructive" : email.priority === "medium" ? "warning" : "muted";

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={tone as any}>{email.priority}</Badge>
            <p className="truncate text-sm font-medium">{email.subject}</p>
          </div>
          <p className="truncate text-xs text-muted-foreground">{email.from}</p>
          {email.reason && <p className="mt-1 text-xs text-muted-foreground">{email.reason}</p>}
        </div>
        {email.suggestedReply && (
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Reply"}
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1"><Label>To</Label><Input value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="space-y-1"><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Reply</Label><Textarea value={reply} onChange={(e) => setReply(e.target.value)} className="min-h-[100px]" /></div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => act("draft")} disabled={busy}>
              {busy ? <Spinner /> : null} Save draft
            </Button>
            <Button size="sm" onClick={() => act("send")} disabled={busy} className={cn(confirmSend && "bg-destructive hover:bg-destructive/90")}>
              {busy ? <Spinner /> : confirmSend ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {confirmSend ? "Confirm send" : "Send"}
            </Button>
            {confirmSend && (
              <span className="text-xs text-muted-foreground">Click again to actually send this email.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return m ? m[1] : from.trim();
}
