"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { configured } from "@/lib/env";

/**
 * Passwordless entry for this personal workspace. The signed email link keeps
 * the Supabase database session intact without asking the owner for a password.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") || "/chat";
  const { error: toastError, success } = useToast();
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [linkSent, setLinkSent] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured.supabase) {
      toastError("Setup required", "Add your Supabase keys to .env.local.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await createClient().auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}${next}`,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setLinkSent(true);
      success("Check your inbox", "Open the secure link to enter Aria.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      toastError("Could not send your sign-in link", friendly(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-lg font-body-base text-on-surface bg-background"
      style={{
        backgroundImage:
          "radial-gradient(circle at top right, rgba(147, 64, 255, 0.18), transparent 40%), radial-gradient(circle at bottom left, rgba(215, 200, 170, 0.16), transparent 42%)",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="w-full max-w-md bg-surface-container border border-outline-variant rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-container rounded-full blur-[80px] opacity-20 pointer-events-none" />

        <div className="flex flex-col items-center mb-xl text-center relative z-10">
          <div className="w-20 h-20 bg-surface-container-highest rounded-full flex items-center justify-center mb-md border border-outline-variant shadow-sm relative group overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Aria"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              src="/logo-glass-3d-512.png"
              onError={(e) => ((e.currentTarget.style.display = "none"))}
            />
          </div>
          <h1 className="font-display-lg text-display-lg text-on-surface mb-sm tracking-tight">Welcome to Aria</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Your private AI workspace, without a password.
          </p>
        </div>

        {!configured.supabase ? (
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm text-on-surface-variant relative z-10">
            Setup required: add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-lg relative z-10">
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-sm" htmlFor="email">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-md flex items-center pointer-events-none text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>mail</span>
                </span>
                <input
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-[10px] py-md pl-[44px] pr-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-200"
                  id="email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-sm">
              <button
                className="w-full bg-primary-container text-on-primary-container font-label-md text-label-md rounded-full py-md px-lg flex items-center justify-center gap-sm hover:bg-inverse-primary hover:text-white transition-all duration-200 shadow-[0_4px_12px_rgba(147,64,255,0.24)] active:scale-[0.98] disabled:opacity-60"
                type="submit"
                disabled={loading}
              >
                <span>{loading ? "Sending link…" : linkSent ? "Send another sign-in link" : "Send me a sign-in link"}</span>
                {!loading && (
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>arrow_forward</span>
                )}
              </button>
            </div>
          </form>
        )}

        <p className="mt-xl text-center text-sm text-on-surface-variant relative z-10">
          We use a one-time link to keep your personal data private. No password to remember.
        </p>
      </div>
    </div>
  );
}

function friendly(msg: string): string {
  if (/rate limit/i.test(msg)) return "Too many links were requested. Please wait a moment and try again.";
  return msg;
}
