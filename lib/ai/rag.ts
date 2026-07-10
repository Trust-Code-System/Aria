import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/ai/embeddings";
import type { RetrievedChunk } from "@/lib/ai/types";

/**
 * Retrieval-augmented generation core. Prefers hybrid (vector + keyword RRF)
 * via `hybrid_match_document_chunks`; falls back to pure vector RPC if the
 * hybrid migration is not applied yet.
 */
export interface RetrieveOptions {
  workspaceId: string;
  projectId?: string | null;
  matchCount?: number;
  similarityThreshold?: number;
  /** When false, skip keyword fusion (vector only). Default true. */
  hybrid?: boolean;
}

export async function retrieveChunks(
  supabase: SupabaseClient,
  query: string,
  opts: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const embedding = await embedText(query);
  const useHybrid = opts.hybrid !== false;
  const params = {
    query_embedding: JSON.stringify(embedding),
    match_workspace_id: opts.workspaceId,
    match_project_id: opts.projectId ?? null,
    match_count: opts.matchCount ?? 8,
    similarity_threshold: opts.similarityThreshold ?? 0.15,
  };

  if (useHybrid) {
    const { data, error } = await supabase.rpc("hybrid_match_document_chunks", {
      ...params,
      query_text: query.slice(0, 2000),
    });
    if (!error) return (data ?? []) as RetrievedChunk[];
    // Fallback when migration 0011 is not applied yet.
    if (!isMissingRpc(error)) {
      throw new Error(`Hybrid search failed: ${error.message}`);
    }
  }

  const { data, error } = await supabase.rpc("match_document_chunks", params);
  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }
  return (data ?? []) as RetrievedChunk[];
}

function isMissingRpc(error: { message?: string; code?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("hybrid_match_document_chunks")
  );
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

/**
 * Reciprocal rank fusion for unit tests / offline eval (mirrors SQL RRF k=60).
 */
export function reciprocalRankFusion(
  rankedLists: string[][],
  k = 60,
): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, idx) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
