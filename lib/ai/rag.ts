import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/ai/embeddings";
import type { RetrievedChunk } from "@/lib/ai/types";

/**
 * Retrieval-augmented generation core. Embeds the query and asks Postgres
 * (pgvector) for the most similar chunks, scoped to the workspace (and project
 * if provided). RLS + the RPC's membership check enforce isolation.
 */
export interface RetrieveOptions {
  workspaceId: string;
  projectId?: string | null;
  matchCount?: number;
  similarityThreshold?: number;
}

export async function retrieveChunks(
  supabase: SupabaseClient,
  query: string,
  opts: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const embedding = await embedText(query);

  const { data, error } = await supabase.rpc("match_document_chunks", {
    // pgvector accepts the JSON number[] and casts to vector(1536).
    query_embedding: JSON.stringify(embedding),
    match_workspace_id: opts.workspaceId,
    match_project_id: opts.projectId ?? null,
    match_count: opts.matchCount ?? 8,
    similarity_threshold: opts.similarityThreshold ?? 0.15,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }
  return (data ?? []) as RetrievedChunk[];
}

/**
 * Guardrail for KB mode: is there enough retrieved signal to answer from files?
 * Prevents "hallucinated citations" by refusing to pretend when nothing matched.
 */
export function hasUsableContext(chunks: RetrievedChunk[]): boolean {
  return chunks.length > 0 && chunks.some((c) => c.similarity >= 0.2);
}

/**
 * Citation validation: ensure every [n] the model emitted maps to a real
 * retrieved source. Returns the set of indices that were actually cited and
 * flags any invalid ones (used by the eval/quality layer).
 */
export function validateCitations(
  answer: string,
  sourceCount: number,
): { cited: number[]; invalid: number[] } {
  const matches = Array.from(answer.matchAll(/\[(\d{1,2})\]/g)).map((m) =>
    Number(m[1]),
  );
  const unique = Array.from(new Set(matches));
  const cited = unique.filter((n) => n >= 1 && n <= sourceCount);
  const invalid = unique.filter((n) => n < 1 || n > sourceCount);
  return { cited, invalid };
}
