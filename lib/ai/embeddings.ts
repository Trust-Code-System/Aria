import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { env } from "@/lib/env";
import { parseModelId } from "@/lib/ai/providers";
import { configMissing } from "@/lib/errors";

/**
 * Provider-aware embedding abstraction. The output dimension MUST match the DB
 * migration (vector(1536)). Both supported providers are configured to emit
 * 1536-dim vectors:
 *   - openai:text-embedding-3-small  → native 1536
 *   - google:gemini-embedding-001    → requested at 1536 (Matryoshka truncation)
 * If you switch to a model with a different native dim, update EMBEDDING_DIM
 * and the vector(...) columns + match RPC together.
 */

export const EMBEDDING_DIM = 1536;

function provider() {
  return parseModelId(env.defaultEmbeddingModel);
}

export async function embedText(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { provider: name, model } = provider();
  if (name === "google") return embedGoogle(texts, model);
  return embedOpenAI(texts, model);
}

// --- OpenAI (via AI SDK) ---------------------------------------------------
async function embedOpenAI(texts: string[], model: string): Promise<number[][]> {
  if (!env.openaiKey) throw configMissing("ingestion", "OpenAI (embeddings)");
  const m = createOpenAI({ apiKey: env.openaiKey }).embedding(model);
  const BATCH = 96;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    if (slice.length === 1) {
      const { embedding } = await embed({ model: m, value: slice[0] });
      out.push(embedding);
    } else {
      const { embeddings } = await embedMany({ model: m, values: slice });
      out.push(...embeddings);
    }
  }
  return out;
}

// --- Google (direct REST, so we can pin outputDimensionality to 1536) -------
async function embedGoogle(texts: string[], model: string): Promise<number[][]> {
  if (!env.googleKey) throw configMissing("ingestion", "Google (embeddings)");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${env.googleKey}`;
  const BATCH = 100;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: slice.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIM,
        })),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Google embeddings failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as { embeddings?: { values: number[] }[] };
    for (const e of json.embeddings ?? []) out.push(e.values);
  }
  if (out.length !== texts.length) {
    throw new Error(`Embedding count mismatch: got ${out.length}, expected ${texts.length}`);
  }
  return out;
}
