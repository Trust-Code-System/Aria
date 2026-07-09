"use client";

import * as React from "react";
import { Copy, Check, ThumbsUp, ThumbsDown, FileDown, Volume2, Square, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/chat/markdown";
import { CitationList } from "@/components/chat/citation-list";
import type { Citation } from "@/lib/ai/types";
import { useToast } from "@/components/ui/toast";
import { speak, stopSpeaking, speechSynthesisSupported } from "@/lib/voice/speech";
import { useTypewriter } from "@/components/chat/use-typewriter";

export interface ChatAttachment {
  kind: "image" | "document";
  name: string;
  /** Present for images so we can render a thumbnail in the bubble. */
  dataUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  attachments?: ChatAttachment[];
  pending?: boolean;
}

export function MessageItem({
  message,
  onSaveReport,
}: {
  message: ChatMessage;
  onSaveReport?: (m: ChatMessage) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = React.useState(false);
  const [rated, setRated] = React.useState<null | "up" | "down">(null);
  const [speaking, setSpeaking] = React.useState(false);
  const { success, error } = useToast();
  const canSpeak = speechSynthesisSupported();

  // Smooth the assistant's streaming text into a steady "typing" animation.
  const typed = useTypewriter(message.content, !!message.pending && !isUser);

  React.useEffect(() => () => stopSpeaking(), []);

  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(message.content, { onEnd: () => setSpeaking(false) });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const rate = async (rating: "up" | "down") => {
    setRated(rating);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, rating }),
      });
      if (!res.ok) throw new Error();
      success("Thanks for the feedback");
    } catch {
      error("Could not save feedback");
      setRated(null);
    }
  };

  // Claude-style thread: user messages sit in a right-aligned bubble; assistant
  // messages are full-width and borderless, with actions that reveal on hover.
  if (isUser) {
    return (
      <div className="group flex flex-col items-end py-4">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-secondary-foreground">
          {message.attachments && message.attachments.length > 0 && (
            <AttachmentPreview attachments={message.attachments} />
          )}
          {message.content ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="group min-w-0 py-5">
      {message.pending && !typed.text ? (
        <TypingDots />
      ) : (
        // Append an inline block-cursor glyph while typing so it always sits at the
        // end of the current text (robust across markdown block structure).
        <Markdown content={typed.caret ? typed.text + "▌" : typed.text} />
      )}
      {message.citations && <CitationList citations={message.citations} />}

      {!message.pending && message.content && (
        <div className="mt-2 flex items-center gap-1 text-muted-foreground opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          <IconBtn onClick={copy} label="Copy">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn onClick={() => rate("up")} label="Good response" active={rated === "up"}>
            <ThumbsUp className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn onClick={() => rate("down")} label="Bad response" active={rated === "down"}>
            <ThumbsDown className="h-3.5 w-3.5" />
          </IconBtn>
          {canSpeak && (
            <IconBtn onClick={toggleSpeak} label={speaking ? "Stop" : "Read aloud"} active={speaking}>
              {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </IconBtn>
          )}
          {onSaveReport && (
            <IconBtn onClick={() => onSaveReport(message)} label="Save as report">
              <FileDown className="h-3.5 w-3.5" />
            </IconBtn>
          )}
        </div>
      )}
    </div>
  );
}

function AttachmentPreview({ attachments }: { attachments: ChatAttachment[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((a, i) =>
        a.kind === "image" && a.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={a.dataUrl}
            alt={a.name}
            className="h-20 w-20 rounded-lg border border-border object-cover"
          />
        ) : (
          <span
            key={i}
            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2 py-1 text-xs"
            title={a.name}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{a.name}</span>
          </span>
        ),
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground",
        active && "text-primary",
      )}
    >
      {children}
    </button>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
