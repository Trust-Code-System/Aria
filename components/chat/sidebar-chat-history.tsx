"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationRow {
  id: string;
  title: string;
  updated_at: string;
}

export function SidebarChatHistory({
  compact,
  onNavigate,
}: {
  compact: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [rows, setRows] = React.useState<ConversationRow[]>([]);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.conversations)) {
        setRows(data.conversations.slice(0, 12));
      }
    } catch {
      /* keep previous */
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, pathname]);

  // Refresh when a chat finishes updating (same tab focus / visibility).
  React.useEffect(() => {
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocus();
    });
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (compact) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
          History
        </p>
        <Link
          href="/chat/history"
          onClick={onNavigate}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="px-1 py-2 text-xs text-on-surface-variant">No chats yet</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((c) => {
            const active = pathname === `/chat/${c.id}`;
            return (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  onClick={onNavigate}
                  title={c.title}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors",
                    active
                      ? "bg-secondary-container text-on-secondary-container"
                      : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="min-w-0 truncate">{c.title || "Untitled chat"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
