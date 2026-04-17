import { cn } from "@/lib/utils";
export default function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={cn("h-2 rounded-full transition-all duration-300",
          i + 1 < current ? "w-2 bg-brand-blue" :
          i + 1 === current ? "w-6 bg-brand-blue" : "w-2 bg-gray-200")} />
      ))}
    </div>
  );
}
