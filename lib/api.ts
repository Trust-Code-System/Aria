import { NextResponse } from "next/server";
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
  const status = isApp ? error.statusCode : 500;
  const userMessage = isApp
    ? error.userMessage
    : "Something went wrong. The issue was logged and we can look into it.";

  const traceId = await logError({
    area: ctx.area,
    category: isApp ? error.category : "internal",
    provider: ctx.provider,
    error,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    projectId: ctx.projectId,
    statusCode: status,
    latencyMs: ctx.latencyMs,
  });

  return NextResponse.json(
    { error: userMessage, traceId, category: isApp ? error.category : "internal" },
    { status },
  );
}

export function apiOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
