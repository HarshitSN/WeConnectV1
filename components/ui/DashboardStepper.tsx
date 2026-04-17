import { CheckCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "completed" | "active" | "locked";
interface Step { id: number; label: string; sublabel: string; status: StepStatus; }

export default function DashboardStepper({ steps, currentStep }: { steps: Step[]; currentStep: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Your Progress</span>
          <span className="badge bg-blue-100 text-brand-blue">Step {currentStep} of 4</span>
        </div>
        <span className="text-sm text-gray-400">{Math.round(((currentStep - 1) / 4) * 100)}% Complete</span>
      </div>
      <div className="flex items-center">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all",
                step.status === "completed" ? "bg-green-500 text-white" :
                step.status === "active"    ? "bg-brand-blue text-white ring-4 ring-brand-blue/20" :
                "bg-gray-100 text-gray-400 border-2 border-gray-200")}>
                {step.status === "completed" ? <CheckCircle size={16} /> : step.status === "locked" ? <Lock size={13} /> : step.id}
              </div>
              <span className={cn("text-xs font-medium", step.status === "active" ? "text-gray-900" : "text-gray-400")}>{step.label}</span>
              <span className="text-[10px] text-gray-400">{step.sublabel}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("flex-1 h-0.5 mx-2 mb-6", step.status === "completed" ? "bg-green-300" : "bg-gray-200")} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
