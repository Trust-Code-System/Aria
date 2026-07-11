import * as React from "react";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/navigation/back-button";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";

export function PageShell({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-6xl px-5 py-8 sm:px-8", className)}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <WorkspaceSwitcher />
        </div>
      </div>
      {children}
    </div>
  );
}
