import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { env, configured } from "@/lib/env";

/**
 * Server Supabase client bound to the request's cookies. Respects RLS as the
 * signed-in user. Use this in Server Components, route handlers, and actions.
 *
 * When AUTH_DISABLED is on, returns the service-role client so bypass sessions
 * can still read/write (there is no cookie user for RLS).
 */
export function createServerSupabase() {
  if (env.authDisabled && configured.supabaseAdmin) {
    return createAdminSupabase() as ReturnType<typeof createServerClient>;
  }

  const cookieStore = cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Session refresh is handled by middleware — safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client. BYPASSES RLS. Only use in trusted server code for
 * background jobs (ingestion, admin logging) where we deliberately scope
 * queries by user_id/workspace_id ourselves. Never expose to the client.
 */
export function createAdminSupabase() {
  if (!configured.supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return createSbClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
