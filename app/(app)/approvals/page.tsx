import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { ApprovalsClient } from "@/components/approvals/approvals-client";
import type { Approval } from "@/lib/agent/types";

export const metadata = { title: "Approvals · Aria" };

export default async function ApprovalsPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();

  // Degrade gracefully if the 0008 migration hasn't been applied yet.
  let approvals: Approval[] = [];
  try {
    const { data } = await supabase
      .from("approvals")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    approvals = (data ?? []) as Approval[];
  } catch {
    approvals = [];
  }

  return (
    <PageShell
      title="Approval Inbox"
      description="Nothing that sends, spends, or changes a live system happens without your explicit yes."
    >
      <ApprovalsClient initial={approvals} />
    </PageShell>
  );
}
