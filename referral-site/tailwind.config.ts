import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./pages/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Scumbria", "var(--font-unbounded)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Aneliza", "var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        background: "#0B0E11",
        surface: "#161A1E",
        accent: "#F0B90B",
        accentSoft: "#2d2a14",
        accentCyan: "#0ECB81",
        accentCyanSoft: "#0d3328",
      },
      boxShadow: {
        "soft-glow": "0 0 28px rgba(240,185,11,0.28), 0 0 56px rgba(240,185,11,0.06)",
        "soft-glow-cyan": "0 0 20px rgba(14,203,129,0.15)",
      },
      animation: {
        "page-enter": "page-enter 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "fade-in": "fade-in 0.35s ease-out forwards",
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "scale-in": "scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        shimmer: "shimmer 1.5s ease-in-out infinite",
      },
      keyframes: {
        "page-enter": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
      transitionDuration: {
        400: "400ms",
        500: "500ms",
      },
    },
  },
  plugins: [],
};

export default config;
