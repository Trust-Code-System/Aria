"use client";

import * as React from "react";

type EyesGateProps = {
  isAuthenticated: boolean;
  signedOut: boolean;
};

export function EyesGate({ isAuthenticated, signedOut }: EyesGateProps) {
  const mode = signedOut ? "closing" : "opening";

  React.useEffect(() => {
    const destination = signedOut ? "/login" : isAuthenticated ? "/chat" : "/login?next=/chat";
    const delay = signedOut ? 1050 : 2100;
    const timer = window.setTimeout(() => {
      window.location.replace(destination);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated, signedOut]);

  return (
    <main className={`eyes-gate ${mode}`} aria-label={signedOut ? "Signing out" : "Opening Aria"}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="eyes" aria-hidden="true">
        <Eye side="left" />
        <Eye side="right" />
      </div>
      <span className="sr-only">{signedOut ? "Signing out" : "Opening new chat"}</span>

      <style jsx>{`
        .eyes-gate {
          position: relative;
          display: grid;
          min-height: 100svh;
          place-items: center;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 54%, rgba(142, 58, 255, 0.38), transparent 29%),
            radial-gradient(circle at 50% 42%, rgba(245, 226, 255, 0.14), transparent 24%),
            linear-gradient(180deg, #090909 0%, #030303 62%, #000 100%);
        }

        .eyes-gate::before {
          position: absolute;
          inset: 0;
          content: "";
          background:
            linear-gradient(115deg, transparent 0 34%, rgba(255, 255, 255, 0.035) 35%, transparent 44%),
            linear-gradient(245deg, transparent 0 36%, rgba(255, 255, 255, 0.028) 37%, transparent 47%);
          opacity: 0.48;
        }

        .ambient {
          position: absolute;
          border-radius: 999px;
          filter: blur(42px);
          opacity: 0;
          pointer-events: none;
        }

        .ambient-one {
          width: min(64vw, 620px);
          height: min(16vw, 150px);
          background: rgba(152, 82, 255, 0.72);
          transform: translateY(16px);
        }

        .ambient-two {
          width: min(42vw, 420px);
          height: min(10vw, 96px);
          background: rgba(239, 205, 255, 0.42);
          transform: translateY(5px);
        }

        .eyes {
          position: relative;
          z-index: 1;
          display: flex;
          width: min(78vw, 760px);
          align-items: center;
          justify-content: center;
          gap: clamp(36px, 8.4vw, 98px);
          transform: translateY(-3vh);
          filter:
            drop-shadow(0 34px 44px rgba(0, 0, 0, 0.7))
            drop-shadow(0 0 34px rgba(142, 67, 255, 0.3));
        }

        .opening .eyes {
          animation: settle 1500ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .opening .ambient {
          animation: glow-in 1450ms ease-out both;
        }

        .closing .eyes {
          animation: quiet 1000ms ease-in both;
        }

        .closing .ambient {
          animation: glow-out 1000ms ease-in both;
        }

        @keyframes settle {
          0% {
            opacity: 0.72;
            transform: translateY(-3vh) scale(0.94);
          }
          62% {
            opacity: 1;
            transform: translateY(-3vh) scale(1.015);
          }
          100% {
            opacity: 1;
            transform: translateY(-3vh) scale(1);
          }
        }

        @keyframes quiet {
          0% {
            opacity: 1;
            transform: translateY(-3vh) scale(1);
          }
          100% {
            opacity: 0.76;
            transform: translateY(-3vh) scale(0.96);
          }
        }

        @keyframes glow-in {
          0%,
          22% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        @keyframes glow-out {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .eyes,
          .ambient {
            animation-duration: 1ms !important;
          }
        }
      `}</style>
    </main>
  );
}

function Eye({ side }: { side: "left" | "right" }) {
  return (
    <div className={`eye ${side}`}>
      <div className="socket">
        <div className="glass" />
        <div className="matrix" />
        <div className="flare" />
        <div className="pupil" />
        <div className="slash slash-one" />
        <div className="slash slash-two" />
      </div>
      <div className="lid lid-top" />
      <div className="lid lid-bottom" />

      <style jsx>{`
        .eye {
          position: relative;
          width: clamp(150px, 25vw, 286px);
          aspect-ratio: 2.78 / 1;
          transform-origin: center;
          clip-path: polygon(0 23%, 17% 7%, 100% 0, 94% 58%, 80% 88%, 16% 75%);
        }

        .eye.left {
          transform: perspective(660px) rotateY(14deg) rotate(-6deg) skewX(-9deg);
        }

        .eye.right {
          transform: perspective(660px) rotateY(-14deg) rotate(6deg) skewX(9deg) scaleX(-1);
        }

        .socket,
        .glass,
        .matrix,
        .flare,
        .pupil,
        .slash,
        .lid {
          position: absolute;
          inset: 0;
        }

        .socket {
          overflow: hidden;
          border: 1px solid rgba(229, 205, 255, 0.18);
          background:
            linear-gradient(145deg, rgba(255, 255, 255, 0.14), transparent 19%),
            linear-gradient(180deg, #17131f 0%, #050308 100%);
          box-shadow:
            inset 0 0 0 1px rgba(238, 222, 255, 0.05),
            inset 0 -18px 26px rgba(0, 0, 0, 0.84),
            0 0 0 1px rgba(0, 0, 0, 0.86);
        }

        .glass {
          inset: 13% 7% 14% 9%;
          clip-path: polygon(0 43%, 21% 9%, 100% 0, 90% 61%, 72% 94%, 10% 74%);
          background:
            radial-gradient(circle at 42% 52%, rgba(255, 255, 255, 1) 0 5%, transparent 6%),
            radial-gradient(circle at 53% 54%, rgba(155, 70, 255, 0.98) 0 9%, transparent 10%),
            radial-gradient(ellipse at 50% 52%, rgba(253, 245, 255, 1) 0 24%, rgba(184, 86, 255, 1) 25% 52%, transparent 54%),
            linear-gradient(90deg, rgba(133, 80, 255, 0.28), rgba(250, 235, 255, 0.86), rgba(166, 64, 255, 0.32));
          box-shadow:
            0 0 28px rgba(179, 92, 255, 1),
            0 0 70px rgba(143, 74, 255, 0.78),
            inset 0 0 16px rgba(255, 255, 255, 0.58);
        }

        .matrix {
          inset: 13% 7% 14% 9%;
          clip-path: polygon(0 43%, 21% 9%, 100% 0, 90% 61%, 72% 94%, 10% 74%);
          background:
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.34) 0 1px, transparent 1px 4px),
            repeating-linear-gradient(0deg, rgba(238, 211, 255, 0.32) 0 1px, transparent 1px 4px);
          mix-blend-mode: screen;
          opacity: 0.9;
        }

        .flare {
          inset: 22% 15% 25% 16%;
          clip-path: polygon(7% 46%, 55% 14%, 96% 31%, 78% 66%, 23% 74%);
          background: rgba(252, 239, 255, 0.95);
          filter: blur(1px);
          opacity: 0.78;
        }

        .pupil {
          inset: 26% 39% 24% 36%;
          clip-path: polygon(24% 7%, 73% 17%, 100% 52%, 72% 88%, 18% 80%, 0 43%);
          background:
            radial-gradient(circle at 48% 45%, rgba(204, 102, 255, 1) 0 20%, transparent 21%),
            linear-gradient(135deg, #16051f, #030004);
          box-shadow:
            0 0 18px rgba(203, 101, 255, 0.92),
            inset 0 0 10px rgba(220, 136, 255, 0.72);
        }

        .slash {
          inset: 12% 2% 12% 5%;
          border-top: 4px solid rgba(255, 245, 245, 0.24);
          border-radius: 50%;
          transform: rotate(18deg);
          opacity: 0.48;
        }

        .slash-two {
          inset: 20% 40% 16% 20%;
          border-top-color: rgba(190, 105, 255, 0.4);
          transform: rotate(-25deg);
        }

        .lid {
          z-index: 3;
          background:
            linear-gradient(145deg, rgba(255, 255, 255, 0.07), transparent 20%),
            linear-gradient(180deg, #070707, #010101);
        }

        .lid-top {
          bottom: 43%;
          transform-origin: top;
        }

        .lid-bottom {
          top: 49%;
          transform-origin: bottom;
        }

        :global(.opening) .lid-top {
          animation: open-top 900ms cubic-bezier(0.16, 1, 0.3, 1) 90ms both;
        }

        :global(.opening) .lid-bottom {
          animation: open-bottom 900ms cubic-bezier(0.16, 1, 0.3, 1) 90ms both;
        }

        :global(.opening) .glass,
        :global(.opening) .matrix,
        :global(.opening) .flare,
        :global(.opening) .pupil {
          animation: ignite 1150ms ease-out both;
        }

        :global(.closing) .lid-top {
          animation: close-top 850ms cubic-bezier(0.7, 0, 0.84, 0) both;
        }

        :global(.closing) .lid-bottom {
          animation: close-bottom 850ms cubic-bezier(0.7, 0, 0.84, 0) both;
        }

        :global(.closing) .glass,
        :global(.closing) .matrix,
        :global(.closing) .flare,
        :global(.closing) .pupil {
          animation: dim 760ms ease-in both;
        }

        @keyframes open-top {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-94%);
          }
        }

        @keyframes open-bottom {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(96%);
          }
        }

        @keyframes close-top {
          0% {
            transform: translateY(-94%);
          }
          100% {
            transform: translateY(0);
          }
        }

        @keyframes close-bottom {
          0% {
            transform: translateY(96%);
          }
          100% {
            transform: translateY(0);
          }
        }

        @keyframes ignite {
          0%,
          18% {
            opacity: 0.38;
            filter: brightness(0.45);
          }
          52% {
            opacity: 1;
            filter: brightness(1.55);
          }
          100% {
            opacity: 1;
            filter: brightness(1);
          }
        }

        @keyframes dim {
          0% {
            opacity: 1;
            filter: brightness(1);
          }
          100% {
            opacity: 0;
            filter: brightness(0);
          }
        }

        @media (max-width: 640px) {
          .eye {
            width: clamp(120px, 38vw, 180px);
          }
        }
      `}</style>
    </div>
  );
}
