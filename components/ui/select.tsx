"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  className,
  buttonClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-3 text-left text-sm text-on-surface shadow-[inset_0_1px_0_rgba(255,248,236,0.08)] transition hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          buttonClassName,
        )}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-on-surface-variant")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-on-surface-variant transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-40 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-outline-variant bg-surface-container p-1.5 shadow-2xl backdrop-blur-xl">
          <div role="listbox" className="space-y-1">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                    active
                      ? "bg-secondary-container text-on-secondary-container"
                      : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{option.label}</span>
                    {option.description && (
                      <span className="mt-0.5 block text-xs opacity-75">{option.description}</span>
                    )}
                  </span>
                  {active && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
