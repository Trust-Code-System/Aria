import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      spacing: {"xs":"4px","unit":"4px","lg":"24px","xxl":"48px","gutter":"24px","margin":"32px","md":"16px","sm":"8px","xl":"32px"},
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        neon: {
          blue: "#6d5cff",
          purple: "#6d5cff",
          cyan: "#8b7bff",
          indigo: "#6d5cff",
        },
        glass: {
          border: "rgba(16, 16, 20, 0.08)",
          background: "rgba(255, 255, 255, 0.72)",
          surface: "rgba(255, 255, 255, 0.85)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
      
        "on-secondary-container": "#1f2937",
        "on-secondary": "#1f2937",
        "on-tertiary-fixed-variant": "#5d3e16",
        "on-background": "#18181b",
        "on-error": "#ffffff",
        "on-surface": "#18181b",
        "error-container": "#fee2e2",
        "primary-container": "#6d5cff",
        "tertiary-fixed-dim": "#fcd34d",
        "error": "#dc2626",
        "surface-bright": "#ffffff",
        "surface-container-high": "#efeff1",
        "on-primary": "#ffffff",
        "on-secondary-fixed": "#1f2937",
        "on-tertiary-container": "#5d3e16",
        "tertiary-container": "#fef3c7",
        "tertiary-fixed": "#f4dfb7",
        "tertiary": "#f59e0b",
        "surface-tint": "#6d5cff",
        "on-error-container": "#991b1b",
        "secondary-container": "#f4f4f5",
        "surface-variant": "#f4f4f5",
        "surface-container-low": "#fafafa",
        "on-primary-fixed": "#2d124d",
        "outline-variant": "#e4e4e7",
        "surface-container-lowest": "#ffffff",
        "on-tertiary-fixed": "#30210d",
        "primary-fixed": "#ead9ff",
        "surface-container-highest": "#e4e4e7",
        "on-surface-variant": "#71717a",
        "on-primary-container": "#ffffff",
        "inverse-surface": "#18181b",
        "on-tertiary": "#ffffff",
        "primary-fixed-dim": "#c99dff",
        "inverse-on-surface": "#fafafa",
        "on-secondary-fixed-variant": "#52525b",
        "on-primary-fixed-variant": "#6e25ca",
        "secondary-fixed": "#e0d8c8",
        "inverse-primary": "#8b7bff",
        "surface-dim": "#f4f4f5",
        "surface": "#ffffff",
        "surface-container": "#f7f7f8",
        "outline": "#a1a1aa",
        "secondary-fixed-dim": "#c8beaa",},
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: { "display-md":["Inter"],"label-md":["Inter"],"display-lg":["Inter"],"body-base":["Inter"],"body-sm":["Inter"],"section-label":["Inter"],"display-md-mobile":["Inter"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 20px rgba(215, 200, 170, 0.18)" },
          "50%": { opacity: "0.8", boxShadow: "0 0 30px rgba(147, 64, 255, 0.32)" },
        },
        flowLine: {
          "0%": { backgroundPosition: "200% center" },
          "100%": { backgroundPosition: "-200% center" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "pulse-glow": "pulseGlow 4s ease-in-out infinite",
        "flow-line": "flowLine 3s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
