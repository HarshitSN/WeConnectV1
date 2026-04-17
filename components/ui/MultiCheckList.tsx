"use client";
import { cn } from "@/lib/utils";

interface Item { code: string; label: string; }

export default function MultiCheckList({ items, selected, onToggle }: {
  items: Item[]; selected: string[]; onToggle: (code: string) => void;
}) {
  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {items.map(item => {
        const sel = selected.includes(item.code);
        return (
          <button key={item.code} onClick={() => onToggle(item.code)}
            className={cn(sel ? "check-opt-sel" : "check-opt", "w-full text-left")}>
            <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
              sel ? "bg-brand-blue border-brand-blue" : "border-gray-300 bg-white")}>
              {sel && <svg viewBox="0 0 10 8" className="w-3 h-3"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <span className="text-sm"><span className="font-semibold text-gray-400 mr-1.5">{item.code}</span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
