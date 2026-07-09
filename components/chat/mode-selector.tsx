"use client";

import * as React from "react";
import { MessageSquare, BookOpen, Globe, FileText, Wand2, Code2 } from "lucide-react";
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
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-outline-variant bg-surface-container-low/80 p-1.5 shadow-[inset_0_1px_0_rgba(255,248,236,0.08)] backdrop-blur-xl">
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all",
              active
                ? "border-primary/70 bg-primary/20 text-primary shadow-[0_0_18px_rgba(147,64,255,0.22)]"
                : "border-transparent text-muted-foreground hover:bg-surface-variant hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
