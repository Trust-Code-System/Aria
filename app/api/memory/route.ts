import { z, ZodError } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { looksLikeSecret } from "@/lib/ai/memory-safety";

export const runtime = "nodejs";

const memoryTypes = z.enum([
  "preference",
  "project_fact",
  "writing_style",
  "tool_preference",
  "workflow",
]);

const createSchema = z.object({
  content: z.string().trim().min(2).max(4000),
  type: memoryTypes,
  // Empty string from the Global scope select must become null, not fail UUID.
  projectId: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  sensitivity: z.enum(["low", "medium", "high"]).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  content: z.string().trim().min(2).max(4000).optional(),
  approval_status: z.enum(["approved", "suggested", "disabled"]).optional(),
  type: memoryTypes.optional(),
});

export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const raw = await req.json();
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError({
        area: "memory",
        category: "validation",
        userMessage: formatZod(parsed.error),
        internal: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    if (looksLikeSecret(body.content)) {
      throw new AppError({
        area: "memory",
        category: "validation",
        userMessage:
          "That looks like it may contain a secret or credential. For your safety, Aria won’t store passwords, keys, or sensitive data as memory.",
      });
    }

    const supabase = createServerSupabase();
    const row = {
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      project_id: body.projectId,
      type: body.type,
      content: body.content,
      source: "manual",
      sensitivity: body.sensitivity ?? "low",
      approval_status: "approved" as const,
    };

    const { data, error } = await supabase.from("memories").insert(row).select("id").single();

    if (error) {
      // Retry without returning row (some RLS setups block RETURNING).
      const retry = await supabase.from("memories").insert(row).select("id");
      if (retry.error || !retry.data?.[0]?.id) {
        throw new AppError({
          area: "memory",
          category: "internal",
          userMessage: "Could not save memory. Check that you are signed in and try again.",
          internal: error.message ?? error,
        });
      }
      return apiOk({ id: retry.data[0].id });
    }

    return apiOk({ id: data.id });
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError(
        new AppError({
          area: "memory",
          category: "validation",
          userMessage: formatZod(error),
          internal: error.flatten(),
        }),
        { area: "memory", workspaceId: ctx?.workspaceId, userId: ctx?.userId },
      );
    }
    return apiError(error, { area: "memory", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

export async function PATCH(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AppError({
        area: "memory",
        category: "validation",
        userMessage: formatZod(parsed.error),
        internal: parsed.error.flatten(),
      });
    }
    const { id, ...fields } = parsed.data;
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("memories")
      .update(fields)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) {
      throw new AppError({
        area: "memory",
        category: "internal",
        userMessage: "Could not update memory.",
        internal: error,
      });
    }
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "memory", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

export async function DELETE(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      throw new AppError({ area: "memory", category: "validation", userMessage: "Missing memory id." });
    }
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) {
      throw new AppError({
        area: "memory",
        category: "internal",
        userMessage: "Could not delete memory.",
        internal: error,
      });
    }
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "memory", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

function formatZod(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return "Invalid memory input.";
  if (first.path.includes("projectId")) return "Pick a valid project, or use Global scope.";
  if (first.path.includes("content")) return "Memory text must be between 2 and 4000 characters.";
  if (first.path.includes("type")) return "Pick a valid memory type.";
  return first.message || "Invalid memory input.";
}
