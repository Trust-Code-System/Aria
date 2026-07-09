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
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
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
  "/projects",
  "/agents",
  "/connections",
  "/knowledge",
  "/memory",
  "/reports",
  "/admin",
  "/settings",
  "/chat",
];
