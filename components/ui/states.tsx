import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Friendly empty state with a clear next action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass relative flex flex-col items-center justify-center overflow-hidden rounded-3xl px-6 py-16 text-center animate-fade-in",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="pointer-events-none absolute -top-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      {icon && (
        <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-high text-primary shadow-[inset_0_1px_0_rgba(255,248,236,0.12)]">
          {icon}
        </div>
      )}
      <h3 className="relative text-lg font-semibold">{title}</h3>
      {description && (
        <p className="relative mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Friendly, non-scary error state. Never shows a stack trace. */
export function ErrorState({
  title = "Something went wrong",
  description = "We hit a snag. You can retry, or come back in a moment.",
  onRetry,
  traceId,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  traceId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
      {traceId && (
        <p className="mt-3 font-mono text-xs text-muted-foreground/70">Ref: {traceId}</p>
      )}
    </div>
  );
}

/** Skeleton block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md bg-muted", className)} />;
}
