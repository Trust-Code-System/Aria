import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { NewReportButton } from "@/components/reports/new-report-button";
import { ReportsClient } from "@/components/reports/reports-client";

export const metadata = { title: "Reports · Aria" };

export default async function ReportsPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, title, kind, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false });

  return (
    <PageShell
      title="Reports"
      description="Generate polished, cited documents from research, chats, or your knowledge base."
      actions={<NewReportButton />}
    >
      <ReportsClient initial={reports ?? []} />
    </PageShell>
  );
}
