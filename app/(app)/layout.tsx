import { requireSession } from "@/lib/auth/guards";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden md:flex-row">
      <AppSidebar email={ctx.email} isAdmin={ctx.isAdmin} />
      <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</main>
    </div>
  );
}
