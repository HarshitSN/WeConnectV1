"use client";

type Props = { active: boolean; txHash?: string };

export function BlockAnchorAnimation({ active, txHash }: Props) {
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-cyan-500/30 bg-zinc-950 p-8 text-center shadow-[0_0_60px_rgba(6,182,212,0.25)]">
        <div className="mx-auto mb-4 h-16 w-16 animate-pulse rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg" />
        <p className="text-sm font-medium tracking-wide text-cyan-200">Anchoring to QID chain</p>
        <p className="mt-2 font-mono text-xs text-cyan-400/80 break-all">
          {txHash ?? "0x…pending"}
        </p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-[shimmer_1.2s_ease-in-out_infinite] bg-cyan-400" />
        </div>
      </div>
    </div>
  );
}
