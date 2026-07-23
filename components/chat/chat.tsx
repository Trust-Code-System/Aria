"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Send, Plus, Mic, Square, X, FileText, Loader2, ListTodo, Mail, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MessageItem, type ChatMessage, type ChatAttachment } from "@/components/chat/message-item";
import { ModeSelector, type Mode } from "@/components/chat/mode-selector";
import { BackButton } from "@/components/navigation/back-button";
import { BrandMark } from "@/components/brand-mark";
import type { Citation } from "@/lib/ai/types";
import { continueList } from "@/lib/editor/list-continuation";
import { startDictation, speechRecognitionSupported } from "@/lib/voice/speech";
import { haptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";
import { parseChatStreamLine, type ChatStreamEvent } from "@/lib/chat/stream-protocol";
import { findLatestActiveTurnId } from "@/lib/chat/thinking-indicator";

interface ChatProps {
  conversationId?: string;
  projectId?: string | null;
  projectName?: string | null;
  initialMessages?: ChatMessage[];
  initialMode?: Mode;
}

/** An attachment being prepared in the composer before it's sent. */
interface PendingAttachment {
  id: string;
  kind: "image" | "document";
  name: string;
  status: "processing" | "ready" | "error";
  dataUrl?: string; // images
  text?: string; // extracted document text
  error?: string;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 6;
const TURN_VISUAL_TIMEOUT_MS = 65_000;

/**
 * Quick-start "skills" shown on the empty chat screen (like Claude/ChatGPT
 * capability cards). Clicking one prefills the composer with a starter prompt
 * and switches to the mode that best serves it — turning Aria's real
 * capabilities into one-tap entry points instead of a blank box.
 */
const SKILL_SUGGESTIONS: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  prompt: string;
  mode?: Mode;
}[] = [
  { icon: Mail, label: "Draft an email", hint: "Compose & send via Gmail", prompt: "Draft an email to " },
  { icon: Search, label: "Research a topic", hint: "Search the web, with sources", prompt: "Research ", mode: "research" },
  { icon: FileText, label: "Write a report", hint: "A polished, exportable doc", prompt: "Write a report on ", mode: "report" },
  { icon: Sparkles, label: "Remember something", hint: "Save a fact to memory", prompt: "Remember that " },
];

export function Chat({
  conversationId,
  projectId = null,
  projectName = null,
  initialMessages = [],
  initialMode = "general",
}: ChatProps) {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [streaming, setStreaming] = React.useState(false);
  const [activeTurnId, setActiveTurnId] = React.useState<string | null>(() =>
    findLatestActiveTurnId(initialMessages),
  );
  const [convId, setConvId] = React.useState<string | undefined>(conversationId);
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([]);
  const [listening, setListening] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  // Feature-detected, client-only UI (e.g. the mic button) must not render until
  // after mount, or SSR (window undefined → no button) mismatches client
  // hydration (button present) — a "Prop did not match" hydration error.
  const [mounted, setMounted] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dictationRef = React.useRef<{ stop: () => void } | null>(null);
  const micBaseRef = React.useRef("");
  const pendingCaretRef = React.useRef<number | null>(null);
  const inFlightRef = React.useRef(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const micSupported = React.useMemo(() => speechRecognitionSupported(), []);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Auto-grow the textarea and apply any pending caret move (list continuation).
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
    if (pendingCaretRef.current != null) {
      el.selectionStart = el.selectionEnd = pendingCaretRef.current;
      pendingCaretRef.current = null;
    }
  }, [input]);

  React.useEffect(
    () => () => {
      dictationRef.current?.stop();
      abortRef.current?.abort();
    },
    [],
  );

  // A refreshed page can hydrate a durable pending turn after its original
  // stream disconnected. Reconcile it with server state, but never animate it
  // indefinitely if the status cannot be confirmed.
  React.useEffect(() => {
    if (!activeTurnId || inFlightRef.current) return;
    const refresh = window.setInterval(() => router.refresh(), 2_500);
    const timeout = window.setTimeout(() => setActiveTurnId(null), TURN_VISUAL_TIMEOUT_MS);
    return () => {
      window.clearInterval(refresh);
      window.clearTimeout(timeout);
    };
  }, [activeTurnId, router]);

  // Adopt fresh server-provided messages (e.g. after router.refresh reconciles a
  // durable pending turn). This must NOT run on every render: `initialMessages`
  // gets a new array identity each render (its default is a fresh `[]`), so an
  // unguarded setState here is an infinite render loop ("Maximum update depth
  // exceeded"). Only apply when the message content signature actually changes.
  const appliedInitialSigRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (inFlightRef.current) return;
    const sig = initialMessages.map((m) => `${m.id}:${m.status ?? ""}:${m.content.length}`).join("|");
    if (sig === appliedInitialSigRef.current) return;
    appliedInitialSigRef.current = sig;
    setMessages(initialMessages);
    setActiveTurnId(findLatestActiveTurnId(initialMessages));
  }, [initialMessages]);

  // ---- Attachments ----------------------------------------------------------
  const readyAttachments = attachments.filter((a) => a.status === "ready");

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toastError("Attachment limit reached", `Up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }

    for (const file of list.slice(0, room)) {
      const id = "att_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      const isImage = file.type.startsWith("image/");

      if (isImage) {
        if (!IMAGE_TYPES.includes(file.type)) {
          toastError("Unsupported image", "Use PNG, JPEG, WEBP or GIF.");
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          toastError("Image too large", "Images must be under 8MB.");
          continue;
        }
        setAttachments((a) => [...a, { id, kind: "image", name: file.name, status: "processing" }]);
        try {
          const dataUrl = await readAsDataUrl(file);
          setAttachments((a) => a.map((x) => (x.id === id ? { ...x, status: "ready", dataUrl } : x)));
        } catch {
          setAttachments((a) => a.map((x) => (x.id === id ? { ...x, status: "error", error: "Could not read image." } : x)));
        }
      } else {
        // Documents → extract text server-side (no KB persistence).
        setAttachments((a) => [...a, { id, kind: "document", name: file.name, status: "processing" }]);
        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/chat/attachments", { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Could not read this file.");
          setAttachments((a) =>
            a.map((x) => (x.id === id ? { ...x, status: "ready", name: data.name ?? file.name, text: data.text } : x)),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not read this file.";
          setAttachments((a) => a.filter((x) => x.id !== id));
          toastError("Attachment failed", msg);
        }
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      void handleFiles(files);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
  }

  // ---- Delegate to the agent loop ------------------------------------------
  async function delegateAsTask() {
    const text = input.trim();
    if (!text || streaming) return;
    try {
      const res = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: text.slice(0, 200),
          description: text.length > 200 ? text : undefined,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the task.");
      setInput("");
      router.push(`/tasks/${data.task.id}`);
    } catch (err) {
      toastError("Could not delegate", err instanceof Error ? err.message : undefined);
    }
  }

  // ---- Voice ---------------------------------------------------------------
  function toggleMic() {
    if (listening) {
      dictationRef.current?.stop();
      dictationRef.current = null;
      setListening(false);
      return;
    }
    micBaseRef.current = input ? input + " " : "";
    const handle = startDictation({
      onResult: (transcript) => setInput(micBaseRef.current + transcript),
      onError: (message) => {
        toastError("Voice input", message);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
    if (handle) {
      dictationRef.current = handle;
      setListening(true);
    }
  }

  // ---- Composer keys -------------------------------------------------------
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.shiftKey) {
      // Newline: continue a markdown list if we're on a list item.
      const el = e.currentTarget;
      const result = continueList(el.value, el.selectionStart);
      if (result) {
        e.preventDefault();
        pendingCaretRef.current = result.caret;
        setInput(result.value);
      }
      // otherwise: let the browser insert a normal newline
      return;
    }
    e.preventDefault();
    void send();
  }

  async function send() {
    const text = input.trim();
    if ((!text && readyAttachments.length === 0) || inFlightRef.current) return;
    if (attachments.some((item) => item.status === "processing")) {
      toastError("Still reading attachments", "Give it a second and try again.");
      return;
    }
    haptic("medium");
    const displayAttachments: ChatAttachment[] = readyAttachments.map((item) => ({
      kind: item.kind,
      name: item.name,
      dataUrl: item.kind === "image" ? item.dataUrl : undefined,
    }));
    const payloadAttachments = readyAttachments.map((item) =>
      item.kind === "image"
        ? { kind: "image" as const, name: item.name, dataUrl: item.dataUrl }
        : { kind: "document" as const, name: item.name, text: item.text },
    );
    const userMessage: ChatMessage = {
      id: `u_${crypto.randomUUID()}`,
      turnId: crypto.randomUUID(),
      role: "user",
      content: text,
      attachments: displayAttachments.length ? displayAttachments : undefined,
      requestAttachments: payloadAttachments.length ? payloadAttachments : undefined,
    };
    const assistantMessage: ChatMessage = {
      id: `a_${crypto.randomUUID()}`,
      turnId: userMessage.turnId,
      role: "assistant",
      content: "",
      pending: true,
      status: "pending",
      events: [],
    };
    setInput("");
    setAttachments([]);
    await runTurn({
      text: text || "(see attached files)",
      payloadAttachments,
      userMessage,
      assistantMessage,
      turnId: userMessage.turnId!,
    });
  }

  async function retry(message: ChatMessage) {
    if (inFlightRef.current) return;
    const index = messages.findIndex((item) => item.id === message.id);
    let userMessage: ChatMessage | null = null;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (messages[cursor].role === "user") {
        userMessage = messages[cursor];
        break;
      }
    }
    if (!userMessage) {
      toastError("Retry unavailable", "The original user message could not be found.");
      return;
    }
    await runTurn({
      text: userMessage.content || "(see attached files)",
      payloadAttachments: userMessage.requestAttachments ?? [],
      userMessage,
      assistantMessage: message,
      turnId: crypto.randomUUID(),
      retryAssistantMessageId: message.id,
    });
  }

  async function runTurn(params: {
    text: string;
    payloadAttachments: NonNullable<ChatMessage["requestAttachments"]>;
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
    turnId: string;
    retryAssistantMessageId?: string;
  }) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStreaming(true);
    setActiveTurnId(params.turnId);
    const controller = new AbortController();
    abortRef.current = controller;
    let clientTimedOut = false;
    const visualTimeout = window.setTimeout(() => {
      clientTimedOut = true;
      controller.abort();
    }, TURN_VISUAL_TIMEOUT_MS);
    const clientAssistantId = params.assistantMessage.id;
    let assistantMessageId = clientAssistantId;
    let accumulated = "";
    let terminalStatus: ChatMessage["status"] = "streaming";
    let terminalError: Extract<ChatStreamEvent, { type: "error" }> | null = null;
    let streamEvents: ChatStreamEvent[] = [];

    if (params.retryAssistantMessageId) {
      setMessages((current) => current.map((item) => item.id === clientAssistantId
        ? { ...item, turnId: params.turnId, content: "", pending: true, status: "pending", errorCode: null, errorMessage: null, traceId: null, events: [] }
        : item));
    } else {
      setMessages((current) => [...current, params.userMessage, params.assistantMessage]);
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          projectId,
          mode,
          message: params.text,
          idempotencyKey: params.turnId,
          retryAssistantMessageId: params.retryAssistantMessageId,
          attachments: params.payloadAttachments.length ? params.payloadAttachments : undefined,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The assistant could not respond.");
      }
      const newConversationId = response.headers.get("x-aria-conversation-id") || convId;
      assistantMessageId = response.headers.get("x-aria-message-id") || clientAssistantId;
      const citations = decodeCitations(response.headers.get("x-aria-citations"));
      if (newConversationId && newConversationId !== convId) setConvId(newConversationId);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleEvent(parseChatStreamLine(line));
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleEvent(parseChatStreamLine(buffer));

      setMessages((current) => current.map((item) => item.id === clientAssistantId
        ? {
            ...item,
            id: assistantMessageId,
            content: accumulated || terminalError?.message || "The assistant did not return a response.",
            citations,
            pending: false,
            status: terminalStatus === "streaming" ? "failed" : terminalStatus,
            errorCode: terminalError?.code ?? null,
            errorMessage: terminalError?.message ?? null,
            traceId: terminalError?.traceId ?? null,
            events: streamEvents,
          }
        : item));
      if ((terminalStatus as string) !== "completed" && !terminalError) {
        throw new Error("The response stream ended before the turn completed.");
      }
      if ((terminalStatus as string) === "completed" && !accumulated.trim()) {
        throw new Error("The assistant returned an empty reply.");
      }
      if (!conversationId && newConversationId) {
        router.replace(`/chat/${newConversationId}`);
        router.refresh();
      }
    } catch (cause) {
      const cancelled = controller.signal.aborted && !clientTimedOut;
      const failureMessage = clientTimedOut
        ? "This response timed out. Nothing was sent by any pending connected-app action."
        : cancelled
        ? "This response was cancelled. Nothing was sent by any pending connected-app action."
        : cause instanceof Error
          ? cause.message
          : "Something went wrong.";
      setMessages((current) => current.map((item) => item.id === clientAssistantId || item.id === assistantMessageId
        ? {
            ...item,
            id: assistantMessageId,
            content: accumulated || failureMessage,
            pending: false,
            status: cancelled ? "cancelled" : "failed",
            errorCode: terminalError?.code ?? (clientTimedOut ? "request_timed_out" : cancelled ? "cancelled" : "network_error"),
            errorMessage: terminalError?.message ?? failureMessage,
            traceId: terminalError?.traceId ?? null,
            events: streamEvents,
          }
        : item));
      if (!cancelled) toastError("Chat failed", failureMessage);
    } finally {
      window.clearTimeout(visualTimeout);
      inFlightRef.current = false;
      abortRef.current = null;
      setStreaming(false);
      setActiveTurnId((current) => (current === params.turnId ? null : current));
    }

    function handleEvent(event: ChatStreamEvent | null) {
      if (!event || event.turnId !== params.turnId) return;
      if (event.type === "turn_started") {
        assistantMessageId = event.messageId;
        terminalStatus = "streaming";
      } else if (event.type === "text_delta") {
        accumulated += event.delta;
      } else if (event.type === "error") {
        terminalError = event;
        terminalStatus = event.status;
        setActiveTurnId((current) => (current === params.turnId ? null : current));
      } else if (event.type === "done") {
        terminalStatus = event.status;
        assistantMessageId = event.messageId;
        setActiveTurnId((current) => (current === params.turnId ? null : current));
      } else {
        streamEvents = [...streamEvents, event];
        if (event.type === "approval") {
          setActiveTurnId((current) => (current === params.turnId ? null : current));
        }
      }
      setMessages((current) => current.map((item) => item.id === clientAssistantId
        ? { ...item, content: accumulated, pending: terminalStatus === "pending" || terminalStatus === "streaming", status: terminalStatus, events: streamEvents }
        : item));
    }
  }

  function decodeCitations(value: string | null): Citation[] {
    if (!value) return [];
    try {
      const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as Citation[];
    } catch {
      return [];
    }
  }

  async function saveReport(m: ChatMessage) {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: "Chat excerpt — " + new Date().toLocaleDateString(),
          kind: "project_summary",
          contentMd: m.content,
          citations: m.citations ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/reports/${data.id}`);
    } catch {
      toastError("Could not save report");
    }
  }

  /** Prefill the composer from a skill card and jump to its best mode. */
  function applySuggestion(s: (typeof SKILL_SUGGESTIONS)[number]) {
    if (s.mode) setMode(s.mode);
    setInput(s.prompt);
    haptic();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = s.prompt.length;
    });
  }

  const modeHint: Record<Mode, string> = {
    general: "Draft an email, dig into research, write a report — or just ask. Aria uses your context and memory.",
    knowledge: "Answers come only from your uploaded files, with citations.",
    research: "Aria searches the public web and cites its sources.",
    report: "Aria drafts a polished, exportable document.",
    improve: "Paste text and Aria will refine its clarity and structure.",
    code: "Coding and project help with runnable, idiomatic answers.",
  };

  const canSend = (input.trim().length > 0 || readyAttachments.length > 0) && !streaming;

  return (
    <div className="flex h-full flex-col">
      {conversationId && (
        <div className="border-b border-outline-variant bg-background/70 px-4 py-2.5 backdrop-blur-xl sm:px-6">
          <div className="mx-auto max-w-3xl">
            <BackButton fallback="/chat" />
          </div>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 ? (
            <div className="flex min-h-[54vh] flex-col items-center justify-center px-6 text-center animate-fade-in">
              <BrandMark size={42} />
              <h1 className="mt-5 text-2xl font-semibold tracking-tight">
                {projectName ? `Chat in ${projectName}` : "What can I get done for you?"}
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {modeHint[mode]}
              </p>
              {!projectName && mode === "general" && (
                <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SKILL_SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => applySuggestion(s)}
                      className="group flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-3.5 text-left transition hover:border-primary/40 hover:bg-card hover:shadow-sm"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
                        <s.icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{s.label}</span>
                        <span className="block text-xs text-muted-foreground">{s.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="py-4">
              {messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  activeTurnId={activeTurnId}
                  thinkingMode={mode}
                  onSaveReport={m.role === "assistant" ? saveReport : undefined}
                  onRetry={m.role === "assistant" ? retry : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-20 bg-gradient-to-t from-background via-background to-background/70 px-4 pb-4 pt-2 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.md,.markdown,.docx,.csv,.json"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <div
            className={cn(
              "rounded-[26px] border border-border bg-card p-3 shadow-[0_10px_36px_rgba(16,16,20,0.08)] transition focus-within:border-primary/35 focus-within:shadow-[0_12px_40px_rgba(109,92,255,0.10)]",
              dragging && "border-primary ring-2 ring-primary/20",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="group relative inline-flex max-w-[200px] items-center gap-1.5 rounded-xl border border-border bg-muted/70 px-2 py-1.5 text-xs"
                  >
                    {a.status === "processing" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    ) : a.kind === "image" && a.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.dataUrl} alt={a.name} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{a.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={`Remove ${a.name}`}
                      className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder="Message Aria"
              rows={1}
              className="max-h-[220px] min-h-[52px] w-full resize-none border-0 bg-transparent px-1 py-2 text-base leading-relaxed shadow-none outline-none placeholder:text-muted-foreground/80"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <IconButton
                  label="Attach files"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={streaming}
                >
                  <Plus className="h-5 w-5" />
                </IconButton>
                <ModeSelector mode={mode} onChange={setMode} />
              </div>

              <div className="flex items-center gap-1">
                <IconButton
                  label="Delegate as an agent task"
                  onClick={delegateAsTask}
                  disabled={streaming || !input.trim()}
                >
                  <ListTodo className="h-[18px] w-[18px]" />
                </IconButton>
                {mounted && micSupported && (
                  <IconButton
                    label={listening ? "Stop listening" : "Voice input"}
                    onClick={toggleMic}
                    active={listening}
                  >
                    {listening ? <Square className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
                  </IconButton>
                )}
                <Button
                  size="icon"
                  onClick={streaming ? () => abortRef.current?.abort() : send}
                  disabled={streaming ? false : !canSend}
                  aria-label={streaming ? "Stop response" : "Send"}
                  className="h-9 w-9 shrink-0 rounded-full shadow-none"
                >
                  {streaming ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-center text-[11px] text-muted-foreground">
            <span>{listening ? "Listening… speak now." : "Aria can make mistakes. Check important information."}</span>
            <span className="ml-3 hidden items-center gap-1 sm:inline-flex">
              <CornerDownLeft className="h-3 w-3" /> Enter to send
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
        active && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
