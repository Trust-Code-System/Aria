import { generateText } from "ai";
import { executeTool } from "@/lib/connectors/composio";
import { getChatModel, resolveUsableChatModelId } from "@/lib/ai/providers";
import { configMissing } from "@/lib/errors";

/**
 * Gmail email triage. Read-only fetch + LLM prioritization is safe and runs on
 * demand. Drafting creates a Gmail draft (not sent). SENDING is a dangerous
 * action and must go through an explicit user confirmation upstream — this
 * module never sends without `confirmed: true`.
 */

export interface TriagedEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  priority: "high" | "medium" | "low";
  reason: string;
  suggestedReply: string | null;
}

interface RawEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
}

/** Fetch recent inbox messages via Composio's Gmail action. */
export async function fetchRecentEmails(entityId: string, max = 15): Promise<RawEmail[]> {
  const result = await executeTool<any>({
    toolSlug: "GMAIL_FETCH_EMAILS",
    entityId,
    args: { max_results: max, query: "in:inbox newer_than:7d" },
  });
  const messages: any[] = result.messages ?? result.data?.messages ?? [];
  return messages.map((m) => ({
    id: m.messageId ?? m.id ?? "",
    from: textField(m.sender ?? m.from ?? m.payload?.from, "unknown"),
    subject: textField(m.subject ?? m.payload?.subject, "(no subject)"),
    snippet: textField(m.snippet ?? m.preview ?? m.messageText, "").slice(0, 400),
  }));
}

/** Prioritize + summarize + draft replies for a batch of emails using the LLM. */
export async function triageEmails(emails: RawEmail[]): Promise<TriagedEmail[]> {
  if (emails.length === 0) return [];
  const modelId = resolveUsableChatModelId();
  if (!modelId) throw configMissing("tools", "An LLM provider");

  const list = emails
    .map(
      (e, i) =>
        `#${i + 1} | from: ${e.from} | subject: ${e.subject}\nsnippet: ${e.snippet}`,
    )
    .join("\n\n");

  const { text } = await generateText({
    model: getChatModel(modelId, "tools"),
    system:
      "You are an executive assistant triaging an inbox. For each email decide a priority (high/medium/low), a one-line reason, and a short suggested reply draft ONLY if a reply is warranted (else null). Return ONLY a JSON array, no prose, with objects: {index, priority, reason, suggestedReply}.",
    prompt: `Triage these emails and return the JSON array:\n\n${list}`,
    temperature: 0.2,
  });

  const arr = parseJsonArray(text);
  return emails.map((e, i) => {
    const v = arr.find((x) => Number(x.index) === i + 1) ?? {};
    const priority = ["high", "medium", "low"].includes(v.priority) ? v.priority : "medium";
    return {
      id: e.id,
      from: e.from,
      subject: e.subject,
      snippet: e.snippet,
      priority,
      reason: typeof v.reason === "string" ? v.reason : "",
      suggestedReply:
        typeof v.suggestedReply === "string" && v.suggestedReply.trim()
          ? v.suggestedReply.trim()
          : null,
    };
  });
}

/** Create a Gmail DRAFT (does not send). Safe-ish, but still a write. */
export async function createDraft(params: {
  entityId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<{ draftId: string }> {
  const result = await executeTool<any>({
    toolSlug: "GMAIL_CREATE_EMAIL_DRAFT",
    entityId: params.entityId,
    args: { recipient_email: params.to, subject: params.subject, body: params.body },
  });
  return { draftId: result.draftId ?? result.id ?? "" };
}

/**
 * Send an email. DANGEROUS: requires explicit confirmation upstream. This will
 * throw unless `confirmed` is true.
 */
export async function sendEmail(params: {
  entityId: string;
  to: string;
  subject: string;
  body: string;
  confirmed: boolean;
}): Promise<{ ok: boolean }> {
  if (!params.confirmed) {
    throw new Error("sendEmail requires explicit user confirmation.");
  }
  await executeTool({
    toolSlug: "GMAIL_SEND_EMAIL",
    entityId: params.entityId,
    args: { recipient_email: params.to, subject: params.subject, body: params.body },
  });
  return { ok: true };
}

function parseJsonArray(text: string): any[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function textField(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}
