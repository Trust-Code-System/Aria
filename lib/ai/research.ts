import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fetchWithRetry } from "@/lib/net/retry";
import type { Citation } from "@/lib/ai/types";

/**
 * Web research provider abstraction. At least one provider is used depending on
 * which key exists. Perplexity/Sonar returns an answer + citations directly;
 * Tavily returns ranked search results we then hand to the chat model.
 *
 * Reddit/X/Twitter are intentionally deferred to V2 (see ARCHITECTURE.md).
 */

export interface ResearchResult {
  answer: string;
  citations: Citation[];
  provider: "perplexity" | "tavily";
  raw?: unknown;
}

type ResearchProvider = "perplexity" | "tavily";

export function researchProviderAvailable(): ResearchProvider | null {
  if (env.perplexityKey) return "perplexity";
  if (env.tavilyKey) return "tavily";
  return null;
}

function availableProviders(): ResearchProvider[] {
  const list: ResearchProvider[] = [];
  if (env.perplexityKey) list.push("perplexity");
  if (env.tavilyKey) list.push("tavily");
  return list;
}

export async function runResearch(query: string): Promise<ResearchResult> {
  const providers = availableProviders();
  if (providers.length === 0) {
    throw new AppError({
      area: "research",
      category: "config_missing",
      userMessage:
        "Web research is not configured. Add a PERPLEXITY_API_KEY or TAVILY_API_KEY to enable it.",
    });
  }

  let lastErr: unknown = null;
  for (const provider of providers) {
    try {
      if (provider === "perplexity") return await runPerplexity(query);
      return await runTavily(query);
    } catch (err) {
      lastErr = err;
      // Try the next configured provider when this one fails.
      if (provider === providers[providers.length - 1]) break;
    }
  }

  if (lastErr instanceof AppError) throw lastErr;
  throw new AppError({
    area: "research",
    category: "provider_error",
    userMessage: "The research provider returned an error. Please try again.",
    internal: lastErr,
  });
}

async function runPerplexity(query: string): Promise<ResearchResult> {
  const model = env.defaultResearchModel.split(":").pop() || "sonar";
  // Read-only query — safe to retry on transient failures.
  const res = await fetchWithRetry("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.perplexityKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a research assistant. Answer with a structured, well-cited response. Prefer primary and official sources. Separate facts from opinion and flag uncertainty.",
        },
        { role: "user", content: query },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AppError({
      area: "research",
      category: res.status === 401 || res.status === 403 ? "provider_error" : "provider_error",
      statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
      userMessage: friendlyResearchHttpError("Perplexity", res.status),
      internal: `perplexity ${res.status}: ${text.slice(0, 300)}`,
    });
  }

  const data = await res.json();
  const answer: string = data?.choices?.[0]?.message?.content ?? "";
  const urls: string[] = data?.citations ?? data?.search_results?.map((r: any) => r.url) ?? [];
  const citations: Citation[] = urls.map((url: string, i: number) => ({
    index: i + 1,
    title: safeHost(url),
    url,
    kind: "web",
  }));

  return { answer, citations, provider: "perplexity", raw: data };
}

async function runTavily(query: string): Promise<ResearchResult> {
  // Prefer advanced; fall back to basic if the plan rejects advanced depth.
  let res = await tavilySearch(query, "advanced");
  if (!res.ok && (res.status === 400 || res.status === 403)) {
    res = await tavilySearch(query, "basic");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AppError({
      area: "research",
      category: "provider_error",
      statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
      userMessage: friendlyResearchHttpError("Tavily", res.status),
      internal: `tavily ${res.status}: ${text.slice(0, 300)}`,
    });
  }

  const data = await res.json();
  const results: Array<{ title: string; url: string; content: string }> =
    data?.results ?? [];
  const citations: Citation[] = results.map((r, i) => ({
    index: i + 1,
    title: r.title || safeHost(r.url),
    url: r.url,
    snippet: r.content?.slice(0, 240) ?? null,
    kind: "web",
  }));

  // Build an answer: Tavily's own summary if present, else a synthesized list.
  const answer =
    data?.answer ||
    "Here are the most relevant sources I found:\n\n" +
      results
        .map((r, i) => `[${i + 1}] **${r.title}** — ${r.content?.slice(0, 200)}`)
        .join("\n\n");

  return { answer, citations, provider: "tavily", raw: data };
}

async function tavilySearch(query: string, search_depth: "basic" | "advanced") {
  return fetchWithRetry("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.tavilyKey,
      query,
      search_depth,
      include_answer: true,
      max_results: 8,
    }),
  });
}

function friendlyResearchHttpError(provider: string, status: number): string {
  if (status === 401 || status === 403) {
    return `${provider} rejected the API key. Check PERPLEXITY_API_KEY / TAVILY_API_KEY in .env.local.`;
  }
  if (status === 429) {
    return `${provider} is rate-limiting research requests. Wait a moment and try again.`;
  }
  if (status >= 500) {
    return `${provider} is temporarily unavailable. Please try again shortly.`;
  }
  return `The research provider (${provider}) returned an error. Please try again.`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
