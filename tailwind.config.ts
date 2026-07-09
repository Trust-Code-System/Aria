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
          blue: "#b58cff",
          purple: "#9340ff",
          cyan: "#d7c8aa",
          indigo: "#b58cff",
        },
        glass: {
          border: "rgba(238, 226, 204, 0.16)",
          background: "rgba(62, 58, 50, 0.62)",
          surface: "rgba(78, 73, 64, 0.70)",
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
      
        "on-secondary-container": "#f4efe6",
        "on-secondary": "#302b24",
        "on-tertiary-fixed-variant": "#5d3e16",
        "on-background": "#f4efe6",
        "on-error": "#690005",
        "on-surface": "#f4efe6",
        "error-container": "#93000a",
        "primary-container": "#9340ff",
        "tertiary-fixed-dim": "#e3c384",
        "error": "#ffb4ab",
        "surface-bright": "#706a5f",
        "surface-container-high": "#5b564c",
        "on-primary": "#ffffff",
        "on-secondary-fixed": "#302b24",
        "on-tertiary-container": "#f8e8cd",
        "tertiary-container": "#6f5b3b",
        "tertiary-fixed": "#f4dfb7",
        "tertiary": "#d9bd82",
        "surface-tint": "#d7c8aa",
        "on-error-container": "#ffdad6",
        "secondary-container": "#66685e",
        "surface-variant": "#5f6158",
        "surface-container-low": "#46493f",
        "on-primary-fixed": "#2d124d",
        "outline-variant": "#837c70",
        "surface-container-lowest": "#302c25",
        "on-tertiary-fixed": "#30210d",
        "primary-fixed": "#ead9ff",
        "surface-container-highest": "#6b665c",
        "on-surface-variant": "#c9c2b7",
        "on-primary-container": "#fff8ff",
        "inverse-surface": "#f4efe6",
        "on-tertiary": "#2f2110",
        "primary-fixed-dim": "#c99dff",
        "inverse-on-surface": "#363026",
        "on-secondary-fixed-variant": "#635c50",
        "on-primary-fixed-variant": "#6e25ca",
        "secondary-fixed": "#e0d8c8",
        "inverse-primary": "#a85dff",
        "surface-dim": "#2f2b24",
        "surface": "#3a362f",
        "surface-container": "#4f4a42",
        "outline": "#a89f91",
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
