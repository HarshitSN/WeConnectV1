import type { Transition, Variants } from "framer-motion";

export const MOTION_EASE = {
  standard: [0.22, 1, 0.36, 1] as [number, number, number, number],
  gentle: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

export const MOTION_TIMING = {
  quick: 0.18,
  base: 0.32,
  slow: 0.5,
};

export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 24,
  mass: 0.75,
};

export const pageEnter = (delay = 0): Variants => ({
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_TIMING.base, ease: MOTION_EASE.standard, delay },
  },
});

export const panelLift: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: MOTION_TIMING.base, ease: MOTION_EASE.gentle },
  },
};

export const staggerContainer = (stagger = 0.07): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger,
      delayChildren: 0.04,
    },
  },
});

export const messageReveal: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.24, ease: MOTION_EASE.gentle },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.16 },
  },
};

export const statusGlow: Record<
  "idle" | "listening" | "speaking" | "processing" | "success",
  { ring: string; surface: string; text: string }
> = {
  idle: {
    ring: "ring-slate-300/70",
    surface: "from-white to-slate-50",
    text: "text-slate-600",
  },
  listening: {
    ring: "ring-emerald-300/80",
    surface: "from-emerald-50 to-teal-50",
    text: "text-emerald-700",
  },
  speaking: {
    ring: "ring-violet-300/80",
    surface: "from-violet-50 to-fuchsia-50",
    text: "text-violet-700",
  },
  processing: {
    ring: "ring-sky-300/80",
    surface: "from-sky-50 to-indigo-50",
    text: "text-sky-700",
  },
  success: {
    ring: "ring-green-300/80",
    surface: "from-green-50 to-emerald-50",
    text: "text-green-700",
  },
};
