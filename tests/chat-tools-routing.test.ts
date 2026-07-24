import { describe, expect, it } from "vitest";
import {
  classifyChatIntent,
  intentNeedsMemories,
  intentNeedsMemorySuggest,
  intentNeedsTools,
} from "@/lib/orchestration/intent";
import {
  extractMailFields,
  lockChatToolPayload,
  summarizeChatToolApproval,
  verifyChatToolLock,
  buildActionReceipt,
} from "@/lib/connectors/chat-approval";
import { toolkitsForIntent, PROVIDER_TO_TOOLKIT } from "@/lib/connectors/composio-session";

describe("chat intent routing", () => {
  it("classifies greetings as instant and skips tools/memory suggest", () => {
    expect(classifyChatIntent({ mode: "general", message: "Hi" })).toBe("instant");
    expect(classifyChatIntent({ mode: "general", message: "Thanks" })).toBe("instant");
    expect(intentNeedsTools("instant")).toBe(false);
    expect(intentNeedsMemories("instant")).toBe(false);
    expect(intentNeedsMemorySuggest("instant")).toBe(false);
  });

  it("classifies email send as action and loads tools", () => {
    expect(
      classifyChatIntent({
        mode: "general",
        message: "Send it to him for me since you are connected to my Gmail.",
      }),
    ).toBe("action");
    expect(intentNeedsTools("action")).toBe(true);
  });

  it("classifies naming a connected app as action (so its tools load)", () => {
    for (const message of [
      "List a few files in my Google Drive.",
      "Add a task in Todoist to call the client.",
      "Send a telegram to the team.",
      "Update my spreadsheet with Q3 numbers.",
      "What's in my Dropbox?",
      "Draft a tweet about the launch.",
    ]) {
      expect(classifyChatIntent({ mode: "general", message }), message).toBe("action");
    }
  });

  it("keeps knowledge/research modes authoritative", () => {
    expect(classifyChatIntent({ mode: "knowledge", message: "Hi" })).toBe("knowledge");
    expect(classifyChatIntent({ mode: "research", message: "war in 1950" })).toBe("research");
  });
});

describe("connector toolkit routing", () => {
  it("routes named apps to their Composio toolkits", () => {
    expect(toolkitsForIntent("action", "update my google sheet with Q3 numbers")).toContain("googlesheets");
    expect(toolkitsForIntent("action", "add a todoist task to call the client")).toContain("todoist");
    expect(toolkitsForIntent("action", "log this deal in salesforce")).toContain("salesforce");
    expect(toolkitsForIntent("action", "post an update in our discord")).toContain("discord");
    expect(toolkitsForIntent("action", "find that report in dropbox")).toContain("dropbox");
    expect(toolkitsForIntent("action", "send a whatsapp to the team")).toContain("whatsapp");
    expect(toolkitsForIntent("action", "draft a tweet about the launch")).toContain("twitter");
    expect(toolkitsForIntent("action", "post to our telegram channel")).toContain("telegram");
  });

  it("maps every connectable provider to a toolkit", () => {
    for (const p of [
      "asana", "hubspot", "salesforce", "outlook",
      "google_sheets", "google_docs", "dropbox", "airtable", "todoist", "discord",
      "twitter", "whatsapp", "telegram",
    ]) {
      expect(PROVIDER_TO_TOOLKIT[p], p).toBeTruthy();
    }
  });
});

describe("chat tool approval lock", () => {
  it("round-trips a locked gmail send payload", () => {
    const locked = lockChatToolPayload({
      version: 1,
      kind: "chat_tool",
      tool_name: "gmail_send",
      conversation_id: "11111111-1111-1111-1111-111111111111",
      workspace_id: "22222222-2222-2222-2222-222222222222",
      args: {
        to: "a@example.com",
        subject: "Hello",
        body: "Body text",
      },
    });
    const verified = verifyChatToolLock(locked.canonical, locked.hash);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.args.to).toBe("a@example.com");
      expect(verified.payload.tool_name).toBe("gmail_send");
    }
  });

  it("rejects tampered payloads", () => {
    const locked = lockChatToolPayload({
      version: 1,
      kind: "chat_tool",
      tool_name: "gmail_send",
      conversation_id: null,
      workspace_id: "22222222-2222-2222-2222-222222222222",
      args: { to: "a@example.com", subject: "Hi", body: "x" },
    });
    const tampered = locked.canonical.replace("a@example.com", "b@example.com");
    const verified = verifyChatToolLock(tampered, locked.hash);
    expect(verified.ok).toBe(false);
  });
});

describe("Composio Gmail arg normalization", () => {
  it("reads recipient_email used by GMAIL_SEND_EMAIL", () => {
    const args = {
      recipient_email: "client@example.com",
      subject: "Proposal",
      body: "Hello",
    };
    const mail = extractMailFields(args);
    expect(mail.to).toBe("client@example.com");
    expect(summarizeChatToolApproval("GMAIL_SEND_EMAIL", args)).toMatch(
      /Send email to client@example.com/,
    );
  });

  it("builds a safe receipt without inventing success fields", () => {
    const receipt = buildActionReceipt({
      toolName: "GMAIL_SEND_EMAIL",
      args: { recipient_email: "a@b.com", subject: "Hi", body: "secret body text" },
      providerResult: { id: "msg-123" },
      startedAt: "2026-07-12T12:00:00.000Z",
      completedAt: "2026-07-12T12:00:01.000Z",
    });
    expect(receipt.status).toBe("succeeded");
    expect(receipt.provider_reference).toBe("msg-123");
    expect(receipt.to).toBe("a@b.com");
    expect(String(receipt.body_preview)).not.toContain("Authorization");
  });
});
