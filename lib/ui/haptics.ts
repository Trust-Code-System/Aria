"use client";

/**
 * Haptic feedback for mobile — same vocabulary as a native app.
 *
 * Uses the Vibration API where available (Android Chrome/Edge). iOS Safari
 * does not expose vibration to the web, so calls are a silent no-op there —
 * every call site must remain fully functional without haptics.
 */

type HapticKind = "light" | "medium" | "success" | "warning" | "error";

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 10, // taps: nav, buttons
  medium: 20, // primary actions: send, run
  success: [12, 60, 20], // completed / approved
  warning: [18, 90, 18], // needs attention
  error: [40, 60, 40], // failed / rejected
};

export function haptic(kind: HapticKind = "light"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* never let feedback break the action */
  }
}
