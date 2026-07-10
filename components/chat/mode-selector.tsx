"use client";

import * as React from "react";
import { MessageSquare, BookOpen, Globe, FileText, Wand2, Code2, Plus, ChevronDown } from "lucide-react";
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
  const selected = MODES.find((item) => item.id === mode) ?? MODES[0];
  const SelectedIcon = selected.icon;

  return (
    <div className="relative inline-flex items-center gap-1 rounded-2xl border border-outline-variant bg-surface-container-low/80 p-1.5 shadow-[inset_0_1px_0_rgba(255,248,236,0.08)] backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-full border border-primary/70 bg-primary/20 px-3 text-xs font-medium text-primary shadow-[0_0_18px_rgba(147,64,255,0.22)] transition hover:bg-primary/25"
      >
        <SelectedIcon className="h-3.5 w-3.5" />
        {selected.label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Choose chat mode"
        title="Choose chat mode"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-variant hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Chat modes"
          className="absolute bottom-[calc(100%+0.5rem)] left-0 z-30 grid min-w-[17rem] grid-cols-2 gap-1 rounded-2xl border border-outline-variant bg-surface-container p-1.5 shadow-2xl backdrop-blur-xl sm:bottom-auto sm:top-[calc(100%+0.5rem)]"
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
                    ? "border-primary/70 bg-primary/20 text-primary shadow-[0_0_18px_rgba(147,64,255,0.22)]"
                    : "border-transparent text-muted-foreground hover:bg-surface-variant hover:text-foreground",
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
