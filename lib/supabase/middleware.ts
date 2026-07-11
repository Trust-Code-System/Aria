import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, configured } from "@/lib/env";

/**
 * Refreshes the Supabase session on every request and guards protected routes.
 * If Supabase is not configured, we let requests through (app runs in a
 * "setup required" state rather than hard-failing).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!configured.supabase) {
    return response;
  }

  // Temporary open access — skip login gate. Turn off AUTH_DISABLED to restore.
  if (env.authDisabled) {
    if (request.nextUrl.pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/chat";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const authCode = request.nextUrl.searchParams.get("code");

  // Magic-link / OAuth codes must hit /auth/callback to set the session cookie.
  // Older emails redirected to /chat or /login with ?code= — forward them.
  if (authCode && pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    if (!url.searchParams.get("next")) {
      const next =
        pathname === "/login"
          ? request.nextUrl.searchParams.get("next") || "/chat"
          : pathname;
      url.searchParams.set("next", next);
    }
    return NextResponse.redirect(url);
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  return response;
}

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/today",
  "/projects",
  "/agents",
  "/connections",
  "/knowledge",
  "/memory",
  "/reports",
  "/admin",
  "/settings",
  "/chat",
  "/tasks",
  "/approvals",
  "/contacts",
];
