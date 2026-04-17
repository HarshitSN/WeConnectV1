export default function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="mb-5">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="font-medium text-gray-700">Question {current} of {total}</span>
        <span className="text-gray-400">{pct}% complete</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-gray-900 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
