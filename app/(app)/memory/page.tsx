import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { MemoryClient, type MemoryRow } from "@/components/memory/memory-client";

export const metadata = { title: "Memory · Aria" };
export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const [memRes, projRes] = await Promise.all([
    supabase
      .from("memories")
      .select("id, content, type, source, sensitivity, approval_status, project_id, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false }),
    supabase.from("projects").select("id, name").eq("workspace_id", ctx.workspaceId).eq("status", "active"),
  ]);

  return (
    <PageShell
      title="Memory"
      description="Stable preferences and project facts Aria uses in chat. You control everything — nothing sensitive is stored automatically."
    >
      <MemoryClient
        initial={(memRes.data ?? []) as MemoryRow[]}
        projects={projRes.data ?? []}
      />
    </PageShell>
  );
}
