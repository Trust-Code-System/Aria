import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { enqueueAndKick } from "@/lib/jobs/enqueue";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ documentId: z.string().uuid() });

/** Retry ingestion for an existing (e.g. previously failed) document. */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    rateLimit("ingest", ctx.userId);
    const { documentId } = schema.parse(await req.json());
    const supabase = createServerSupabase();

    // Verify the doc belongs to this workspace (RLS-backed).
    const { data: doc } = await supabase
      .from("documents")
      .select("id, project_id, storage_path")
      .eq("id", documentId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!doc) throw new AppError({ area: "ingestion", category: "not_found", userMessage: "Document not found." });
    if (!doc.storage_path) {
      throw new AppError({
        area: "ingestion",
        category: "validation",
        userMessage: "This document has no stored file to ingest.",
      });
    }

    const { jobId, result } = await enqueueAndKick({
      kind: "ingest",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      refId: documentId,
      payload: { projectId: doc.project_id },
      wait: true,
    });

    return apiOk({
      jobId,
      status: result?.status ?? "queued",
      chunkCount: result?.chunkCount ?? 0,
      message: result?.message ?? "Ingestion queued.",
    });
  } catch (error) {
    return apiError(error, { area: "ingestion", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
