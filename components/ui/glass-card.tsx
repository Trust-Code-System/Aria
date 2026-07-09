import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, glow = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          glow ? "glass-panel-glow" : "glass-panel",
          "p-5 flex flex-col",
          className
        )}
        {...props}
      />
    );
  }
);
GlassCard.displayName = "GlassCard";
