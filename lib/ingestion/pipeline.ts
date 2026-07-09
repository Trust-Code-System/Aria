import { createAdminSupabase } from "@/lib/supabase/server";
import { extractText } from "@/lib/ingestion/extract";
import { chunkText } from "@/lib/ingestion/chunk";
import { embedTexts } from "@/lib/ai/embeddings";
import { logError } from "@/lib/logging/error-log";
import { sanitizeForLog } from "@/lib/security/sanitize";

/**
 * End-to-end ingestion for a single document. Runs server-side with the admin
 * client (service role) but always scopes writes by the document's workspace.
 * Updates ingestion_status at each step so the UI can show progress and any
 * failure is logged (sanitized) to the admin portal.
 */
export interface IngestParams {
  documentId: string;
  workspaceId: string;
  userId: string;
  projectId: string | null;
}

export async function ingestDocument(params: IngestParams): Promise<{
  ok: boolean;
  chunkCount: number;
  status: string;
  message?: string;
}> {
  const admin = createAdminSupabase();
  const { documentId, workspaceId, userId, projectId } = params;

  const setStatus = async (fields: Record<string, unknown>) => {
    await admin.from("documents").update(fields).eq("id", documentId);
  };

  const fail = async (message: string, internal?: unknown) => {
    await setStatus({
      ingestion_status: "failed",
      error_message: sanitizeForLog(message),
    });
    await logError({
      area: "ingestion",
      category: "internal",
      error: internal ?? message,
      workspaceId,
      userId,
      projectId,
    });
    return { ok: false, chunkCount: 0, status: "failed", message };
  };

  try {
    await setStatus({ ingestion_status: "processing" });

    // 1. Load the document record + download the file from storage.
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) return fail("Document record not found.", docErr);

    const { data: fileData, error: dlErr } = await admin.storage
      .from("documents")
      .download(doc.storage_path);
    if (dlErr || !fileData) return fail("Could not download the stored file.", dlErr);

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // 2. Extract text.
    const extracted = await extractText(buffer, doc.filename, doc.file_type);
    await setStatus({ extracted_text_status: extracted.status });
    if (extracted.status === "failed") {
      return fail(
        extracted.detail || "Text extraction failed.",
        extracted.detail,
      );
    }
    if (extracted.status === "empty" || !extracted.text.trim()) {
      return fail("Text extraction returned empty content.");
    }

    // 3. Chunk.
    const chunks = chunkText(extracted.text, { pages: extracted.pages });
    if (chunks.length === 0) return fail("No chunks were produced from the text.");

    // 4. Embed.
    const embeddings = await embedTexts(chunks.map((c) => c.content));

    // 5. Store chunks (replace any prior chunks for idempotent re-ingest).
    await admin.from("document_chunks").delete().eq("document_id", documentId);

    const rows = chunks.map((c, i) => ({
      document_id: documentId,
      workspace_id: workspaceId,
      user_id: userId,
      project_id: projectId,
      chunk_index: c.chunkIndex,
      content: c.content,
      embedding: embeddings[i] as unknown as string,
      page_number: c.pageNumber,
      section_title: c.sectionTitle,
      token_count: c.tokenCount,
      metadata: {},
    }));

    // Insert in batches to stay within payload limits.
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: insErr } = await admin
        .from("document_chunks")
        .insert(rows.slice(i, i + BATCH));
      if (insErr) return fail("Failed to store document chunks.", insErr);
    }

    // 6. Mark complete.
    await setStatus({
      ingestion_status: "completed",
      chunk_count: chunks.length,
      error_message: null,
    });

    return { ok: true, chunkCount: chunks.length, status: "completed" };
  } catch (e) {
    return fail(
      "Unexpected error during ingestion.",
      e instanceof Error ? e.message : e,
    );
  }
}
