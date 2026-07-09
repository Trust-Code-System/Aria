import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
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

export function researchProviderAvailable(): "perplexity" | "tavily" | null {
  if (env.perplexityKey) return "perplexity";
  if (env.tavilyKey) return "tavily";
  return null;
}

export async function runResearch(query: string): Promise<ResearchResult> {
  const provider = researchProviderAvailable();
  if (!provider) {
    throw new AppError({
      area: "research",
      category: "config_missing",
      userMessage:
        "Web research is not configured. Add a PERPLEXITY_API_KEY or TAVILY_API_KEY to enable it.",
    });
  }
  if (provider === "perplexity") return runPerplexity(query);
  return runTavily(query);
}

async function runPerplexity(query: string): Promise<ResearchResult> {
  const model = env.defaultResearchModel.split(":").pop() || "sonar";
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
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
      category: "provider_error",
      statusCode: res.status,
      userMessage: "The research provider returned an error. Please try again.",
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
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.tavilyKey,
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: 8,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AppError({
      area: "research",
      category: "provider_error",
      statusCode: res.status,
      userMessage: "The research provider returned an error. Please try again.",
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

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
