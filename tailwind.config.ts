import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: { blue: "#2563EB", slate: "#0F172A", zinc: "#18181B", green: "#059669" },
        surface: { DEFAULT: "#F8FAFC", card: "#FFFFFF", muted: "#F1F5F9" },
      },
      fontFamily: {
        sans: ["'DM Sans'", "sans-serif"],
        display: ["'Bricolage Grotesque'", "sans-serif"],
      },
      backgroundImage: {
        "hero-gradient": "linear-gradient(135deg,#F1F5F9 0%,#F8FAFC 50%,#FFFFFF 100%)",
        "banner-gradient": "linear-gradient(135deg,#1E293B 0%,#0F172A 50%,#020617 100%)",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        orbPulse: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.7" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
        },
        orbSpeak: {
          "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(37,99,235,0.2)" },
          "50%": { transform: "scale(1.05)", boxShadow: "0 0 0 8px rgba(37,99,235,0)" },
          "100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(37,99,235,0)" },
        },
        orbListen: {
          "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(15,23,42,0.1)" },
          "50%": { transform: "scale(1.03)", boxShadow: "0 0 0 6px rgba(15,23,42,0)" },
          "100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(15,23,42,0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        fieldFlash: {
          "0%": { boxShadow: "0 0 0 0 rgba(37,99,235,0.5)" },
          "50%": { boxShadow: "0 0 0 4px rgba(37,99,235,0.25)" },
          "100%": { boxShadow: "0 0 0 0 rgba(37,99,235,0)" },
        },
        thinkingBounce: {
          "0%, 80%, 100%": { transform: "translateY(0)" },
          "40%": { transform: "translateY(-6px)" },
        },
        confettiBurst: {
          "0%": { transform: "scale(0)", opacity: "1" },
          "50%": { transform: "scale(1.2)", opacity: "0.8" },
          "100%": { transform: "scale(1.5)", opacity: "0" },
        },
        typewriterCursor: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        celebrateCheck: {
          "0%": { transform: "scale(0) rotate(-45deg)", opacity: "0" },
          "60%": { transform: "scale(1.2) rotate(0deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        calmDrift: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" },
        },
        softShimmer: {
          "0%": { backgroundPosition: "-120% 0" },
          "100%": { backgroundPosition: "120% 0" },
        },
        calmRipple: {
          "0%": { transform: "scale(0.95)", opacity: "0.6" },
          "70%": { transform: "scale(1.1)", opacity: "0.15" },
          "100%": { transform: "scale(1.2)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.35s ease-out",
        "orb-pulse": "orbPulse 2.5s ease-in-out infinite",
        "orb-speak": "orbSpeak 1.2s ease-in-out infinite",
        "orb-listen": "orbListen 1.5s ease-in-out infinite",
        "slide-in-left": "slideInLeft 0.35s ease-out",
        "slide-in-right": "slideInRight 0.35s ease-out",
        "field-flash": "fieldFlash 0.8s ease-out",
        "thinking-bounce": "thinkingBounce 1.4s ease-in-out infinite",
        "confetti-burst": "confettiBurst 0.6s ease-out forwards",
        "typewriter-cursor": "typewriterCursor 0.8s step-end infinite",
        "celebrate-check": "celebrateCheck 0.5s ease-out forwards",
        "calm-drift": "calmDrift 3.6s ease-in-out infinite",
        "soft-shimmer": "softShimmer 2s linear infinite",
        "calm-ripple": "calmRipple 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
