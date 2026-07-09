"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, Repeat, Plus, X, Check, Loader2, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Input, Textarea, Label, Badge, Spinner } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { Markdown } from "@/components/chat/markdown";
import { useToast } from "@/components/ui/toast";
import { formatRelative } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface TeamInfo {
  key: string;
  name: string;
  description: string;
  steps: string[];
}
interface RunStep {
  name?: string;
  outputLabel?: string;
  output: string;
  iteration?: number;
  scores?: Record<string, number>;
  weakest?: string;
  pass?: boolean;
}

export function AgentsClient({
  teams,
  projects,
  recent,
}: {
  teams: TeamInfo[];
  projects: { id: string; name: string }[];
  recent: { id: string; kind: string; title: string; status: string; iterations: number; report_id: string | null; updated_at: string }[];
}) {
  const [tab, setTab] = React.useState<"teams" | "loops">("teams");

  return (
    <div className="space-y-8">
      <div className="flex gap-1 border-b border-border">
        <TabBtn active={tab === "teams"} onClick={() => setTab("teams")} icon={<Users className="h-4 w-4" />} label="Agent Teams" />
        <TabBtn active={tab === "loops"} onClick={() => setTab("loops")} icon={<Repeat className="h-4 w-4" />} label="Self-Checking Loops" />
      </div>

      {tab === "teams" ? (
        <TeamsPanel teams={teams} projects={projects} />
      ) : (
        <LoopsPanel projects={projects} />
      )}

      {recent.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Recent runs</h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                {r.kind === "pipeline" ? <Users className="h-4 w-4 text-muted-foreground" /> : <Repeat className="h-4 w-4 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.kind} · {r.iterations} steps · {formatRelative(r.updated_at)}
                  </p>
                </div>
                <Badge tone={r.status === "completed" ? "success" : r.status === "failed" ? "destructive" : "warning"}>{r.status}</Badge>
                {r.report_id && (
                  <Link href={`/reports/${r.report_id}`} className="text-xs text-primary hover:underline">
                    Open report
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shared runner: creates a run, then drives it step-by-step for live progress.
// ---------------------------------------------------------------------------
function useRunner() {
  const router = useRouter();
  const { error } = useToast();
  const [steps, setSteps] = React.useState<RunStep[]>([]);
  const [running, setRunning] = React.useState(false);
  const [current, setCurrent] = React.useState<string | null>(null);
  const [reportId, setReportId] = React.useState<string | null>(null);
  const [finished, setFinished] = React.useState(false);

  async function run(createBody: Record<string, unknown>, expectedSteps: number) {
    setSteps([]);
    setReportId(null);
    setFinished(false);
    setRunning(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const runId = data.run.id;

      let done = false;
      let guard = 0;
      while (!done && guard < expectedSteps + 2) {
        guard++;
        setCurrent(`Working… (step ${guard})`);
        const sres = await fetch("/api/agents/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        });
        const sdata = await sres.json();
        if (!sres.ok) throw new Error(sdata.error);
        setSteps(sdata.run.steps);
        done = sdata.done;
        if (done) {
          setReportId(sdata.run.report_id ?? null);
          setFinished(true);
        }
      }
      router.refresh();
    } catch (e) {
      error("Agent run failed", e instanceof Error ? e.message : undefined);
    } finally {
      setRunning(false);
      setCurrent(null);
    }
  }

  return { steps, running, current, reportId, finished, run, setSteps };
}

// ---------------------------------------------------------------------------
// Teams panel
// ---------------------------------------------------------------------------
function TeamsPanel({ teams, projects }: { teams: TeamInfo[]; projects: { id: string; name: string }[] }) {
  const [teamKey, setTeamKey] = React.useState(teams[0]?.key ?? "");
  const [topic, setTopic] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const runner = useRunner();
  const team = teams.find((t) => t.key === teamKey);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-1">
          {teams.map((t) => (
            <button
              key={t.key}
              onClick={() => setTeamKey(t.key)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                teamKey === t.key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
              )}
            >
              <p className="text-sm font-semibold">{t.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                {t.steps.map((s, i) => (
                  <span key={s} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-3 w-3" />}
                    <span className="rounded bg-muted px-1.5 py-0.5">{s.replace(" Agent", "")}</span>
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        <Card className="p-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Topic / brief</Label>
              <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. AI agents for small businesses" />
            </div>
            <div className="space-y-1.5">
              <Label>Project (optional)</Label>
              <Select
                value={projectId}
                onChange={setProjectId}
                options={[
                  { value: "", label: "None" },
                  ...projects.map((project) => ({ value: project.id, label: project.name })),
                ]}
              />
            </div>
            <Button
              className="w-full"
              disabled={runner.running || !topic.trim() || !team}
              onClick={() => runner.run({ kind: "pipeline", teamKey, topic, projectId: projectId || null }, team?.steps.length ?? 4)}
            >
              {runner.running ? <><Spinner /> Running team…</> : <><Users className="h-4 w-4" /> Run {team?.name}</>}
            </Button>
          </div>
        </Card>
      </div>

      <ProgressPanel
        title={team?.name ?? "Team"}
        stepNames={team?.steps ?? []}
        steps={runner.steps}
        running={runner.running}
        finished={runner.finished}
        reportId={runner.reportId}
        kind="pipeline"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loops panel
// ---------------------------------------------------------------------------
function LoopsPanel({ projects }: { projects: { id: string; name: string }[] }) {
  const [goal, setGoal] = React.useState("");
  const [criteria, setCriteria] = React.useState<string[]>(["", ""]);
  const [maxIterations, setMaxIterations] = React.useState(5);
  const [projectId, setProjectId] = React.useState("");
  const runner = useRunner();

  const cleanCriteria = criteria.map((c) => c.trim()).filter(Boolean);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="p-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Goal</Label>
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Write a 150-word cold email that books a demo" />
          </div>
          <div className="space-y-1.5">
            <Label>Success criteria (the checker scores each 1–10, needs 8+)</Label>
            {criteria.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input value={c} onChange={(e) => setCriteria((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Criterion ${i + 1}`} />
                {criteria.length > 1 && (
                  <button onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))} className="rounded-md p-2 text-muted-foreground hover:bg-muted">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {criteria.length < 8 && (
              <button onClick={() => setCriteria((cs) => [...cs, ""])} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="h-3 w-3" /> Add criterion
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Max iterations</Label>
              <Select
                value={String(maxIterations)}
                onChange={(next) => setMaxIterations(Number(next))}
                options={[3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: String(n) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={projectId}
                onChange={setProjectId}
                options={[
                  { value: "", label: "None" },
                  ...projects.map((project) => ({ value: project.id, label: project.name })),
                ]}
              />
            </div>
          </div>
          <Button
            className="w-full"
            disabled={runner.running || !goal.trim() || cleanCriteria.length === 0}
            onClick={() => runner.run({ kind: "loop", goal, criteria: cleanCriteria, maxIterations, projectId: projectId || null }, maxIterations)}
          >
            {runner.running ? <><Spinner /> Looping…</> : <><Repeat className="h-4 w-4" /> Run loop</>}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Stops when every criterion scores 8+ (a separate checker grades each pass) or after {maxIterations} iterations.
          </p>
        </div>
      </Card>

      <ProgressPanel title="Loop" stepNames={[]} steps={runner.steps} running={runner.running} finished={runner.finished} reportId={runner.reportId} kind="loop" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress / output panel (shared)
// ---------------------------------------------------------------------------
function ProgressPanel({
  title,
  stepNames,
  steps,
  running,
  finished,
  reportId,
  kind,
}: {
  title: string;
  stepNames: string[];
  steps: RunStep[];
  running: boolean;
  finished: boolean;
  reportId: string | null;
  kind: "pipeline" | "loop";
}) {
  if (steps.length === 0 && !running) {
    return (
      <Card className="flex min-h-[300px] items-center justify-center p-8 text-center">
        <div>
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {kind === "pipeline" ? <Users className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
          </div>
          <p className="text-sm font-medium">Configure and run on the left</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {kind === "pipeline" ? "Each agent's output feeds the next. The final result is saved as a report." : "The loop iterates until it clears your bar, then saves the result as a report."}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {kind === "pipeline" && stepNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {stepNames.map((name, i) => {
            const state = i < steps.length ? "done" : i === steps.length && running ? "active" : "pending";
            return (
              <span
                key={name}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                  state === "done" && "border-success/40 bg-success/10 text-success",
                  state === "active" && "border-primary/40 bg-primary/10 text-primary",
                  state === "pending" && "border-border text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="h-3 w-3" /> : state === "active" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {name.replace(" Agent", "")}
              </span>
            );
          })}
        </div>
      )}

      {steps.map((s, i) => (
        <Card key={i} className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{s.name ?? `Iteration ${s.iteration}`}</p>
            {kind === "loop" && s.scores && (
              <div className="flex flex-wrap items-center gap-1">
                {Object.entries(s.scores).map(([k, v]) => (
                  <Badge key={k} tone={v >= 8 ? "success" : v >= 5 ? "warning" : "destructive"} title={k}>
                    {v}/10
                  </Badge>
                ))}
                {s.pass && <Badge tone="success"><Check className="h-3 w-3" /> pass</Badge>}
              </div>
            )}
          </div>
          {kind === "loop" && s.weakest && !s.pass && (
            <p className="mb-2 text-xs text-muted-foreground">Next fix: {s.weakest}</p>
          )}
          <div className="max-h-72 overflow-y-auto rounded-lg bg-muted/40 p-3 scrollbar-thin">
            <Markdown content={s.output} />
          </div>
        </Card>
      ))}

      {running && (
        <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Working on the next step…
        </div>
      )}

      {finished && (
        <div className="flex items-center justify-between rounded-lg border border-success/40 bg-success/5 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <Check className="h-4 w-4" /> Done — final output saved as a report.
          </p>
          {reportId && (
            <Link href={`/reports/${reportId}`}>
              <Button size="sm" variant="outline"><FileText className="h-4 w-4" /> Open report</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
