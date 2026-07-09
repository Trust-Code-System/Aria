import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/env";
import { unauthorized, AppError } from "@/lib/errors";

export interface SessionContext {
  userId: string;
  email: string | null;
  workspaceId: string;
  isAdmin: boolean;
}

/**
 * Resolve the signed-in user and their default workspace. Ensures a profile +
 * workspace exist (idempotent bootstrap). Redirects to /login for pages.
 * Throws AppError for API routes (use `requireSessionApi`).
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // The `handle_new_user` DB trigger creates the profile + workspace on signup.
  // We read the membership here; if missing (e.g. pre-existing user), bootstrap.
  let workspaceId = await getDefaultWorkspaceId(supabase, user.id);
  if (!workspaceId) {
    workspaceId = await bootstrapWorkspace(supabase, user.id, user.email ?? null);
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    workspaceId,
    isAdmin: isAdminEmail(user.email),
  };
}

/** For pages: redirect to /login if not authed. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** For pages under /admin. */
export async function requireAdmin(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!ctx.isAdmin) redirect("/dashboard");
  return ctx;
}

/** For API route handlers: throw AppError instead of redirecting. */
export async function requireSessionApi(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw unauthorized();
  return ctx;
}

export async function requireAdminApi(): Promise<SessionContext> {
  const ctx = await requireSessionApi();
  if (!ctx.isAdmin) {
    throw new AppError({
      area: "admin",
      category: "auth",
      statusCode: 403,
      userMessage: "You do not have access to the admin area.",
    });
  }
  return ctx;
}

async function getDefaultWorkspaceId(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.workspace_id ?? null;
}

async function bootstrapWorkspace(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  email: string | null,
): Promise<string> {
  const { data: ws, error } = await supabase
    .from("workspaces")
    .insert({ name: "Personal", owner_id: userId })
    .select("id")
    .single();
  if (error || !ws) {
    throw new AppError({
      area: "auth",
      category: "internal",
      userMessage: "We could not set up your workspace. Please try again.",
      internal: error,
    });
  }
  await supabase
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  await supabase
    .from("profiles")
    .upsert({ id: userId, email, display_name: email?.split("@")[0] ?? "You" });
  return ws.id;
}
