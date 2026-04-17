"use client";

import { CheckCircle } from "lucide-react";

export default function CompletionCelebration({ text }: { text: string }) {
  return (
    <div className="relative flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 px-4 py-2.5 animate-slide-up overflow-hidden">
      {/* Sparkle dots */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-green-400 animate-confetti-burst"
          style={{
            top: `${20 + Math.random() * 60}%`,
            left: `${10 + Math.random() * 80}%`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
      <CheckCircle size={18} className="text-green-500 animate-celebrate-check shrink-0" />
      <span className="text-sm font-semibold text-green-700">{text}</span>
    </div>
  );
}
