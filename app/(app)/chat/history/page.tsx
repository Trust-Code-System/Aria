import Link from "next/link";

import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { ChatHistoryClient, type ConversationRow } from "@/components/chat/history-client";

export const metadata = { title: "Chat history · Aria" };
export const dynamic = "force-dynamic";

export default async function ChatHistoryPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const ctx = await requireSession();
  const q = (searchParams.q ?? "").trim();

  const supabase = createServerSupabase();
  let query = supabase
    .from("conversations")
    .select("id, title, mode, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data } = await query;

  return (
    <PageShell
      title="Chat history"
      description="Search, reopen, or delete past conversations in this workspace."
      actions={
        <Link
          href="/chat"
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
        >
          New chat
        </Link>
      }
    >
      <ChatHistoryClient initial={(data ?? []) as ConversationRow[]} initialQuery={q} />
    </PageShell>
  );
}
