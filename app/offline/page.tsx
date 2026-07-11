import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export const metadata = { title: "Offline · Aria" };

/** Shown by the service worker when the network is unavailable. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center text-zinc-900">
      <BrandMark size={48} />
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-zinc-500">
        Aria needs a connection for chat and connectors. Reconnect, then try again.
      </p>
      <Link
        href="/chat"
        className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
      >
        Retry
      </Link>
    </main>
  );
}
