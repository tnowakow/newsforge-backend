import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Porter brand baseline (used by NavBar/wordmark). Workspace + preview
        // pages override the runtime --brand-primary/secondary/accent CSS vars
        // from the selected client's brand kit.
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
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        "client-heading": ["var(--client-heading-font)", "Georgia", "serif"],
        "client-body": ["var(--client-body-font)", "Inter", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 4s linear infinite",
        "node-pulse": "nodePulse 1.8s ease-in-out infinite",
      },
      keyframes: {
        nodePulse: {
          "0%, 100%": { opacity: "0.35", transform: "scale(0.9)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)",
        "card-hover":
          "0 4px 10px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
