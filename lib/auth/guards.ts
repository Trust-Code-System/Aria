import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/auth/workspace-cookie";
import { authBypassEnabled, env, isAdminEmail } from "@/lib/env";
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
  if (authBypassEnabled()) {
    return getBypassSessionContext();
  }

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Active-workspace cookie is a preference, never an authority: membership is
  // re-verified here on EVERY request, so a stale/forged cookie can only ever
  // fall back to the user's own default workspace.
  let workspaceId: string | null = null;
  const requested = cookies().get(WORKSPACE_COOKIE)?.value;
  if (requested) {
    workspaceId = await verifyMembership(supabase, user.id, requested);
  }

  // The `handle_new_user` DB trigger creates the profile + workspace on signup.
  // We read the membership here; if missing (e.g. pre-existing user), bootstrap.
  if (!workspaceId) workspaceId = await getDefaultWorkspaceId(supabase, user.id);
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

/**
 * When AUTH_DISABLED=true, impersonate ADMIN_EMAIL via the service role so the
 * app is usable without magic-link rate limits. Not for public production.
 */
async function getBypassSessionContext(): Promise<SessionContext | null> {
  const email = env.adminEmails[0];
  if (!email) {
    throw new AppError({
      area: "auth",
      category: "config_missing",
      userMessage: "AUTH_DISABLED is on, but ADMIN_EMAIL is missing.",
      internal: "Set ADMIN_EMAIL to an existing Supabase Auth user email.",
    });
  }

  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    let user = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;

    if (!user) {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw new AppError({
          area: "auth",
          category: "config_missing",
          userMessage: `Could not create bypass user for ${email}.`,
          internal: created.error,
        });
      }
      user = created.data.user;
    }

    let workspaceId = await getDefaultWorkspaceId(admin, user.id);
    if (!workspaceId) {
      workspaceId = await bootstrapWorkspace(admin, user.id, user.email ?? email);
    }

    return {
      userId: user.id,
      email: user.email ?? email,
      workspaceId,
      isAdmin: true,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError({
      area: "auth",
      category: "config_missing",
      userMessage: "Auth bypass failed. Check SUPABASE_SERVICE_ROLE_KEY and ADMIN_EMAIL.",
      internal: err,
    });
  }
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

async function verifyMembership(
  supabase: { from: (t: string) => any },
  userId: string,
  workspaceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.workspace_id ?? null;
}

async function getDefaultWorkspaceId(
  supabase: { from: (t: string) => any },
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
  supabase: { from: (t: string) => any },
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
