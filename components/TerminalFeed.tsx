"use client";

import { useEffect, useRef } from "react";

type Props = {
  lines: string[];
  className?: string;
  viewportClassName?: string;
};

export function TerminalFeed({
  lines,
  className = "",
  viewportClassName = "h-48",
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const nearBottom = distanceFromBottom < 60;
    if (nearBottom) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      className={`rounded-lg border border-emerald-500/20 bg-black/60 font-mono text-[11px] text-emerald-400/95 ${className}`}
    >
      <div className="border-b border-emerald-500/20 px-3 py-2 text-[10px] uppercase tracking-widest text-emerald-600">
        WEC Terminal
      </div>
      <div ref={viewportRef} className={`overflow-y-auto p-3 leading-relaxed ${viewportClassName}`}>
        {lines.length === 0 ? (
          <span className="text-emerald-700">Awaiting signals…</span>
        ) : (
          lines.map((l, i) => (
            <div key={`${i}-${l.slice(0, 24)}`} className="whitespace-pre-wrap break-all">
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
