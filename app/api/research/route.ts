import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { runResearch, researchProviderAvailable } from "@/lib/ai/research";
import { apiError, apiOk } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ query: z.string().min(2).max(2000) });

/** Standalone research endpoint (used by the research panel / tools). */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { query } = schema.parse(await req.json());
    const result = await runResearch(query);
    return apiOk({
      answer: result.answer,
      citations: result.citations,
      provider: result.provider,
    });
  } catch (error) {
    return apiError(error, {
      area: "research",
      workspaceId: ctx?.workspaceId,
      userId: ctx?.userId,
      provider: researchProviderAvailable() ?? undefined,
    });
  }
}
