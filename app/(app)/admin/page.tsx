import { requireAdmin } from "@/lib/auth/guards";
import { createAdminSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/primitives";
import { configured } from "@/lib/env";
import { AdminErrors, type ErrorRow } from "@/components/admin/admin-errors";
import { AlertTriangle, Activity, MessageSquareWarning, FileWarning } from "lucide-react";

export const metadata = { title: "Admin · Aria" };

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_TIME_FORMATTER.format(date);
}

export default async function AdminPage() {
  await requireAdmin();

  if (!configured.supabaseAdmin) {
    return (
      <PageShell title="Admin" description="System health and failures.">
        <Card className="p-6 text-sm text-muted-foreground">
          The admin portal needs <code>SUPABASE_SERVICE_ROLE_KEY</code> to read system logs.
          Add it to your environment to enable this view.
        </Card>
      </PageShell>
    );
  }

  const admin = createAdminSupabase();
  const [errRes, unresolvedRes, failedDocsRes, feedbackRes, downFeedbackRes] = await Promise.all([
    admin.from("error_logs").select("*").order("created_at", { ascending: false }).limit(200),
    admin.from("error_logs").select("id", { count: "exact", head: true }).eq("resolved", false),
    admin.from("documents").select("id", { count: "exact", head: true }).eq("ingestion_status", "failed"),
    admin.from("feedback").select("id, rating, comment, created_at").order("created_at", { ascending: false }).limit(50),
    admin.from("feedback").select("id", { count: "exact", head: true }).eq("rating", "down"),
  ]);

  const errors = (errRes.data ?? []) as ErrorRow[];
  const feedback = feedbackRes.data ?? [];

  // Group error counts by feature area for a quick health view.
  const byArea = errors.reduce<Record<string, number>>((acc, e) => {
    acc[e.feature_area] = (acc[e.feature_area] ?? 0) + 1;
    return acc;
  }, {});

  const stats = [
    { label: "Unresolved errors", value: unresolvedRes.count ?? 0, icon: AlertTriangle },
    { label: "Failed ingestions", value: failedDocsRes.count ?? 0, icon: FileWarning },
    { label: "Errors (last 200)", value: errors.length, icon: Activity },
    { label: "Negative feedback", value: downFeedbackRes.count ?? 0, icon: MessageSquareWarning },
  ];

  return (
    <PageShell
      title="Admin"
      description="System health, failures, and feedback. Private content, secrets, and full prompts are never logged."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-5">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <p className="mt-3 text-2xl font-semibold">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </Card>
          );
        })}
      </div>

      {Object.keys(byArea).length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Errors by area</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byArea)
              .sort((a, b) => b[1] - a[1])
              .map(([area, count]) => (
                <span key={area} className="rounded-full border border-border bg-card px-3 py-1 text-xs">
                  <span className="font-medium">{area}</span>{" "}
                  <span className="text-muted-foreground">{count}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Error logs</h2>
        <AdminErrors initial={errors} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Recent feedback</h2>
        {feedback.length === 0 ? (
          <Card className="p-5 text-sm text-muted-foreground">No feedback yet.</Card>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {feedback.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className={f.rating === "up" ? "text-success" : "text-destructive"}>
                  {f.rating === "up" ? "👍" : "👎"}
                </span>
                <span className="flex-1 text-muted-foreground">
                  {f.comment || "(no comment)"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(f.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
