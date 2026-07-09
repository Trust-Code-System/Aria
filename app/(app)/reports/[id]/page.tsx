import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { Markdown } from "@/components/chat/markdown";
import { CitationList } from "@/components/chat/citation-list";
import { ExportButton } from "@/components/reports/export-button";
import type { Citation } from "@/lib/ai/types";

export const metadata = { title: "Report · Aria" };

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const { data: report } = await supabase
    .from("reports")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!report) notFound();

  const citations = (report.citations as Citation[]) ?? [];

  return (
    <PageShell
      title={report.title}
      description={report.kind.replace("_", " ")}
      actions={<ExportButton reportId={report.id} />}
    >
      <article className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <Markdown content={report.content_md} />
        {citations.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <CitationList citations={citations} />
          </div>
        )}
      </article>
    </PageShell>
  );
}
