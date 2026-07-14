import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";

const schema = z.object({
  preferredName: z.string().trim().max(120).nullable().optional(),
  company: z.string().trim().max(200).nullable().optional(),
  roleTitle: z.string().trim().max(200).nullable().optional(),
  signature: z.string().trim().max(4000).nullable().optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  language: z.string().trim().min(2).max(35).optional(),
  historyRetrievalEnabled: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError({ area: "auth", category: "validation", userMessage: parsed.error.issues[0]?.message || "Invalid profile details." });
    }
    const body = parsed.data;
    const { error } = await createServerSupabase()
      .from("profiles")
      .update({
        preferred_name: body.preferredName,
        company: body.company,
        role_title: body.roleTitle,
        signature: body.signature,
        timezone: body.timezone,
        language: body.language,
        history_retrieval_enabled: body.historyRetrievalEnabled,
      })
      .eq("id", ctx.userId);
    if (error) throw new AppError({ area: "auth", category: "internal", userMessage: "Could not update your profile.", internal: error });
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "auth", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
