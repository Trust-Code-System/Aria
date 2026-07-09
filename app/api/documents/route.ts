import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { configured } from "@/lib/env";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";

/** Delete a document, its chunks (cascade), and its stored file. */
export async function DELETE(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError({ area: "upload", category: "validation", userMessage: "Missing document id." });

    const supabase = createServerSupabase();
    const { data: doc } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!doc) throw new AppError({ area: "upload", category: "not_found", userMessage: "Document not found." });

    // Remove the stored file (best-effort) with the admin client.
    if (doc.storage_path && configured.supabaseAdmin) {
      try {
        await createAdminSupabase().storage.from("documents").remove([doc.storage_path]);
      } catch {
        /* non-fatal — record removal still proceeds */
      }
    }

    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) throw new AppError({ area: "upload", category: "internal", userMessage: "Could not delete the document.", internal: error });

    await logAudit({
      action: "document.delete",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "document",
      targetId: id,
    });
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "upload", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
