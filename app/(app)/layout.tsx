import { requireSession } from "@/lib/auth/guards";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    // h-dvh (not h-screen): tracks the real visible viewport on mobile so the
    // composer/nav are never hidden behind the browser chrome or keyboard.
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden md:flex-row">
      <AppSidebar />
      {/* pb-[64px] keeps content clear of the bottom tab bar on phones. */}
      <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
