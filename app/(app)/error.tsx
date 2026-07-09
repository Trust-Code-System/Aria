"use client";

import { ErrorState } from "@/components/ui/states";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <ErrorState
        title="This page ran into a problem"
        description="Your data is safe. You can retry, or navigate elsewhere and come back."
        onRetry={reset}
        traceId={error.digest}
      />
    </div>
  );
}
