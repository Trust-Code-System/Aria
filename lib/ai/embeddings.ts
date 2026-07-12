import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { env } from "@/lib/env";
import { parseModelId } from "@/lib/ai/providers";
import { AppError, configMissing } from "@/lib/errors";
import { withRetry, fetchWithRetry } from "@/lib/net/retry";

/**
 * Provider-aware embedding abstraction. The output dimension MUST match the DB
 * migration (vector(1536)). Both supported providers are configured to emit
 * 1536-dim vectors:
 *   - openai:text-embedding-3-small  → native 1536
 *   - google:gemini-embedding-001    → requested at 1536 (Matryoshka truncation)
 * If you switch to a model with a different native dim, update EMBEDDING_DIM
 * and the vector(...) columns + match RPC together.
 *
 * Note: OpenAI and Google vectors are NOT interchangeable. After switching the
 * embedding provider, re-ingest documents so Knowledge search stays accurate.
 */

export const EMBEDDING_DIM = 1536;

const GOOGLE_EMBED_MODEL = "gemini-embedding-001";
const OPENAI_EMBED_MODEL = "text-embedding-3-small";

function preferredProvider(): { provider: "openai" | "google"; model: string } {
  const { provider, model } = parseModelId(env.defaultEmbeddingModel);
  if (provider === "google") {
    return { provider: "google", model: model || GOOGLE_EMBED_MODEL };
  }
  return { provider: "openai", model: model || OPENAI_EMBED_MODEL };
}

export async function embedText(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const preferred = preferredProvider();
  const order: Array<{ provider: "openai" | "google"; model: string }> = [preferred];
  if (preferred.provider === "openai" && env.googleKey) {
    order.push({ provider: "google", model: GOOGLE_EMBED_MODEL });
  } else if (preferred.provider === "google" && env.openaiKey) {
    order.push({ provider: "openai", model: OPENAI_EMBED_MODEL });
  }

  let lastErr: unknown = null;
  for (const candidate of order) {
    try {
      if (candidate.provider === "google") {
        return await embedGoogle(texts, candidate.model);
      }
      return await embedOpenAI(texts, candidate.model);
    } catch (err) {
      lastErr = err;
      // Only fall through to the next provider on quota / auth / rate-limit.
      if (!isRecoverableEmbedError(err) || candidate === order[order.length - 1]) {
        throw toEmbedAppError(err, candidate.provider);
      }
    }
  }

  throw toEmbedAppError(lastErr, preferred.provider);
}

function isRecoverableEmbedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /429|quota|rate limit|insufficient_quota|401|invalid api key|incorrect api key/i.test(
    msg,
  );
}

function toEmbedAppError(err: unknown, provider: string): AppError {
  if (err instanceof AppError) return err;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/429|quota|insufficient_quota/i.test(msg)) {
    return new AppError({
      area: "rag",
      category: "rate_limit",
      statusCode: 429,
      userMessage:
        "Knowledge search needs embeddings, but the embedding provider is out of quota. " +
        "Add OpenAI billing credits, or set DEFAULT_EMBEDDING_MODEL=google:gemini-embedding-001 and re-upload your files.",
      internal: { provider, message: msg.slice(0, 300) },
    });
  }
  if (/401|incorrect api key|invalid api key/i.test(msg)) {
    return new AppError({
      area: "rag",
      category: "provider_error",
      statusCode: 401,
      userMessage:
        "The embedding API key looks invalid. Check OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.",
      internal: { provider, message: msg.slice(0, 300) },
    });
  }
  return new AppError({
    area: "rag",
    category: "provider_error",
    userMessage: "Knowledge search failed while embedding your query. Please try again.",
    internal: { provider, message: msg.slice(0, 300) },
  });
}

// --- OpenAI (via AI SDK) ---------------------------------------------------
async function embedOpenAI(texts: string[], model: string): Promise<number[][]> {
  if (!env.openaiKey) throw configMissing("ingestion", "OpenAI (embeddings)");
  const m = createOpenAI({ apiKey: env.openaiKey }).embedding(model);
  const BATCH = 96;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    // Embeddings are idempotent — safe to retry on transient failures.
    if (slice.length === 1) {
      const { embedding } = await withRetry(() => embed({ model: m, value: slice[0] }));
      out.push(embedding);
    } else {
      const { embeddings } = await withRetry(() => embedMany({ model: m, values: slice }));
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
    const res = await fetchWithRetry(endpoint, {
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
