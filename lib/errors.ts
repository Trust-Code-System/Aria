/**
 * Application error taxonomy. User-facing messages are always safe to show;
 * internal detail is kept separate and only ever routed to the admin logs.
 */

export type FeatureArea =
  | "auth"
  | "chat"
  | "ingestion"
  | "rag"
  | "research"
  | "memory"
  | "reports"
  | "admin"
  | "upload"
  | "tools"
  | "tasks"
  | "approvals"
  | "system";

export type ErrorCategory =
  | "validation"
  | "auth"
  | "not_found"
  | "provider_error"
  | "rate_limit"
  | "config_missing"
  | "internal";

export class AppError extends Error {
  readonly userMessage: string;
  readonly area: FeatureArea;
  readonly category: ErrorCategory;
  readonly statusCode: number;
  readonly internal?: unknown;

  constructor(opts: {
    userMessage: string;
    area: FeatureArea;
    category: ErrorCategory;
    statusCode?: number;
    internal?: unknown;
  }) {
    super(opts.userMessage);
    this.name = "AppError";
    this.userMessage = opts.userMessage;
    this.area = opts.area;
    this.category = opts.category;
    this.statusCode = opts.statusCode ?? defaultStatus(opts.category);
    this.internal = opts.internal;
  }
}

function defaultStatus(category: ErrorCategory): number {
  switch (category) {
    case "validation":
      return 400;
    case "auth":
      return 401;
    case "not_found":
      return 404;
    case "rate_limit":
      return 429;
    case "config_missing":
      return 503;
    default:
      return 500;
  }
}

export const configMissing = (area: FeatureArea, what: string) =>
  new AppError({
    area,
    category: "config_missing",
    userMessage: `${what} is not configured yet. Add the required API key in your environment to enable this feature.`,
  });

export const unauthorized = () =>
  new AppError({
    area: "auth",
    category: "auth",
    userMessage: "You need to sign in to do that.",
  });
