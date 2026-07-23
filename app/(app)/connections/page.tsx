import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { ConnectionsClient, type ConnectionRow } from "@/components/connections/connections-client";
import { configured, env } from "@/lib/env";
import { resolveStoredCapabilities } from "@/lib/connectors/capabilities-shared";

export const metadata = { title: "Connections · Aria" };
export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("connections")
    .select("id, provider, status, account_label, updated_at, scopes, capabilities, last_validated_at")
    .eq("workspace_id", ctx.workspaceId);

  const initial: ConnectionRow[] = (data ?? []).map((row) => ({
    ...row,
    capabilities: resolveStoredCapabilities(row),
  }));

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
          google_sheets: Boolean(env.composioGoogleSheetsAuthConfigId),
          google_docs: Boolean(env.composioGoogleDocsAuthConfigId),
          dropbox: Boolean(env.composioDropboxAuthConfigId),
          airtable: Boolean(env.composioAirtableAuthConfigId),
          todoist: Boolean(env.composioTodoistAuthConfigId),
          discord: Boolean(env.composioDiscordAuthConfigId),
          twitter: Boolean(env.composioTwitterAuthConfigId),
          whatsapp: Boolean(env.composioWhatsappAuthConfigId),
          telegram: Boolean(env.composioTelegramAuthConfigId),
        }}
        initial={initial}
      />
    </PageShell>
  );
}
