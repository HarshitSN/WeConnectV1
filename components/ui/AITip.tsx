import { Sparkles } from "lucide-react";
export default function AITip({ tip }: { tip: string }) {
  return (
    <div className="ai-tip">
      <Sparkles size={16} className="text-brand-blue mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-bold text-brand-blue mb-0.5">AI Assistant Tip</p>
        <p className="text-sm text-blue-700/80">{tip}</p>
      </div>
    </div>
  );
}
