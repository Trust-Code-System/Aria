"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  Gauge,
  FolderOpen,
  LibraryBig,
  BrainCircuit,
  Files,
  Settings2,
  SquarePen,
  LogOut,
  Menu,
  X,
  Workflow,
  Cable,
  ListChecks,
  ShieldCheck,
  ContactRound,
  PanelLeftClose,
  PanelLeftOpen,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand-mark";
import { SidebarChatHistory } from "@/components/chat/sidebar-chat-history";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/agents", label: "Agents", icon: Workflow },
  { href: "/connections", label: "Connections", icon: Cable },
  { href: "/knowledge", label: "Knowledge", icon: LibraryBig },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/memory", label: "Memory", icon: BrainCircuit },
  { href: "/reports", label: "Reports", icon: Files },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(localStorage.getItem("aria-sidebar-collapsed") === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("aria-sidebar-collapsed", String(next));
      return next;
    });
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/?state=closed");
    router.refresh();
  };

  const renderContent = (compact: boolean) => (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-container-low text-on-surface">
      <div className={cn("flex h-14 shrink-0 items-center", compact ? "justify-center px-2" : "gap-2 px-4")}>
        {!compact && <BrandMark size={32} />}
        {!compact && <span className="text-base font-semibold tracking-tight">Aria</span>}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "ml-auto hidden h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-surface-variant hover:text-on-surface md:flex",
            compact && "ml-0",
          )}
          aria-label={compact ? "Expand sidebar" : "Minimize sidebar"}
          title={compact ? "Expand sidebar" : "Minimize sidebar"}
        >
          {compact ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>

      <div className={cn("shrink-0", compact ? "px-2" : "px-3")}>
        <Link
          href="/chat"
          onClick={() => setOpen(false)}
          title={compact ? "New chat" : undefined}
          className={cn(
            "flex h-10 items-center rounded-xl bg-primary-container text-sm font-medium text-on-primary-container transition hover:bg-inverse-primary hover:text-white",
            compact ? "justify-center px-0" : "gap-2 px-3",
          )}
        >
          <SquarePen className="h-[18px] w-[18px]" />
          {!compact && "New chat"}
        </Link>
      </div>

      <div className={cn("scrollbar-thin mt-2 min-h-0 flex-1 overflow-y-auto pb-2", compact ? "px-2" : "px-3")}>
        <SidebarChatHistory compact={compact} onNavigate={() => setOpen(false)} />

        {!compact && (
          <div className="my-3 border-t border-outline-variant/70" />
        )}

        {compact && (
          <Link
            href="/chat/history"
            onClick={() => setOpen(false)}
            title="History"
            className={cn(
              "mt-2 flex h-10 items-center justify-center rounded-xl text-sm font-medium transition-colors",
              pathname.startsWith("/chat/history")
                ? "border border-outline-variant bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface",
            )}
          >
            <History className="h-[18px] w-[18px]" />
          </Link>
        )}

        <nav className="mt-1 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                title={compact ? item.label : undefined}
                className={cn(
                  "flex h-10 items-center rounded-xl text-sm font-medium transition-colors",
                  compact ? "justify-center px-0" : "gap-3 px-3",
                  active
                    ? "border border-outline-variant bg-secondary-container text-on-secondary-container shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {!compact && item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={cn("shrink-0 pb-3", compact ? "px-2" : "px-3")}>
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          title={compact ? "Settings" : undefined}
          className={cn(
            "flex h-10 items-center rounded-xl text-sm font-medium transition-colors",
            compact ? "justify-center px-0" : "gap-3 px-3",
            pathname === "/settings" || pathname.startsWith("/settings/")
              ? "bg-secondary-container text-on-secondary-container"
              : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface",
          )}
        >
          <Settings2 className="h-[18px] w-[18px]" />
          {!compact && "Settings"}
        </Link>
      </div>

      <div className={cn("shrink-0 border-t border-outline-variant", compact ? "p-2" : "p-3")}>
        <div className={cn("flex items-center", compact ? "justify-center" : "justify-between")}>
          {!compact && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Ghost</p>
              <p className="truncate text-xs text-on-surface-variant">Personal workspace</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface md:hidden">
        <div className="flex items-center gap-2">
          <BrandMark size={28} />
          <span className="font-semibold">Aria</span>
        </div>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-2">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <aside
        className={cn(
          "hidden h-dvh shrink-0 overflow-hidden border-r border-outline-variant bg-surface-container-low backdrop-blur-xl transition-[width] duration-200 md:block",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        {renderContent(collapsed)}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 overflow-hidden border-r border-outline-variant bg-surface-container-low backdrop-blur-xl shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 z-10 rounded-md p-2 text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {renderContent(false)}
          </div>
        </div>
      )}
    </>
  );
}
