"use client";

import * as React from "react";

/**
 * Smooths a streaming string into a steady "typing" animation.
 *
 * The network delivers tokens in bursts (sometimes a whole sentence at once).
 * This hook decouples what's *displayed* from what's *received*: the displayed
 * text catches up to the full `target` at an adaptive character cadence, so the
 * answer always reads as if it's being typed — with a blinking caret — no matter
 * how choppy the underlying stream is.
 *
 * - `target`  the full accumulated text so far (grows as tokens arrive)
 * - `active`  whether the stream is still open (keeps the caret on during the
 *             initial wait, before the first character)
 *
 * Returns the substring to render plus whether to show the caret. History
 * messages (stable `target`, `active=false`) render instantly with no animation.
 */
export function useTypewriter(target: string, active: boolean): { text: string; caret: boolean } {
  const [display, setDisplay] = React.useState(target);
  const targetRef = React.useRef(target);
  const idxRef = React.useRef(target.length);

  targetRef.current = target;

  // If the target was replaced/shortened (e.g. a new message reused the node),
  // resync so we never render past the end of the string.
  if (target.length < idxRef.current) {
    idxRef.current = target.length;
  }

  React.useEffect(() => {
    let raf = 0;
    let last = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const dt = last ? (now - last) / 1000 : 0;
      last = now;

      const full = targetRef.current;
      const backlog = full.length - idxRef.current;

      if (backlog > 0) {
        // Aim to clear the current backlog in ~0.35s so it stays close behind the
        // stream, but clamp to a human-typing range so short replies don't blink past.
        const cps = Math.min(Math.max(backlog / 0.35, 45), 1800);
        const advance = Math.max(1, Math.floor(cps * dt) || 1);
        idxRef.current = Math.min(full.length, idxRef.current + advance);
        setDisplay(full.slice(0, idxRef.current));
      } else if (backlog < 0) {
        idxRef.current = full.length;
        setDisplay(full);
      }

      // Keep animating while there's backlog or the stream is still open; otherwise
      // suspend the loop until deps change (avoids a rAF per idle history message).
      if (idxRef.current < targetRef.current.length || active) {
        raf = requestAnimationFrame(tick);
      } else {
        last = 0;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [target, active]);

  const caret = active || idxRef.current < target.length;
  return { text: display, caret };
}
