import { EyesGate } from "@/components/landing/eyes-gate";
import { getSessionContext } from "@/lib/auth/guards";
import { configured } from "@/lib/env";

export default async function Landing({
  searchParams,
}: {
  searchParams?: { state?: string };
}) {
  const signedOut = searchParams?.state === "closed";
  let isAuthenticated = false;

  if (configured.supabase && !signedOut) {
    const ctx = await getSessionContext();
    isAuthenticated = Boolean(ctx);
  }

  return <EyesGate isAuthenticated={isAuthenticated} signedOut={signedOut} />;
}
