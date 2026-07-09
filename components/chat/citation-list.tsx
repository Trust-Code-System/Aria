"use client";

import * as React from "react";
import { FileText, Globe } from "lucide-react";
import type { Citation } from "@/lib/ai/types";

export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations || citations.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Sources</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {citations.map((c) => (
          <SourceCard key={c.index} c={c} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ c }: { c: Citation }) {
  const inner = (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-left transition-colors hover:bg-muted">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[11px] font-semibold text-primary">
        {c.index}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-xs font-medium">
          {c.kind === "web" ? (
            <Globe className="h-3 w-3 shrink-0" />
          ) : (
            <FileText className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{c.title}</span>
          {c.page ? <span className="text-muted-foreground">· p.{c.page}</span> : null}
        </p>
        {c.snippet && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{c.snippet}</p>
        )}
      </div>
    </div>
  );

  if (c.url) {
    return (
      <a href={c.url} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return inner;
}
