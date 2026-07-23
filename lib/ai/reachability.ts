import { env } from "@/lib/env";
import { availableProviders } from "@/lib/ai/providers";

/**
 * Live provider reachability. This is NOT quota/credits-remaining (no provider
 * exposes that via an API key) — it is the closest feasible signal: a minimal
 * authenticated request that distinguishes "reachable", "rate-limited / out of
 * credits", "auth failed", and "unreachable". It is what actually explains the
 * owner's failed action turn: a tool-capable provider that is over quota.
 *
 * Server-only: it reads provider keys and issues real (tiny, max_tokens=1)
 * calls, so it must never run in the client bundle. Gate the caller to admins.
 */

export type ReachabilityState =
  | "reachable"
  | "rate_limited"
  | "auth_failed"
  | "unreachable"
  | "not_configured";

export interface ProviderReachability {
  provider: string;
  label: string;
  state: ReachabilityState;
  httpStatus?: number;
  detail?: string;
  /** Whether this provider can run connected-app (tool) turns. */
  toolCapable: boolean;
}

/**
 * Pure: map an HTTP status (+ optional provider error code) to a reachability
 * state. The error code is checked first because some providers report credit
 * exhaustion with a 400, not a 429 — status alone would call that "reachable".
 */
export function classifyReachability(status: number, errorCode = ""): ReachabilityState {
  if (/quota|credit|billing|exhaust|insufficient|resource_exhausted/i.test(errorCode)) {
    return "rate_limited";
  }
  if (status === 429 || status === 402) return "rate_limited";
  if (status === 401 || status === 403) return "auth_failed";
  if (status >= 200 && status < 400) return "reachable";
  // Any other 4xx (400 malformed probe, 404 model path) still means we reached
  // the API and auth was not the blocker — reachable for our purposes.
  if (status >= 400 && status < 500) return "reachable";
  return "unreachable";
}

const PROBE_TIMEOUT_MS = 8_000;

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Extract a provider error code/type from a response body without throwing. */
async function errorCodeOf(res: Response): Promise<string> {
  if (res.ok) return "";
  try {
    const body = (await res.json()) as { error?: { type?: string; code?: string; status?: string } };
    return String(body?.error?.type ?? body?.error?.code ?? body?.error?.status ?? "");
  } catch {
    return "";
  }
}

type ProbeResult = { status: number; code: string };

async function probeAnthropic(): Promise<ProbeResult> {
  const res = await timedFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.anthropicKey ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.anthropicChatModel.split(":").pop(),
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  return { status: res.status, code: await errorCodeOf(res) };
}

async function probeOpenAI(): Promise<ProbeResult> {
  const res = await timedFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.openaiKey ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.openaiChatModel.split(":").pop(),
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  return { status: res.status, code: await errorCodeOf(res) };
}

async function probeGoogle(): Promise<ProbeResult> {
  const model = env.googleChatModel.split(":").pop();
  const res = await timedFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.googleKey ?? ""}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    },
  );
  return { status: res.status, code: await errorCodeOf(res) };
}

async function probePerplexity(): Promise<ProbeResult> {
  const res = await timedFetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.perplexityKey ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.defaultResearchModel.split(":").pop() || "sonar",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  return { status: res.status, code: await errorCodeOf(res) };
}

/**
 * Probe every configured provider in parallel. Unconfigured providers report
 * `not_configured` without any network call. Network/timeout errors degrade to
 * `unreachable` rather than throwing, so one dead provider never fails the set.
 */
export async function probeAllProviders(): Promise<ProviderReachability[]> {
  const avail = availableProviders();
  const specs: Array<{
    provider: string;
    label: string;
    toolCapable: boolean;
    configured: boolean;
    run: () => Promise<ProbeResult>;
  }> = [
    { provider: "anthropic", label: "Anthropic Claude", toolCapable: true, configured: avail.anthropic, run: probeAnthropic },
    { provider: "openai", label: "OpenAI", toolCapable: true, configured: avail.openai, run: probeOpenAI },
    { provider: "google", label: "Google Gemini", toolCapable: false, configured: avail.google, run: probeGoogle },
    { provider: "perplexity", label: "Perplexity", toolCapable: false, configured: avail.perplexity, run: probePerplexity },
  ];

  return Promise.all(
    specs.map(async (s): Promise<ProviderReachability> => {
      if (!s.configured) {
        return { provider: s.provider, label: s.label, state: "not_configured", toolCapable: s.toolCapable };
      }
      try {
        const { status, code } = await s.run();
        return {
          provider: s.provider,
          label: s.label,
          state: classifyReachability(status, code),
          httpStatus: status,
          detail: code || undefined,
          toolCapable: s.toolCapable,
        };
      } catch {
        return { provider: s.provider, label: s.label, state: "unreachable", detail: "network error", toolCapable: s.toolCapable };
      }
    }),
  );
}
