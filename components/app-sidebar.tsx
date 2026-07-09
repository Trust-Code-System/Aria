"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  LayoutDashboard,
  FolderKanban,
  BookOpen,
  Brain,
  FileText,
  ShieldAlert,
  Settings,
  MessageSquarePlus,
  LogOut,
  Menu,
  X,
  Bot,
  Plug,
  ListTodo,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand-mark";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/admin", label: "Admin", icon: ShieldAlert, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({
  email,
  isAdmin,
}: {
  email: string | null;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/?state=closed");
    router.refresh();
  };

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  const content = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-container-low text-on-surface">
      <div className="flex items-center gap-2 px-4 py-3">
        <BrandMark size={32} />
        <span className="text-base font-semibold tracking-tight">Aria</span>
      </div>

      <div className="px-3">
        <Link
          href="/chat"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-lg bg-primary-container px-3 py-2 text-sm font-medium text-on-primary-container transition hover:bg-inverse-primary hover:text-white"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </Link>
      </div>

      <nav className="mt-3 min-h-0 flex-1 space-y-1 px-3">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border border-outline-variant bg-secondary-container text-on-secondary-container shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-outline-variant p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Ghost</p>
            <p className="text-xs text-on-surface-variant">{isAdmin ? "Admin" : "Member"}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={signOut}
              className="rounded-md p-2 text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface md:hidden">
        <div className="flex items-center gap-2">
          <BrandMark size={28} />
          <span className="font-semibold">Aria</span>
        </div>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-2">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden h-dvh w-64 shrink-0 overflow-hidden border-r border-outline-variant bg-surface-container-low backdrop-blur-xl md:block">
        {content}
      </aside>

      {/* Mobile drawer */}
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
            {content}
          </div>
        </div>
      )}
    </>
  );
}
