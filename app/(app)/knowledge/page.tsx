import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { UploadZone } from "@/components/knowledge/upload-zone";
import { DocumentList, type DocRow } from "@/components/knowledge/document-list";
import { EmptyState } from "@/components/ui/states";
import { BookOpen } from "lucide-react";
import { configured } from "@/lib/env";

export const metadata = { title: "Knowledge · Aria" };

export default async function KnowledgePage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("documents")
    .select("id, filename, file_type, byte_size, ingestion_status, chunk_count, error_message, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false });

  const docs = (data ?? []) as DocRow[];

  return (
    <PageShell
      title="Knowledge base"
      description="Upload files so Aria can ground its answers in your own sources — with citations."
    >
      {!configured.embeddings && (
        <div className="mb-5 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-warning">Embeddings not configured:</span> add{" "}
          <code>OPENAI_API_KEY</code> to enable text extraction indexing and Knowledge-Base Q&A.
        </div>
      )}

      <UploadZone />

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Documents ({docs.length})
        </h2>
        {docs.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-5 w-5" />}
            title="Your knowledge base is empty"
            description="Upload a PDF, doc, or note above. Aria will extract, chunk, and embed it so you can ask questions with citations."
          />
        ) : (
          <DocumentList docs={docs} />
        )}
      </div>
    </PageShell>
  );
}
