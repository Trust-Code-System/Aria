"use client";

import * as React from "react";
import { MessageSquare, BookOpen, Globe, FileText, Wand2, Code2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type Mode = "general" | "knowledge" | "research" | "report" | "improve" | "code";

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "general", label: "Chat", icon: MessageSquare },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "research", label: "Research", icon: Globe },
  { id: "report", label: "Report", icon: FileText },
  { id: "improve", label: "Improve", icon: Wand2 },
  { id: "code", label: "Code", icon: Code2 },
];

export function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selected = MODES.find((item) => item.id === mode) ?? MODES[0];
  const SelectedIcon = selected.icon;

  React.useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <SelectedIcon className="h-3.5 w-3.5" />
        {selected.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Chat modes"
          className="absolute bottom-[calc(100%+0.5rem)] left-0 z-[70] grid min-w-[17rem] grid-cols-2 gap-1 rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_16px_48px_rgba(16,16,20,0.14)]"
        >
          {MODES.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-xl border px-3 text-left text-xs font-medium transition-all",
                  active
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
