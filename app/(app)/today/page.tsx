import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckSquare,
  FileText,
  Inbox,
  ListTodo,
  Sparkles,
  Users,
} from "lucide-react";

import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { Card, Badge } from "@/components/ui/primitives";
import { RISK_LABELS, type RiskLevel } from "@/lib/agent/types";

export const metadata = { title: "Today · Aria" };
export const dynamic = "force-dynamic";

/**
 * The daily briefing: everything that needs Jesse's attention, in one place,
 * computed deterministically from workspace data (no model call, no cost).
 * Every section degrades to a designed empty state.
 */
export default async function TodayPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [approvals, tasks, followUps, suggestedMemories, recentDocs] = await Promise.all([
    supabase
      .from("approvals")
      .select("id, summary, risk_level, action_type, created_at, task_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("agent_tasks")
      .select("id, title, status, current_step, max_steps, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .in("status", ["queued", "running", "waiting_for_approval"])
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("contacts")
      .select("id, name, company, follow_up_at")
      .eq("workspace_id", ctx.workspaceId)
      .not("follow_up_at", "is", null)
      .lte("follow_up_at", endOfToday.toISOString())
      .order("follow_up_at", { ascending: true })
      .limit(5),
    supabase
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .eq("approval_status", "suggested"),
    supabase
      .from("documents")
      .select("id, filename, ingestion_status, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const pendingApprovals = approvals.data ?? [];
  const activeTasks = tasks.data ?? [];
  const dueFollowUps = followUps.data ?? [];
  const suggestedCount = suggestedMemories.count ?? 0;
  const docs = recentDocs.data ?? [];

  const dateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const needsAttention = pendingApprovals.length + dueFollowUps.length;

  return (
    <PageShell
      title="Today"
      description={`${dateLabel} — ${
        needsAttention > 0
          ? `${needsAttention} thing${needsAttention === 1 ? "" : "s"} need${needsAttention === 1 ? "s" : ""} your attention.`
          : "Nothing is waiting on you right now."
      }`}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Approvals waiting */}
        <Card className="p-5">
          <SectionHeader
            icon={<Inbox className="h-4 w-4 text-primary" />}
            title="Approvals waiting"
            href="/approvals"
            count={pendingApprovals.length}
          />
          {pendingApprovals.length === 0 ? (
            <EmptyNote text="No actions are waiting for your yes." />
          ) : (
            <ul className="mt-3 space-y-2">
              {pendingApprovals.map((a) => (
                <li key={a.id}>
                  <Link
                    href="/approvals"
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition hover:border-primary/40"
                  >
                    <span className="min-w-0 truncate text-sm">{a.summary}</span>
                    <Badge tone={(a.risk_level as number) >= 3 ? "destructive" : "warning"}>
                      {RISK_LABELS[(a.risk_level as RiskLevel) ?? 2]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Tasks in flight */}
        <Card className="p-5">
          <SectionHeader
            icon={<ListTodo className="h-4 w-4 text-primary" />}
            title="Tasks in flight"
            href="/tasks"
            count={activeTasks.length}
          />
          {activeTasks.length === 0 ? (
            <EmptyNote text="No agent tasks are running. Delegate one from chat or /tasks." />
          ) : (
            <ul className="mt-3 space-y-2">
              {activeTasks.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tasks/${t.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition hover:border-primary/40"
                  >
                    <span className="min-w-0 truncate text-sm">{t.title}</span>
                    <Badge tone={t.status === "waiting_for_approval" ? "warning" : "muted"}>
                      {t.status === "waiting_for_approval"
                        ? "needs you"
                        : `step ${t.current_step}/${t.max_steps}`}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Follow-ups due */}
        <Card className="p-5">
          <SectionHeader
            icon={<Users className="h-4 w-4 text-primary" />}
            title="Follow-ups due"
            href="/contacts"
            count={dueFollowUps.length}
          />
          {dueFollowUps.length === 0 ? (
            <EmptyNote text="No contact follow-ups due today." />
          ) : (
            <ul className="mt-3 space-y-2">
              {dueFollowUps.map((c) => (
                <li key={c.id}>
                  <Link
                    href="/contacts"
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition hover:border-primary/40"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {c.name}
                      {c.company ? <span className="text-muted-foreground"> · {c.company}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {new Date(c.follow_up_at as string).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Review queue + recent knowledge */}
        <Card className="p-5">
          <SectionHeader
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            title="Review queue"
            href="/memory"
            count={suggestedCount}
          />
          {suggestedCount === 0 ? (
            <EmptyNote text="No suggested memories to review." />
          ) : (
            <Link
              href="/memory"
              className="mt-3 flex items-center justify-between rounded-lg border border-border p-3 transition hover:border-primary/40"
            >
              <span className="text-sm">
                {suggestedCount} suggested memor{suggestedCount === 1 ? "y" : "ies"} awaiting your approval
              </span>
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <SectionHeader
              icon={<FileText className="h-4 w-4 text-primary" />}
              title="Recently added knowledge"
              href="/knowledge"
              count={docs.length}
            />
            {docs.length === 0 ? (
              <EmptyNote text="No documents yet — drop files on /knowledge." />
            ) : (
              <ul className="mt-3 space-y-1.5">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{d.filename}</span>
                    <Badge tone={d.ingestion_status === "completed" ? "success" : "muted"}>
                      {d.ingestion_status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function SectionHeader({
  icon,
  title,
  href,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold">{title}</h2>
        {count > 0 && <Badge tone="muted">{count}</Badge>}
      </div>
      <Link href={href} className="text-xs font-medium text-primary hover:underline">
        Open →
      </Link>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="mt-3 text-sm text-muted-foreground">{text}</p>;
}
