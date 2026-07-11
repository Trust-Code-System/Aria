import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, type FeatureArea } from "@/lib/errors";
import { logError } from "@/lib/logging/error-log";

/**
 * Standard JSON error envelope for API routes. Converts any thrown error into a
 * user-safe message, logs the sanitized detail to the admin portal, and returns
 * a trace id the UI can surface for support.
 */
export async function apiError(
  error: unknown,
  ctx: {
    area: FeatureArea;
    workspaceId?: string | null;
    userId?: string | null;
    projectId?: string | null;
    provider?: string | null;
    latencyMs?: number | null;
  },
): Promise<NextResponse> {
  const isApp = error instanceof AppError;
  const isZod = error instanceof ZodError;
  const status = isApp ? error.statusCode : isZod ? 400 : 500;
  const userMessage = isApp
    ? error.userMessage
    : isZod
      ? error.issues[0]?.message || "Invalid request."
      : "Something went wrong. The issue was logged and we can look into it.";

  const traceId = await logError({
    area: ctx.area,
    category: isApp ? error.category : isZod ? "validation" : "internal",
    provider: ctx.provider,
    error,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    projectId: ctx.projectId,
    statusCode: status,
    latencyMs: ctx.latencyMs,
  });

  return NextResponse.json(
    {
      error: userMessage,
      traceId,
      category: isApp ? error.category : isZod ? "validation" : "internal",
    },
    { status },
  );
}

export function apiOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
