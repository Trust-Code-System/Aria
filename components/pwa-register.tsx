"use client";

import * as React from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Registers the service worker and shows a lightweight install banner when the
 * browser fires beforeinstallprompt (Chrome/Edge desktop + Android).
 */
export function PwaRegister() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW optional — don't block the app */
    });

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (localStorage.getItem("aria-pwa-dismissed") !== "1") setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (choice.outcome === "dismissed") {
      localStorage.setItem("aria-pwa-dismissed", "1");
    }
  }

  function dismiss() {
    setVisible(false);
    localStorage.setItem("aria-pwa-dismissed", "1");
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-[60] w-[min(420px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-[0_18px_50px_rgba(16,16,20,0.18)] md:bottom-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-on-surface">Install Aria on your desktop</p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Open like an app — faster launch, own window, no browser chrome.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-variant"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-variant"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
