"use client";

import { cn } from "@/lib/utils";
import { getSectionIndex, SECTION_NAMES } from "@/lib/voice-agent/engine";
import type { ConversationStepId } from "@/types";
import { Check } from "lucide-react";

export default function ProgressStepper({ currentStepId }: { currentStepId: ConversationStepId }) {
  const currentSection = getSectionIndex(currentStepId);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {SECTION_NAMES.map((name, idx) => {
        const isComplete = idx < currentSection;
        const isActive = idx === currentSection;

        return (
          <div key={name} className="flex items-center gap-1 shrink-0">
            {idx > 0 && (
              <div className={cn("w-4 h-[2px] rounded-full transition-colors duration-300", isComplete ? "bg-green-400" : "bg-gray-200")} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
                  isComplete && "bg-green-500 text-white animate-celebrate-check",
                  isActive && "bg-brand-blue text-white shadow-md shadow-blue-200",
                  !isComplete && !isActive && "bg-gray-100 text-gray-400",
                )}
              >
                {isComplete ? <Check size={12} strokeWidth={3} /> : idx + 1}
              </div>
              <span
                className={cn(
                  "text-xs font-medium transition-colors duration-300 hidden sm:inline",
                  isActive && "text-brand-blue",
                  isComplete && "text-green-600",
                  !isComplete && !isActive && "text-gray-400",
                )}
              >
                {name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
