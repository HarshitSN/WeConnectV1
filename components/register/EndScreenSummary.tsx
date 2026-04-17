"use client";

import { useCallback, useState } from "react";
import { ArrowRight, CheckCircle, PartyPopper, Sparkles } from "lucide-react";
import type { RegistrationState } from "@/types";

export default function EndScreenSummary({
  answers,
  onSubmit,
}: {
  answers: RegistrationState;
  onSubmit: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const ownerNames = answers.ownership_structure.map((o) => o.name).filter(Boolean).join(", ");
  const certLabel = answers.cert_type === "self" ? "Self Certification" : answers.cert_type === "digital" ? "Digital Certification" : "—";

  const handleSubmit = useCallback(() => {
    setIsSubmitting(true);
    onSubmit();
  }, [onSubmit]);

  return (
    <div className="relative rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-8 shadow-lg animate-slide-up overflow-hidden">
      {/* Background sparkles */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-green-300/60 animate-confetti-burst"
          style={{
            top: `${10 + Math.random() * 80}%`,
            left: `${5 + Math.random() * 90}%`,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}

      <div className="relative z-10 flex flex-col items-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center animate-celebrate-check shadow-lg shadow-green-200">
          <PartyPopper size={28} className="text-white" />
        </div>

        <div>
          <h2 className="text-2xl font-display font-bold text-gray-900">Your Profile is Ready! 🎉</h2>
          <p className="text-sm text-gray-500 mt-1">All voice steps are complete. Review and submit below.</p>
        </div>

        <div className="w-full max-w-md bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 p-4 space-y-3 text-left">
          <SummaryRow label="Business Name" value={answers.business_name || "—"} />
          <SummaryRow label="Country" value={answers.country || "—"} />
          <SummaryRow label="Women-Owned" value={answers.women_owned === true ? "Yes" : answers.women_owned === false ? "No" : "—"} />
          <SummaryRow label="Owners" value={ownerNames || "—"} />
          <SummaryRow label="Employees" value={answers.num_employees || "—"} />
          <SummaryRow label="Revenue" value={answers.revenue_range || "—"} />
          <SummaryRow label="Certification" value={certLabel} />
          <SummaryRow label="NAICS Codes" value={answers.naics_codes.join(", ") || "—"} />
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold px-8 py-3.5 rounded-xl hover:from-green-700 hover:to-emerald-700 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-green-200 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Submit Registration
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-gray-800 text-right truncate max-w-[60%]">
        {value !== "—" && <CheckCircle size={12} className="inline text-green-500 mr-1" />}
        {value}
      </span>
    </div>
  );
}
