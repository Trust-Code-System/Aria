import { cn } from "@/lib/utils";

/**
 * Aria's voice monogram: a flowing "A" whose crossbar is a live waveform.
 * It stays recognizable as a single-color mark while the gradient adds energy.
 */
export function BrandMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      role="img"
      aria-label="Aria"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("aria-mark shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <path
        d="M5.5 25.5C9 21.5 9.5 10.5 16 5.5c6.5 5 7 16 10.5 20"
        stroke="#6D5CFF"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="aria-mark-wave"
        d="M8.75 19.5h1.45c1.75 0 1.85-3.7 3.55-3.7 1.9 0 1.8 6.35 4.15 6.35 1.95 0 2.15-3.65 4-3.65h1.35"
        stroke="#EC4899"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="aria-mark-pulse" cx="17.9" cy="22.15" r="1.35" fill="#EC4899" />
    </svg>
  );
}
