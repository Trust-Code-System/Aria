import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  messageId: z.string().uuid().optional(),
  rating: z.enum(["up", "down"]),
  comment: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const body = schema.parse(await req.json());
    const supabase = createServerSupabase();
    await supabase.from("feedback").insert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      message_id: body.messageId ?? null,
      rating: body.rating,
      comment: body.comment ?? null,
    });
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "system", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
