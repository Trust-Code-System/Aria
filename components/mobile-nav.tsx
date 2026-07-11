"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SquarePen, ListChecks, ShieldCheck, ContactRound, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/ui/haptics";

/**
 * App-style bottom tab bar for phones (hidden ≥ md, where the sidebar takes
 * over). Native feel: safe-area padding, backdrop blur, haptic tap, springy
 * active state. Everything else stays reachable via the top-bar drawer.
 */
const TABS = [
  { href: "/chat", label: "Chat", icon: SquarePen },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/dashboard", label: "Home", icon: Gauge },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-surface-container-low/90 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => haptic("light")}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex select-none flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-transform duration-150 active:scale-90",
                active ? "text-primary" : "text-on-surface-variant",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200",
                  active && "bg-primary-container text-on-primary-container",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
