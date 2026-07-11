"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Send, Plus, Mic, Square, X, FileText, Loader2, ListTodo } from "lucide-react";
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
  const [convId, setConvId] = React.useState<string | undefined>(conversationId);
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([]);
  const [listening, setListening] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dictationRef = React.useRef<{ stop: () => void } | null>(null);
  const micBaseRef = React.useRef("");
  const pendingCaretRef = React.useRef<number | null>(null);

  const micSupported = React.useMemo(() => speechRecognitionSupported(), []);

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

  React.useEffect(() => () => dictationRef.current?.stop(), []);

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
    if ((!text && readyAttachments.length === 0) || streaming) return;
    if (attachments.some((a) => a.status === "processing")) {
      toastError("Still reading attachments", "Give it a second and try again.");
      return;
    }
    haptic("medium");

    const displayAttachments: ChatAttachment[] = readyAttachments.map((a) => ({
      kind: a.kind,
      name: a.name,
      dataUrl: a.kind === "image" ? a.dataUrl : undefined,
    }));
    const payloadAttachments = readyAttachments.map((a) =>
      a.kind === "image"
        ? { kind: "image" as const, name: a.name, dataUrl: a.dataUrl }
        : { kind: "document" as const, name: a.name, text: a.text },
    );

    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      role: "user",
      content: text,
      attachments: displayAttachments.length ? displayAttachments : undefined,
    };
    const assistantMsg: ChatMessage = { id: "a_" + Date.now(), role: "assistant", content: "", pending: true };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput("");
    setAttachments([]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          projectId,
          mode,
          message: text || "(see attached files)",
          attachments: payloadAttachments.length ? payloadAttachments : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "The assistant could not respond.");
      }

      const newConvId = res.headers.get("x-aria-conversation-id") || convId;
      const assistantMessageId = res.headers.get("x-aria-message-id") || assistantMsg.id;
      const citationsHeader = res.headers.get("x-aria-citations");
      let citations: Citation[] = [];
      if (citationsHeader) {
        try {
          citations = JSON.parse(decodeURIComponent(escape(atob(citationsHeader))));
        } catch {
          /* ignore malformed header */
        }
      }
      if (newConvId && newConvId !== convId) setConvId(newConvId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantMsg.id ? { ...msg, content: acc, pending: true } : msg)),
        );
      }

      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMsg.id
            ? { ...msg, id: assistantMessageId, content: acc, citations, pending: false }
            : msg,
        ),
      );

      if (!conversationId && newConvId) {
        router.replace(`/chat/${newConvId}`);
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setMessages((m) => m.filter((x) => x.id !== assistantMsg.id));
      toastError("Chat failed", msg);
    } finally {
      setStreaming(false);
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

  const modeHint: Record<Mode, string> = {
    general: "Ask anything. Aria uses your project context and approved memories.",
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
                {projectName ? `Chat in ${projectName}` : "How can I help?"}
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {modeHint[mode]}
              </p>
            </div>
          ) : (
            <div className="py-4">
              {messages.map((m) => (
                <MessageItem key={m.id} message={m} onSaveReport={m.role === "assistant" ? saveReport : undefined} />
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
                {micSupported && (
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
                  onClick={send}
                  disabled={!canSend}
                  aria-label="Send"
                  className="h-9 w-9 shrink-0 rounded-full shadow-none"
                >
                  <Send className="h-4 w-4" />
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
