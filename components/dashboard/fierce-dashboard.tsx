"use client";

import * as React from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  Plus,
  ArrowUpRight,
  MessageSquare,
  BookOpen,
  Bot,
  Mail,
  Check,
  FileUp,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { isUsableConnectionStatus } from "@/lib/connectors/status";

interface Metrics {
  projects: number;
  documents: number;
  chunks: number;
  memories: number;
  reports: number;
  conversations: number;
  agentRuns: number;
  messages: number;
}
interface Props {
  name: string;
  metrics: Metrics;
  series: { date: string; count: number }[];
  recent: { id: string; title: string; mode: string; updated_at: string }[];
  gmail: { status: string; label: string | null } | null;
}

const RANGES = ["1D", "7D", "6M", "YTD", "1Y", "5Y", "All"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

function formatChartDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return `${MONTHS[month - 1]} ${day}`;
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

export function FierceDashboard({ name, metrics, series, recent, gmail }: Props) {
  const [range, setRange] = React.useState("7D");
  const [hidden, setHidden] = React.useState(false);

  const windowed = range === "7D" || range === "1D" ? series.slice(-7) : series;
  const totalMsgs = metrics.messages;
  const weekMsgs = series.slice(-7).reduce((a, b) => a + b.count, 0);

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-7 sm:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">
            Hi {name}, <span className="align-middle">👋</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Welcome back — here’s what’s happening in your workspace today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/chat"
            className="glass glass-hover flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
          >
            New chat
          </Link>
          <Link
            href="/chat"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90"
            aria-label="New chat"
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* MAIN COLUMN */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* Hero: activity */}
          <div className="glass rounded-3xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Workspace activity
                  <button onClick={() => setHidden((v) => !v)} aria-label="toggle" className="opacity-70 hover:opacity-100">
                    {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  {hidden ? "••••" : formatNumber(totalMsgs)}{" "}
                  <span className="text-base font-normal text-muted-foreground">messages</span>
                </div>
                <div className="mt-0.5 text-sm font-medium text-success">
                  +{weekMsgs} this week
                </div>
              </div>
              <div className="flex flex-wrap gap-1 rounded-full glass p-1">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <AreaChart data={windowed} />

            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Messages across your chats · Projects + Agents
            </div>
          </div>

          {/* Two stat cards */}
          <div className="grid gap-5 sm:grid-cols-2">
            <StatCard
              label="Knowledge base"
              value={metrics.documents}
              unit="documents"
              sub={`${formatNumber(metrics.chunks)} chunks indexed`}
              cta="Add files"
              href="/knowledge"
              icon={<BookOpen className="h-4 w-4" />}
            />
            <StatCard
              label="Agents"
              value={metrics.agentRuns}
              unit="runs"
              sub="Teams & self-checking loops"
              cta="Run a team"
              href="/agents"
              icon={<Bot className="h-4 w-4" />}
            />
          </div>

          {/* Recent chats */}
          <div className="glass rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recent chats</h2>
              <Link href="/chat" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">Your latest conversations</p>
            {recent.length === 0 ? (
              <Link
                href="/chat"
                className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-8 text-sm text-muted-foreground hover:text-foreground"
              >
                <MessageSquare className="h-4 w-4" /> Start your first chat
              </Link>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {recent.map((c) => (
                  <Link key={c.id} href={`/chat/${c.id}`} className="glass glass-hover rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <MessageSquare className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <p className="text-xs capitalize text-muted-foreground">{c.mode} mode</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{formatDate(c.updated_at)}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex w-full flex-col gap-5 lg:w-[360px]">
          {/* Connect banner */}
          {isUsableConnectionStatus(gmail?.status) ? (
            <div className="glass flex items-center gap-3 rounded-3xl p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15 text-success">
                <Check className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Gmail connected</p>
                <p className="truncate text-xs text-muted-foreground">{gmail?.label ?? "Ready for triage"}</p>
              </div>
              <Link href="/connections" className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground">
                Manage
              </Link>
            </div>
          ) : (
            <div className="glass flex items-center gap-3 rounded-3xl p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Mail className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Connect Gmail</p>
                <p className="truncate text-xs text-muted-foreground">Let Aria triage your inbox</p>
              </div>
              <Link
                href="/connections"
                className="ml-auto rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Connect
              </Link>
            </div>
          )}

          {/* Breakdown donut */}
          <BreakdownCard metrics={metrics} />

          {/* Quick actions */}
          <div className="glass rounded-3xl p-6">
            <h2 className="mb-3 font-semibold">Do next</h2>
            <div className="space-y-2">
              <ActionRow href="/chat" icon={<MessageSquare className="h-4 w-4" />} label="Start a chat" />
              <ActionRow href="/knowledge" icon={<FileUp className="h-4 w-4" />} label="Upload a document" />
              <ActionRow href="/agents" icon={<Bot className="h-4 w-4" />} label="Run an agent team" />
              <ActionRow href="/connections" icon={<Mail className="h-4 w-4" />} label="Connect an app" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  sub,
  cta,
  href,
  icon,
}: {
  label: string;
  value: number;
  unit: string;
  sub: string;
  cta: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">
        {formatNumber(value)} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
      >
        {cta} <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function ActionRow({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="glass-hover flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <span className="font-medium">{label}</span>
      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

// --- Real activity area chart (pure SVG) -----------------------------------
function AreaChart({ data }: { data: { date: string; count: number }[] }) {
  const W = 640;
  const H = 180;
  const pad = 16;
  const n = Math.max(data.length, 2);
  const max = Math.max(1, ...data.map((d) => d.count));
  const pts = data.map((d, i) => {
    const x = pad + (i / (n - 1)) * (W - pad * 2);
    const y = H - pad - (d.count / max) * (H - pad * 2);
    return [x, y] as const;
  });
  if (pts.length < 2) pts.push([W - pad, H - pad]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${H - pad} L ${pts[0][0].toFixed(1)} ${H - pad} Z`;
  const peakIdx = data.reduce((best, d, i) => (d.count > data[best].count ? i : best), 0);
  const peak = pts[peakIdx];

  return (
    <div className="mt-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6d5cff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#6d5cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaFill)" />
        <path d={line} fill="none" stroke="#6d5cff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {peak && (
          <>
            <circle cx={peak[0]} cy={peak[1]} r="4" fill="#ffffff" stroke="#6d5cff" strokeWidth="2" />
            <circle cx={peak[0]} cy={peak[1]} r="8" fill="#6d5cff" fillOpacity="0.18" />
          </>
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        {data
          .filter((_, i) => i % Math.ceil(data.length / 5) === 0)
          .map((d) => (
            <span key={d.date}>{formatChartDate(d.date)}</span>
          ))}
      </div>
    </div>
  );
}

// --- Real workspace breakdown donut (pure SVG) -----------------------------
function BreakdownCard({ metrics }: { metrics: Metrics }) {
  const segs = [
    { label: "Projects", value: metrics.projects, color: "#6d5cff" },
    { label: "Documents", value: metrics.documents, color: "#f59e0b" },
    { label: "Memories", value: metrics.memories, color: "#22c55e" },
    { label: "Reports", value: metrics.reports, color: "#ef4444" },
  ];
  const total = segs.reduce((a, s) => a + s.value, 0);
  const r = 52;
  const C = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="font-semibold">Workspace breakdown</h2>
      <p className="text-xs text-muted-foreground">Everything Aria is tracking for you</p>
      <div className="mt-4 flex items-center gap-6">
        <div className="relative h-[136px] w-[136px] shrink-0">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
            <circle cx="64" cy="64" r={r} fill="none" stroke="hsl(240 6% 90%)" strokeWidth="14" />
            {total > 0 &&
              segs.map((s) => {
                const len = (s.value / total) * C;
                const el = (
                  <circle
                    key={s.label}
                    cx="64"
                    cy="64"
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="14"
                    strokeDasharray={`${len} ${C - len}`}
                    strokeDashoffset={-acc}
                  />
                );
                acc += len;
                return el;
              })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold">{total}</span>
            <span className="text-[11px] text-muted-foreground">items</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          {segs.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-medium">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
      <Link
        href="/knowledge"
        className="mt-5 flex items-center justify-center gap-1.5 rounded-full glass glass-hover py-2.5 text-sm font-medium"
      >
        Open knowledge <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
