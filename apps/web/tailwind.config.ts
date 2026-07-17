import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",
        rule: "rgb(var(--rule) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        // Porter One Design brand palette (restored from v1)
        porter: {
          DEFAULT: "#1B4F8A",
          50: "#F2F6FB",
          100: "#E0EAF4",
          500: "#1B4F8A",
          600: "#16406F",
          700: "#0F2E51",
        },
        brand: {
          primary: "rgb(var(--brand-primary-rgb) / <alpha-value>)",
          secondary: "rgb(var(--brand-secondary-rgb) / <alpha-value>)",
          accent: "rgb(var(--brand-accent-rgb) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
        display: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["12px", "16px"],
        xs: ["12px", "18px"],
        sm: ["14px", "20px"],
        base: ["16px", "24px"],
        lg: ["20px", "28px"],
        xl: ["28px", "36px"],
        "2xl": ["40px", "48px"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,26,31,.04), 0 1px 1px rgba(26,26,31,.04)",
        "card-hover":
          "0 8px 24px rgba(26,26,31,.08), 0 2px 4px rgba(26,26,31,.04)",
        page: "0 1px 0 rgba(26,26,31,.06), 0 16px 40px rgba(26,26,31,.08)",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(.2,.7,.2,1)",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeSwap: {
          "0%, 100%": { opacity: "0" },
          "20%, 80%": { opacity: "1" },
        },
        pulseNode: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.25)" },
        },
        breathe: {
          "0%, 100%": { opacity: ".4" },
          "50%": { opacity: ".9" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite linear",
        fadeIn: "fadeIn 220ms cubic-bezier(.2,.7,.2,1)",
        pulseNode: "pulseNode 1.6s ease-in-out infinite",
        breathe: "breathe 3s ease-in-out infinite",
        shake: "shake 360ms ease-in-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
