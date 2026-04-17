import { cn } from "@/lib/utils";
import { getRiskLabel } from "@/lib/utils";

export default function RiskBadge({ score }: { score: number }) {
  const level = getRiskLabel(score);
  return (
    <span className={cn("badge",
      level === "low"    ? "risk-low" :
      level === "medium" ? "risk-medium" : "risk-high")}>
      {level === "low" ? "Low Risk" : level === "medium" ? "Medium Risk" : "High Risk"} · {score}
    </span>
  );
}
