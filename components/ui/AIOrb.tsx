"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "speaking" | "listening" | "processing" | "success";

const stateConfig: Record<OrbState, { gradient: string; label: string; halo: string }> = {
  idle: {
    gradient: "from-slate-200 to-slate-400",
    label: "Ready",
    halo: "rgba(100,116,139,0.32)",
  },
  speaking: {
    gradient: "from-sky-400 to-blue-500",
    label: "Speaking",
    halo: "rgba(59,130,246,0.4)",
  },
  listening: {
    gradient: "from-slate-600 to-zinc-700",
    label: "Listening",
    halo: "rgba(82,82,91,0.35)",
  },
  processing: {
    gradient: "from-slate-300 to-slate-500",
    label: "Processing",
    halo: "rgba(148,163,184,0.35)",
  },
  success: {
    gradient: "from-green-500 to-emerald-600",
    label: "Ready To Submit",
    halo: "rgba(16,185,129,0.35)",
  },
};

export default function AIOrb({
  state = "idle",
  intensity = 1,
  mutedMotion = false,
}: {
  state?: OrbState;
  intensity?: number;
  mutedMotion?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const cfg = stateConfig[state];
  const scaleFactor = Math.min(Math.max(intensity, 0.75), 1.45);
  const shouldMute = Boolean(prefersReducedMotion || mutedMotion);

  const pulse =
    shouldMute
      ? { scale: 1, rotate: 0 }
      : {
          scale: [1, 1 + 0.03 * scaleFactor, 1],
          rotate: state === "listening" ? [0, -1, 1, 0] : 0,
        };

  const haloPulse =
    shouldMute
      ? { opacity: 0.24, scale: 1 }
      : {
          opacity: [0.16, 0.35, 0.16],
          scale: [1, 1 + 0.08 * scaleFactor, 1],
        };

  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <div className="relative">
        <motion.div
          className="absolute inset-0 rounded-full blur-md"
          style={{ width: 78, height: 78, background: cfg.halo }}
          animate={haloPulse}
          transition={{ duration: state === "processing" ? 1 : 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className={cn("relative w-[78px] h-[78px] rounded-full bg-gradient-to-br shadow-lg", cfg.gradient)}
          animate={pulse}
          transition={{
            duration: state === "speaking" ? 0.9 : state === "processing" ? 0.7 : 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <motion.div
            className="absolute inset-2 rounded-full bg-white/20"
            animate={shouldMute ? { opacity: 0.22 } : { opacity: [0.18, 0.3, 0.18] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="w-3 h-3 rounded-full bg-white/70"
              animate={shouldMute ? { scale: 1 } : { scale: [1, 1.25, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </motion.div>
      </div>
      <span className="text-xs font-medium text-gray-500 tracking-wide uppercase">{cfg.label}</span>
    </div>
  );
}
