import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { ConnectionsClient, type ConnectionRow } from "@/components/connections/connections-client";
import { configured, env } from "@/lib/env";

export const metadata = { title: "Connections · Aria" };

export default async function ConnectionsPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("connections")
    .select("id, provider, status, account_label, updated_at")
    .eq("workspace_id", ctx.workspaceId);

  return (
    <PageShell
      title="Connections"
      description="Connect your apps so Aria can act for you. Sending, posting, and deleting always ask first."
    >
      {!configured.connectors && (
        <div className="mb-5 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-warning">Connectors not configured.</span> Add{" "}
          <code>COMPOSIO_API_KEY</code> and per-app auth-config ids to enable app connections.
        </div>
      )}
      <ConnectionsClient
        connectorsEnabled={configured.connectors}
        configuredProviders={{
          gmail: Boolean(env.composioGmailAuthConfigId),
          google_calendar: Boolean(env.composioGoogleCalendarAuthConfigId),
          google_drive: Boolean(env.composioGoogleDriveAuthConfigId),
          slack: Boolean(env.composioSlackAuthConfigId),
          notion: Boolean(env.composioNotionAuthConfigId),
          github: Boolean(env.composioGithubAuthConfigId),
          linear: Boolean(env.composioLinearAuthConfigId),
          jira: Boolean(env.composioJiraAuthConfigId),
          trello: Boolean(env.composioTrelloAuthConfigId),
          asana: Boolean(env.composioAsanaAuthConfigId),
          hubspot: Boolean(env.composioHubspotAuthConfigId),
          salesforce: Boolean(env.composioSalesforceAuthConfigId),
          outlook: Boolean(env.composioOutlookAuthConfigId),
        }}
        initial={(data ?? []) as ConnectionRow[]}
      />
    </PageShell>
  );
}
