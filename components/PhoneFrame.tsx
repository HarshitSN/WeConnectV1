import type { ReactNode } from "react";

type Props = { children: ReactNode; title?: string };

export function PhoneFrame({ children, title = "User device" }: Props) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="rounded-[2rem] border-4 border-zinc-700 bg-zinc-900 p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">{title}</span>
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/80">
          {children}
        </div>
      </div>
    </div>
  );
}
