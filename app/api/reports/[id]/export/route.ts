import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { renderReportHtml } from "@/lib/reports/pdf";
import type { Citation } from "@/lib/ai/types";

export const runtime = "nodejs";

/**
 * Returns a fully-styled, self-contained HTML document for the report. The
 * client opens it in a new tab and uses the browser's print-to-PDF. This keeps
 * export dependency-free and reliable across platforms.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    const { data: report } = await supabase
      .from("reports")
      .select("title, content_md, citations")
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!report) throw new AppError({ area: "reports", category: "not_found", userMessage: "Report not found." });

    const html = renderReportHtml({
      title: report.title,
      contentMd: report.content_md,
      citations: (report.citations as Citation[]) ?? [],
      author: ctx.email ?? undefined,
    });

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return apiError(error, { area: "reports", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
