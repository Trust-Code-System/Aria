import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { logAudit } from "@/lib/logging/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cookies (auth) — never prerender

const contactFields = {
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(320).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  role: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  notes: z.string().max(8000).nullable().optional(),
  relationship: z.string().max(500).nullable().optional(),
  lastInteractionAt: z.string().datetime().nullable().optional(),
  followUpAt: z.string().datetime().nullable().optional(),
};

const createSchema = z.object(contactFields);
const updateSchema = z.object({ id: z.string().uuid(), ...contactFields }).partial({
  fullName: true,
});

/** Map camelCase API fields to snake_case DB columns, skipping undefined. */
function toRow(body: Partial<z.infer<typeof createSchema>>) {
  const row: Record<string, unknown> = {};
  if (body.fullName !== undefined) row.full_name = body.fullName;
  if (body.email !== undefined) row.email = body.email;
  if (body.phone !== undefined) row.phone = body.phone;
  if (body.company !== undefined) row.company = body.company;
  if (body.role !== undefined) row.role = body.role;
  if (body.tags !== undefined) row.tags = body.tags;
  if (body.notes !== undefined) row.notes = body.notes;
  if (body.relationship !== undefined) row.relationship = body.relationship;
  if (body.lastInteractionAt !== undefined) row.last_interaction_at = body.lastInteractionAt;
  if (body.followUpAt !== undefined) row.follow_up_at = body.followUpAt;
  return row;
}

/** GET /api/contacts — the workspace's contacts, follow-ups first. */
export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("workspace_id", ctx.workspaceId)
      .order("full_name", { ascending: true })
      .limit(500);
    if (error) {
      throw new AppError({ area: "tools", category: "internal", userMessage: "Could not load contacts.", internal: error });
    }
    return apiOk({ contacts: data ?? [] });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

/** POST /api/contacts — add a contact. */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const body = createSchema.parse(await req.json());
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("contacts")
      .insert({ workspace_id: ctx.workspaceId, user_id: ctx.userId, ...toRow(body) })
      .select("*")
      .single();
    if (error || !data) {
      throw new AppError({ area: "tools", category: "internal", userMessage: "Could not save the contact.", internal: error });
    }
    await logAudit({
      action: "contact.create",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "contact",
      targetId: data.id,
    });
    return apiOk({ contact: data }, { status: 201 });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

/** PATCH /api/contacts — update fields on a contact. */
export async function PATCH(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const { id, ...fields } = updateSchema.parse(await req.json());
    const row = toRow(fields);
    if (Object.keys(row).length === 0) {
      throw new AppError({ area: "tools", category: "validation", userMessage: "Nothing to update." });
    }
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("contacts")
      .update(row)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) {
      throw new AppError({ area: "tools", category: "internal", userMessage: "Could not update the contact.", internal: error });
    }
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}

/** DELETE /api/contacts?id= — remove a contact. */
export async function DELETE(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AppError({ area: "tools", category: "validation", userMessage: "Missing contact id." });
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) {
      throw new AppError({ area: "tools", category: "internal", userMessage: "Could not delete the contact.", internal: error });
    }
    await logAudit({
      action: "contact.delete",
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      targetType: "contact",
      targetId: id,
    });
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "tools", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
