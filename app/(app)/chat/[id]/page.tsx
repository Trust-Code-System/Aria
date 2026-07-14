import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { Chat } from "@/components/chat/chat";
import type { ChatMessage } from "@/components/chat/message-item";
import type { Mode } from "@/components/chat/mode-selector";

export const metadata = { title: "Chat · Aria" };

export default async function ChatByIdPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createServerSupabase();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, title, mode, project_id, projects(name)")
    .eq("id", params.id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!conv) notFound();

  const { data: rows } = await supabase
    .from("messages")
    .select("id, role, content, citations, status, error_code, error_message, trace_id, metadata")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  const messages: ChatMessage[] = (rows ?? [])
    .filter((r) => r.role !== "system")
    .filter((r) => r.role === "user" || Boolean(r.content?.trim()) || r.status === "pending" || r.status === "streaming")
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      citations: Array.isArray(r.citations) ? (r.citations as any) : [],
      status: (r.status ?? "completed") as ChatMessage["status"],
      pending: r.status === "pending" || r.status === "streaming",
      errorCode: r.error_code ?? null,
      errorMessage: r.error_message ?? null,
      traceId: r.trace_id ?? null,
      events:
        r.metadata && typeof r.metadata === "object" && Array.isArray((r.metadata as any).events)
          ? (r.metadata as any).events
          : [],
    }));

  const projectName = (conv as any).projects?.name ?? null;

  return (
    <div className="h-[calc(100vh-56px)] md:h-screen">
      <Chat
        conversationId={conv.id}
        projectId={conv.project_id}
        projectName={projectName}
        initialMessages={messages}
        initialMode={(conv.mode as Mode) ?? "general"}
      />
    </div>
  );
}
