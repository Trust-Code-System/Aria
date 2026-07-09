import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { ingestDocument } from "@/lib/ingestion/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ documentId: z.string().uuid() });

/** Retry ingestion for an existing (e.g. previously failed) document. */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
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

    const result = await ingestDocument({
      documentId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      projectId: doc.project_id,
    });

    return apiOk({ status: result.status, chunkCount: result.chunkCount, message: result.message });
  } catch (error) {
    return apiError(error, { area: "ingestion", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
