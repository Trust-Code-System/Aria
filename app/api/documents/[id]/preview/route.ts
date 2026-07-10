import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { configured } from "@/lib/env";

export const runtime = "nodejs";

/**
 * GET /api/documents/:id/preview — short-lived signed URL for private storage.
 * Never exposes the service role key; URL expires in 120s.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    if (!configured.supabaseAdmin) {
      throw new AppError({
        area: "upload",
        category: "config_missing",
        userMessage: "File preview is not configured.",
      });
    }

    const supabase = createServerSupabase();
    const { data: doc } = await supabase
      .from("documents")
      .select("id, filename, storage_path, file_type")
      .eq("id", params.id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();

    if (!doc?.storage_path) {
      throw new AppError({
        area: "upload",
        category: "not_found",
        userMessage: "Document not found or has no stored file.",
      });
    }

    const admin = createAdminSupabase();
    const { data: signed, error } = await admin.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 120);

    if (error || !signed?.signedUrl) {
      throw new AppError({
        area: "upload",
        category: "internal",
        userMessage: "Could not create a preview link.",
        internal: error,
      });
    }

    return apiOk({
      url: signed.signedUrl,
      filename: doc.filename,
      fileType: doc.file_type,
      expiresInSec: 120,
    });
  } catch (error) {
    return apiError(error, { area: "upload", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
