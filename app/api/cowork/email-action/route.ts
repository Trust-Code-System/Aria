import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createDraft, sendEmail } from "@/lib/connectors/gmail";
import { rateLimit } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["draft", "send"]),
  to: z.string().email(),
  subject: z.string().min(1).max(400),
  body: z.string().min(1).max(20000),
  // Required true for `send` — the UI collects an explicit confirmation.
  confirmed: z.boolean().optional(),
});

/**
 * Create a draft (write) or send an email (DANGEROUS). Sending is refused
 * unless `confirmed` is true — enforced here and again in the gmail lib.
 */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    rateLimit("email", ctx.userId);
    const body = schema.parse(await req.json());

    const supabase = createServerSupabase();
    const { data: conn } = await supabase
      .from("connections")
      .select("status, composio_entity_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("provider", "gmail")
      .maybeSingle();
    if (!conn || conn.status !== "active") {
      throw new AppError({ area: "tools", category: "validation", userMessage: "Connect your Gmail account first." });
    }
    const entityId = conn.composio_entity_id ?? ctx.userId;

    if (body.action === "send") {
      if (!body.confirmed) {
        throw new AppError({
          area: "tools",
          category: "validation",
          userMessage: "Sending an email needs your explicit confirmation.",
        });
      }
      await sendEmail({ entityId, to: body.to, subject: body.subject, body: body.body, confirmed: true });
      await logAudit({
        action: "gmail.send",
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        targetType: "email",
        targetId: body.to,
      });
      return apiOk({ ok: true, sent: true });
    }

    const { draftId } = await createDraft({ entityId, to: body.to, subject: body.subject, body: body.body });
    await logAudit({
      action: "gmail.draft",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "email",
      targetId: body.to,
    });
    return apiOk({ ok: true, draftId });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId, provider: "composio" });
  }
}
