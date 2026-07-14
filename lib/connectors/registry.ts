/**
 * Central connector registry for chat.
 * Prefers live Composio toolkit tools (source of truth) over local stubs.
 */
import type { CoreTool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { TOOL_REGISTRY } from "@/lib/ai/tools";
import { getActiveConnection } from "@/lib/connectors/connections";
import {
  buildComposioAiSdkTools,
  toolkitsForIntent,
  type AriaToolkit,
} from "@/lib/connectors/composio-session";
import { authConfigIdFor } from "@/lib/connectors/composio";
import { configured } from "@/lib/env";
import type { ChatIntent } from "@/lib/orchestration/intent";
import { runResearch, researchProviderAvailable } from "@/lib/ai/research";
import { tool } from "ai";
import { z } from "zod";
import { AppError } from "@/lib/errors";

export interface ConnectorCapabilityLine {
  provider: string;
  label: string;
  status: "connected" | "disconnected" | "not_configured";
  tools: string[];
}

export interface ChatToolBuildResult {
  tools: Record<string, CoreTool>;
  capabilityLines: ConnectorCapabilityLine[];
  toolNames: string[];
  composioToolNames: string[];
}

function providerLabel(provider: string): string {
  return provider.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCapabilityPromptSection(
  lines: ConnectorCapabilityLine[],
  composioToolNames: string[] = [],
): string {
  const usable = lines.filter((l) => l.status === "connected");
  const missing = lines.filter((l) => l.status === "disconnected");
  const parts: string[] = [
    "Runtime connector capabilities (authoritative — from Composio; do not invent others):",
  ];
  if (usable.length === 0 && composioToolNames.length === 0) {
    parts.push("- No external app tools are executable in this turn.");
  } else {
    for (const line of usable) {
      parts.push(`- ${line.label}: connected via Composio`);
    }
    if (composioToolNames.length) {
      const preview = composioToolNames.slice(0, 24).join(", ");
      parts.push(`- Executable Composio tools this turn: ${preview}${composioToolNames.length > 24 ? "…" : ""}`);
    }
  }
  if (missing.length) {
    parts.push(
      `Disconnected (do not claim these work): ${missing.map((m) => m.label).join(", ")}.`,
    );
  }
  parts.push(
    "Rules: Never claim an external action succeeded unless a tool returned success.",
    "Never claim Gmail is unavailable if Gmail tools are listed above.",
    "Dangerous tools (send/delete/post) create an approval — tell the user to approve on Approvals. Do not pretend the action completed.",
    "Never invent message IDs or fake send confirmations.",
    "Resolve recipients from conversation when possible; ask only if essential details are missing.",
  );
  return parts.join("\n");
}

async function capabilityLinesForWorkspace(
  workspaceId: string,
  toolkits: AriaToolkit[],
): Promise<ConnectorCapabilityLine[]> {
  const providers = [
    "gmail",
    "google_calendar",
    "google_drive",
    "slack",
    "notion",
    "github",
  ] as const;
  const lines: ConnectorCapabilityLine[] = [];
  for (const provider of providers) {
    if (!configured.connectors || !authConfigIdFor(provider)) {
      lines.push({
        provider,
        label: providerLabel(provider),
        status: "not_configured",
        tools: [],
      });
      continue;
    }
    const conn = await getActiveConnection(workspaceId, provider);
    const toolkitNeeded = toolkits.length === 0 || toolkits.some((t) => {
      if (provider === "gmail") return t === "gmail";
      if (provider === "google_calendar") return t === "googlecalendar";
      if (provider === "google_drive") return t === "googledrive";
      return t === provider;
    });
    lines.push({
      provider,
      label: providerLabel(provider),
      status: conn && toolkitNeeded ? "connected" : conn ? "connected" : "disconnected",
      tools: [],
    });
  }
  return lines;
}

/**
 * Build AI SDK tools for this chat turn from Composio (plus optional web_search).
 */
export async function buildChatTools(params: {
  workspaceId: string;
  userId: string;
  conversationId: string | null;
  assistantMessageId?: string | null;
  supabase: SupabaseClient;
  intent: ChatIntent;
  message: string;
}): Promise<ChatToolBuildResult> {
  const toolkits = toolkitsForIntent(params.intent, params.message);
  const capabilityLines = await capabilityLinesForWorkspace(params.workspaceId, toolkits);

  const tools: Record<string, CoreTool> = {};
  let composioToolNames: string[] = [];

  if (params.intent === "action" && toolkits.length > 0 && !configured.connectors) {
    throw new AppError({
      area: "tools",
      category: "config_missing",
      userMessage:
        "Connected-app actions are not configured on this deployment. Ask an administrator to configure Composio. Nothing was sent or changed.",
    });
  }

  if (toolkits.length > 0 && configured.connectors) {
    const built = await buildComposioAiSdkTools({
      supabaseUserId: params.userId,
      workspaceId: params.workspaceId,
      conversationId: params.conversationId,
      assistantMessageId: params.assistantMessageId ?? null,
      supabase: params.supabase,
      toolkits,
    });
    Object.assign(tools, built.tools);
    composioToolNames = built.toolNames;
    if (params.intent === "action" && built.toolNames.length === 0) {
      const label = toolkits.map((toolkit) => providerLabel(toolkit)).join(", ");
      throw new AppError({
        area: "tools",
        category: "provider_error",
        userMessage: `${label || "The requested app"} is not currently executable. Reconnect it on the Connections page and verify its permissions. Nothing was sent or changed.`,
        internal: { layer: built.diag.layer, requested: toolkits, discovered_count: 0 },
      });
    }
    const needsGmailSend =
      toolkits.includes("gmail") && /\b(send|email|mail|forward|reply)\b/i.test(params.message);
    const hasGmailSend = built.toolNames.some((name) => /^GMAIL_.*(SEND|FORWARD|REPLY)/i.test(name));
    if (needsGmailSend && !hasGmailSend) {
      throw new AppError({
        area: "tools",
        category: "provider_error",
        userMessage:
          "Gmail is connected, but no send-capable tool is available. Reconnect Gmail with send permission and try again. Nothing was sent.",
        internal: { layer: "capability_discovery", discovered: built.toolNames },
      });
    }
  }

  // Keep Aria research as a non-Composio tool when research mode/intent needs it.
  if (researchProviderAvailable() && (params.intent === "research" || params.intent === "action")) {
    // Only add if not already present
    if (!tools.web_search) {
      tools.web_search = tool({
        description: "Search the public web and return an answer with citations (Aria research).",
        parameters: z.object({ query: z.string().min(2) }),
        execute: async ({ query }) => {
          const r = await runResearch(query);
          return { answer: r.answer, citations: r.citations };
        },
      });
    }
  }

  // Fallback: if Composio returned nothing but local registry has enabled stubs
  // with connections, do not fake — leave empty and let the prompt say so.
  void TOOL_REGISTRY;

  return {
    tools,
    capabilityLines,
    toolNames: Object.keys(tools),
    composioToolNames,
  };
}
