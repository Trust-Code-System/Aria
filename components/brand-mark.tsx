"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Brand logo. Renders /logo.png if present, otherwise falls back to the shield
 * glyph — so the app never shows a broken image before the asset is added.
 * Drop your logo at `public/logo.png` (square works best).
 */
export function BrandMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-primary text-primary-foreground",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <svg
          width={size * 0.56}
          height={size * 0.56}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <path d="M12 3 4 7v6c0 4.5 3.4 7.3 8 8 4.6-.7 8-3.5 8-8V7l-8-4z" />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-glass-3d-512.png"
      alt="Aria"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn("rounded-lg object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}
