import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sanitizeFilename, validateFile, getExtension } from "@/lib/security/sanitize";
import { ingestDocument } from "@/lib/ingestion/pipeline";
import { logAudit } from "@/lib/logging/error-log";
import { configured } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Upload a file → store in the private bucket → create a document record →
 * run ingestion (extract, chunk, embed). Ingestion runs inline for the MVP;
 * the jobs table exists for moving this to a background worker later.
 */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    if (!configured.supabaseAdmin) {
      throw new AppError({
        area: "upload",
        category: "config_missing",
        userMessage:
          "File storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY to enable uploads.",
      });
    }

    const form = await req.formData();
    const file = form.get("file");
    const projectId = (form.get("projectId") as string) || null;

    if (!(file instanceof File)) {
      throw new AppError({ area: "upload", category: "validation", userMessage: "No file was provided." });
    }

    const check = validateFile({ name: file.name, size: file.size, type: file.type });
    if (!check.ok) {
      throw new AppError({ area: "upload", category: "validation", userMessage: check.reason! });
    }

    const supabase = createServerSupabase();
    const admin = createAdminSupabase();
    const safeName = sanitizeFilename(file.name);
    const ext = getExtension(safeName);

    // 1. Create the document record (pending).
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        project_id: projectId,
        filename: safeName,
        file_type: ext || file.type || "unknown",
        byte_size: file.size,
        ingestion_status: "pending",
      })
      .select("id")
      .single();
    if (docErr || !doc) {
      throw new AppError({
        area: "upload",
        category: "internal",
        userMessage: "Could not create the document record.",
        internal: docErr,
      });
    }

    // 2. Upload to storage under {workspace_id}/{document_id}/{filename}.
    const storagePath = `${ctx.workspaceId}/${doc.id}/${safeName}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from("documents")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });
    if (upErr) {
      await supabase
        .from("documents")
        .update({ ingestion_status: "failed", error_message: "Storage upload failed." })
        .eq("id", doc.id);
      throw new AppError({
        area: "upload",
        category: "internal",
        userMessage: "We saved your document record but the file upload failed. Please retry.",
        internal: upErr,
      });
    }
    await supabase.from("documents").update({ storage_path: storagePath }).eq("id", doc.id);

    await logAudit({
      action: "document.upload",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "document",
      targetId: doc.id,
      metadata: { filename: safeName, ext },
    });

    // 3. Ingest inline (extract → chunk → embed → store).
    const result = await ingestDocument({
      documentId: doc.id,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      projectId,
    });

    return apiOk({
      documentId: doc.id,
      filename: safeName,
      status: result.status,
      chunkCount: result.chunkCount,
      message: result.message,
    });
  } catch (error) {
    return apiError(error, {
      area: "upload",
      workspaceId: ctx?.workspaceId,
      userId: ctx?.userId,
    });
  }
}
