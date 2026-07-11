"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, Search, Trash2 } from "lucide-react";

import { Card, Badge, Spinner, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export interface ConversationRow {
  id: string;
  title: string;
  mode: string;
  updated_at: string;
}

export function ChatHistoryClient({ initial, initialQuery }: { initial: ConversationRow[]; initialQuery: string }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [q, setQ] = React.useState(initialQuery);
  const [rows, setRows] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [searching, setSearching] = React.useState(false);

  async function search(term: string) {
    setSearching(true);
    try {
      const res = await fetch(`/api/chat/conversations?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (res.ok) setRows(data.conversations);
    } catch {
      /* keep current rows */
    } finally {
      setSearching(false);
    }
  }

  // Debounced live search.
  React.useEffect(() => {
    const t = setTimeout(() => void search(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function remove(id: string) {
    if (!confirm("Delete this conversation? Its messages are removed permanently.")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/chat/conversations?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setRows((r) => r.filter((c) => c.id !== id));
      success("Conversation deleted");
      router.refresh();
    } catch (e) {
      error("Could not delete", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search conversations…"
          className="pl-9"
        />
      </div>

      {searching && rows.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {q ? "No conversations match that search." : "No conversations yet — start one in Chat."}
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Card className="flex items-center justify-between gap-3 p-3.5 transition hover:border-primary/35">
                <Link href={`/chat/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-sm font-medium">{c.title}</span>
                  <Badge tone="muted">{c.mode}</Badge>
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    disabled={busy === c.id}
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete conversation"
                  >
                    {busy === c.id ? <Spinner /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
