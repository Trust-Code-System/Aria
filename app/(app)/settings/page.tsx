import { requireSession } from "@/lib/auth/guards";
import { PageShell } from "@/components/page-shell";
import { Card, Badge } from "@/components/ui/primitives";
import { env, configured } from "@/lib/env";
import { availableProviders, LATEST_CHAT_MODELS } from "@/lib/ai/providers";
import { researchProviderAvailable } from "@/lib/ai/research";
import { TOOL_REGISTRY } from "@/lib/ai/tools";
import { CheckCircle2, XCircle, ShieldAlert } from "lucide-react";

export const metadata = { title: "Settings · Aria" };

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      {ok ? (
        <span className="flex items-center gap-1 text-xs font-medium text-success">
          <CheckCircle2 className="h-4 w-4" /> Configured
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <XCircle className="h-4 w-4" /> Not set
        </span>
      )}
    </div>
  );
}

export default async function SettingsPage() {
  const ctx = await requireSession();
  const providers = availableProviders();

  return (
    <PageShell title="Settings" description="Account, providers, and integrations.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Account</h2>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{ctx.email}</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge tone={ctx.isAdmin ? "default" : "muted"}>{ctx.isAdmin ? "Admin" : "Member"}</Badge>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-muted-foreground">Environment</span>
              <Badge tone="muted">{env.appEnv}</Badge>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Model defaults</h2>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-muted-foreground">Chat model</span>
              <code className="text-xs">{env.defaultChatModel}</code>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-muted-foreground">Embedding model</span>
              <code className="text-xs">{env.defaultEmbeddingModel}</code>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-muted-foreground">Research model</span>
              <code className="text-xs">{env.defaultResearchModel}</code>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Current provider models used by Aria:</p>
          <div className="mt-2 space-y-1.5 text-xs">
            <ModelRow label="OpenAI" model={LATEST_CHAT_MODELS.openai} />
            <ModelRow label="Google Gemini" model={LATEST_CHAT_MODELS.google} />
            <ModelRow label="Anthropic Claude" model={LATEST_CHAT_MODELS.anthropic} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 font-semibold">LLM providers</h2>
          <p className="mb-2 text-xs text-muted-foreground">Configured via server environment variables.</p>
          <div className="divide-y divide-border">
            <StatusRow label="OpenAI" ok={providers.openai} />
            <StatusRow label="Anthropic" ok={providers.anthropic} />
            <StatusRow label="Google Generative AI" ok={providers.google} />
            <StatusRow label="Perplexity" ok={providers.perplexity} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Core services</h2>
          <p className="mb-2 text-xs text-muted-foreground">Required for storage, auth, and RAG.</p>
          <div className="divide-y divide-border">
            <StatusRow label="Supabase (auth + database)" ok={configured.supabase} />
            <StatusRow label="Service role (storage + admin)" ok={configured.supabaseAdmin} />
            <StatusRow label="Embeddings (RAG indexing)" ok={configured.embeddings} />
            <StatusRow
              label="Web research"
              ok={configured.research}
              detail={researchProviderAvailable() ? `via ${researchProviderAvailable()}` : "Perplexity or Tavily"}
            />
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <div className="mb-1 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Integrations & tools</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Aria's tool architecture is ready for these. Dangerous actions (send, delete, post, pay)
          require explicit confirmation before running. Most are deferred to a future version.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TOOL_REGISTRY.map((t) => (
            <div key={t.name} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="truncate text-xs text-muted-foreground">{t.description}</p>
              </div>
              <div className="ml-2 flex shrink-0 flex-col items-end gap-1">
                <Badge tone={t.enabled ? "success" : "muted"}>{t.enabled ? "Active" : "Soon"}</Badge>
                {t.dangerous && <Badge tone="warning">Confirm</Badge>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  );
}

function ModelRow({ label, model }: { label: string; model: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
      <span className="font-medium">{label}</span>
      <code className="text-right text-[11px] text-muted-foreground">{model}</code>
    </div>
  );
}
