import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/guards";
import { createAdminSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api";
import { configured } from "@/lib/env";

export const runtime = "nodejs";

/** List recent error logs (admin only). Reads via service role. */
export async function GET(req: Request) {
  try {
    await requireAdminApi();
    if (!configured.supabaseAdmin) return apiOk({ errors: [] });
    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area");
    const admin = createAdminSupabase();
    let q = admin
      .from("error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (area) q = q.eq("feature_area", area);
    const { data } = await q;
    return apiOk({ errors: data ?? [] });
  } catch (error) {
    return apiError(error, { area: "admin" });
  }
}

const patchSchema = z.object({ id: z.string().uuid(), resolved: z.boolean() });

/** Mark an error resolved/unresolved. */
export async function PATCH(req: Request) {
  try {
    await requireAdminApi();
    const { id, resolved } = patchSchema.parse(await req.json());
    const admin = createAdminSupabase();
    await admin.from("error_logs").update({ resolved }).eq("id", id);
    return apiOk({ ok: true });
  } catch (error) {
    return apiError(error, { area: "admin" });
  }
}
