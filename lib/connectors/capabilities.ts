/**
 * Server-only capability probe via Composio toolkit discovery.
 * Client UI must import from capabilities-shared.ts only.
 */
import "server-only";

import { getComposioClient, PROVIDER_TO_TOOLKIT, type AriaToolkit } from "@/lib/connectors/composio-session";
import { stableComposioUserId } from "@/lib/connectors/composio-user";
import {
  inferCapabilitiesFromTools,
  toolNamesFromRaw,
  type ConnectorCapabilities,
} from "@/lib/connectors/capabilities-shared";

export * from "@/lib/connectors/capabilities-shared";

/** Live probe via Composio toolkit tool list (no side-effecting execute). */
export async function probeProviderCapabilities(params: {
  supabaseUserId: string;
  provider: string;
}): Promise<ConnectorCapabilities | null> {
  const toolkit = PROVIDER_TO_TOOLKIT[params.provider] as AriaToolkit | undefined;
  if (!toolkit) return null;

  const composioUserId = stableComposioUserId(params.supabaseUserId);
  const composio = getComposioClient();
  const raw = await composio.tools.get(composioUserId, {
    toolkits: [toolkit],
    limit: toolkit === "gmail" ? 100 : 50,
  });
  const names = toolNamesFromRaw(raw);
  const inferred = inferCapabilitiesFromTools(params.provider, names);
  return {
    ...inferred,
    probed_at: new Date().toISOString(),
    source: "composio_tools_get",
  };
}
