"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { configured } from "@/lib/env";
import { BrandMark } from "@/components/brand-mark";

/**
 * Passwordless entry via email OTP (6-digit code). Avoids magic-link expiry
 * and email-client link prefetch burning the token.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/chat";
  const { error: toastError, success } = useToast();
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [step, setStep] = React.useState<"email" | "otp">("email");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const err = params.get("error");
    if (err === "auth" || err === "access_denied" || params.get("error_code") === "otp_expired") {
      toastError("Sign-in failed", "That link expired or was already used. Use a code instead.");
    }
  }, [params, toastError]);

  async function sendCode() {
    if (!configured.supabase) {
      toastError("Setup required", "Add your Supabase keys to .env.local.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await createClient().auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep("otp");
      setOtp("");
      success("Check your inbox", "Enter the 6-digit code we sent you.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      toastError("Could not send code", friendly(msg));
    } finally {
      setLoading(false);
    }
  }

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    await sendCode();
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!configured.supabase) return;

    setLoading(true);
    try {
      const { error } = await createClient().auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "email",
      });
      if (error) throw error;
      success("Signed in", "Welcome back.");
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/chat");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      toastError("Invalid code", friendly(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-lg font-body-base bg-white text-zinc-900">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-xl shadow-[0_10px_40px_rgba(16,16,20,0.06)] relative overflow-hidden">
        <div className="flex flex-col items-center mb-xl text-center relative z-10">
          <div className="mb-md flex h-16 w-16 items-center justify-center">
            <BrandMark size={48} />
          </div>
          <h1 className="font-display-lg text-display-lg text-zinc-900 mb-sm tracking-tight">Welcome to Aria</h1>
          <p className="font-body-sm text-body-sm text-zinc-500">
            {step === "email"
              ? "Your private AI workspace, without a password."
              : `Enter the code sent to ${email}`}
          </p>
        </div>

        {!configured.supabase ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-zinc-600 relative z-10">
            Setup required: add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>.
          </div>
        ) : step === "email" ? (
          <form onSubmit={onSendCode} className="space-y-lg relative z-10">
            <div>
              <label className="block font-label-md text-label-md text-zinc-800 mb-sm" htmlFor="email">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-md flex items-center pointer-events-none text-zinc-400">
                  <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                    mail
                  </span>
                </span>
                <input
                  className="w-full bg-white border border-zinc-300 rounded-[10px] py-md pl-[44px] pr-md text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
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
                className="w-full bg-violet-600 text-white font-label-md text-label-md rounded-full py-md px-lg flex items-center justify-center gap-sm hover:bg-violet-700 transition-all duration-200 shadow-[0_4px_12px_rgba(124,58,237,0.28)] active:scale-[0.98] disabled:opacity-60"
                type="submit"
                disabled={loading}
              >
                <span>{loading ? "Sending code…" : "Send me a code"}</span>
                {!loading && (
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    arrow_forward
                  </span>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-lg relative z-10">
            <div>
              <label className="block font-label-md text-label-md text-zinc-800 mb-sm" htmlFor="otp">
                6-digit code
              </label>
              <input
                className="w-full bg-white border border-zinc-300 rounded-[10px] py-md px-md text-center text-2xl tracking-[0.4em] text-zinc-900 placeholder:text-zinc-400 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                id="otp"
                name="otp"
                placeholder="000000"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoFocus
              />
            </div>

            <div className="pt-sm space-y-3">
              <button
                className="w-full bg-violet-600 text-white font-label-md text-label-md rounded-full py-md px-lg flex items-center justify-center gap-sm hover:bg-violet-700 transition-all duration-200 shadow-[0_4px_12px_rgba(124,58,237,0.28)] active:scale-[0.98] disabled:opacity-60"
                type="submit"
                disabled={loading || otp.length !== 6}
              >
                <span>{loading ? "Verifying…" : "Sign in"}</span>
              </button>
              <button
                type="button"
                className="w-full text-sm text-zinc-500 hover:text-zinc-800 transition-colors disabled:opacity-60"
                disabled={loading}
                onClick={() => {
                  setStep("email");
                  setOtp("");
                }}
              >
                Use a different email
              </button>
              <button
                type="button"
                className="w-full text-sm text-violet-600 hover:text-violet-800 transition-colors disabled:opacity-60"
                disabled={loading}
                onClick={() => void sendCode()}
              >
                Resend code
              </button>
            </div>
          </form>
        )}

        <p className="mt-xl text-center text-sm text-zinc-500 relative z-10">
          We email a one-time code — no password to remember.
        </p>
      </div>
    </div>
  );
}

function friendly(msg: string): string {
  if (/rate limit/i.test(msg)) return "Too many codes were requested. Please wait a moment and try again.";
  if (/expired|invalid/i.test(msg)) return "That code is invalid or expired. Request a new one.";
  return msg;
}
