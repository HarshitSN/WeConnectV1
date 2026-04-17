"use client";

import { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BUSINESS_DESIGNATIONS,
  EMPLOYEE_RANGES,
  MOCK_ASSESSORS,
  NAICS_CODES,
  REVENUE_RANGES,
  UNSPSC_CODES,
  VISA_TYPES,
} from "@/lib/constants";
import type { ConversationPointer, OwnershipEntry, RegistrationState } from "@/types";

export default function InlineFormElement({
  pointer,
  answers,
  setAnswers,
  assessorId,
  setAssessorId,
}: {
  pointer: ConversationPointer;
  answers: RegistrationState;
  setAnswers: Dispatch<SetStateAction<RegistrationState>>;
  assessorId: string;
  setAssessorId: (id: string) => void;
}) {
  const set = (field: keyof RegistrationState, value: unknown) => setAnswers((prev) => ({ ...prev, [field]: value }));
  const toggle = (field: "naics_codes" | "unspsc_codes" | "designations", code: string) => {
    const current = answers[field];
    set(field, current.includes(code) ? current.filter((v: string) => v !== code) : [...current, code]);
  };

  const isUS = answers.country.toLowerCase().includes("united states") || answers.country.toLowerCase() === "us" || answers.country.toLowerCase() === "usa";

  const updateOwner = (idx: number, patch: Partial<OwnershipEntry>) => {
    const next = answers.ownership_structure.map((entry, i) => (i === idx ? { ...entry, ...patch } : entry));
    set("ownership_structure", next);
  };

  const addOwner = () => set("ownership_structure", [...answers.ownership_structure, { name: "", gender: "female", percent: 0 }]);
  const removeOwner = (idx: number) => set("ownership_structure", answers.ownership_structure.filter((_, i) => i !== idx));

  const ownerTotal = answers.ownership_structure.reduce((sum, e) => sum + Number(e.percent || 0), 0);

  // Default to nothing if pointer is missing
  if (!pointer || !pointer.stepId) return null;

  switch (pointer.stepId) {
    case "business_name":
      return (
        <div className="mt-4 max-w-sm pt-2 border-t border-gray-100">
          <input className="input-field shadow-sm bg-white" placeholder="Business Name" value={answers.business_name} onChange={(e) => set("business_name", e.target.value)} />
        </div>
      );
    case "women_owned":
      return (
        <div className="mt-4 max-w-sm pt-2 border-t border-gray-100 space-y-2">
          <p className="text-xs font-medium text-gray-600">Is it 51% owned by women?</p>
          <div className="flex gap-2">
          <button onClick={() => set("women_owned", true)} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all shadow-sm bg-white", answers.women_owned === true ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-gray-200 hover:border-brand-blue/50")}>Yes, 51%+ women owned</button>
          <button onClick={() => set("women_owned", false)} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all shadow-sm bg-white", answers.women_owned === false ? "border-red-300 bg-red-50 text-red-600" : "border-gray-200 hover:border-red-300/50")}>No</button>
          </div>
        </div>
      );
    case "country":
      return (
        <div className="mt-4 max-w-sm pt-2 border-t border-gray-100">
          <input className="input-field shadow-sm bg-white" placeholder="Country" value={answers.country} onChange={(e) => set("country", e.target.value)} />
        </div>
      );
    case "us_citizen":
      if (!isUS) return null;
      return (
        <div className="mt-4 flex gap-2 max-w-sm pt-2 border-t border-gray-100">
          <button onClick={() => set("us_citizen", true)} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all shadow-sm bg-white", answers.us_citizen === true ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-gray-200 hover:border-brand-blue/50")}>US citizen / Green card</button>
          <button onClick={() => set("us_citizen", false)} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all shadow-sm bg-white", answers.us_citizen === false ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-gray-200 hover:border-brand-blue/50")}>Not US citizen</button>
        </div>
      );
    case "visa_type":
      if (!isUS || answers.us_citizen !== false) return null;
      return (
        <div className="mt-4 max-w-sm pt-2 border-t border-gray-100">
          <select className="select-field shadow-sm bg-white" value={answers.visa_type} onChange={(e) => set("visa_type", e.target.value)}>
            <option value="">Select visa type</option>
            {VISA_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      );
    case "webank_certified":
      if (!isUS) return null;
      return (
        <div className="mt-4 flex gap-2 max-w-sm pt-2 border-t border-gray-100">
          <button onClick={() => set("webank_certified", true)} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all shadow-sm bg-white", answers.webank_certified === true ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-gray-200 hover:border-brand-blue/50")}>WEBank certified</button>
          <button onClick={() => set("webank_certified", false)} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all shadow-sm bg-white", answers.webank_certified === false ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-gray-200 hover:border-brand-blue/50")}>Not WEBank certified</button>
        </div>
      );
    case "naics_codes":
      return (
        <div className="mt-4 max-w-md pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Select all that apply</p>
          <select className="select-field shadow-sm bg-white" multiple style={{ height: 110 }} value={answers.naics_codes} onChange={(e) => set("naics_codes", Array.from(e.target.selectedOptions, (opt) => opt.value))}>
            {NAICS_CODES.map((n) => <option key={n.code} value={n.code}>{n.code} - {n.label}</option>)}
          </select>
        </div>
      );
    case "unspsc_codes":
      return (
        <div className="mt-4 max-w-md pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Select all that apply</p>
          <select className="select-field shadow-sm bg-white" multiple style={{ height: 110 }} value={answers.unspsc_codes} onChange={(e) => set("unspsc_codes", Array.from(e.target.selectedOptions, (opt) => opt.value))}>
            {UNSPSC_CODES.map((u) => <option key={u.code} value={u.code}>{u.code} - {u.label}</option>)}
          </select>
        </div>
      );
    case "designations":
      return (
        <div className="mt-4 grid grid-cols-2 gap-2 max-w-md pt-2 border-t border-gray-100">
          {BUSINESS_DESIGNATIONS.map((d) => (
            <button key={d} onClick={() => toggle("designations", d)} className={cn("text-left rounded-lg border px-3 py-2 text-xs transition-all shadow-sm bg-white", answers.designations.includes(d) ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-gray-200 text-gray-700 hover:border-brand-blue/30")}>{d}</button>
          ))}
        </div>
      );
    case "owner_details":
    case "owner_add_more":
      {
        const idx = pointer.ownerIndex ?? 0;
        const entry = answers.ownership_structure[idx];
        if (!entry) return null;
        return (
          <div className="mt-4 pt-2 border-t border-gray-100">
            <div className="rounded-lg border border-gray-200 p-3 space-y-2 bg-gray-50/50 shadow-sm max-w-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">Owner {idx + 1}</p>
                {answers.ownership_structure.length > 1 && (
                  <button onClick={() => removeOwner(idx)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                )}
              </div>
              <input className="input-field bg-white" placeholder="Owner name" value={entry.name} onChange={(e) => updateOwner(idx, { name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="select-field bg-white" value={entry.gender} onChange={(e) => updateOwner(idx, { gender: e.target.value as OwnershipEntry["gender"] })}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="other">Other</option>
                </select>
                <input type="number" className="input-field bg-white" min={0} max={100} placeholder="Ownership %" value={entry.percent || ""} onChange={(e) => updateOwner(idx, { percent: Number(e.target.value) })} />
              </div>
            </div>
            {pointer.stepId === "owner_add_more" && (
              <div className="mt-3 flex items-center justify-between max-w-sm">
                <button onClick={addOwner} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:text-blue-700"><Plus size={14} /> Add another owner</button>
                <span className={cn("text-xs font-semibold", ownerTotal === 100 ? "text-green-600" : "text-amber-600")}>Total: {ownerTotal}%</span>
              </div>
            )}
          </div>
        );
      }
    case "num_employees":
      return (
        <div className="mt-4 max-w-sm pt-2 border-t border-gray-100">
          <select className="select-field shadow-sm bg-white" value={answers.num_employees} onChange={(e) => set("num_employees", e.target.value)}>
            <option value="">Select number of employees</option>
            {EMPLOYEE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      );
    case "revenue_range":
      return (
        <div className="mt-4 max-w-sm pt-2 border-t border-gray-100">
          <select className="select-field shadow-sm bg-white" value={answers.revenue_range} onChange={(e) => set("revenue_range", e.target.value)}>
            <option value="">Select revenue range</option>
            {REVENUE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      );
    case "additional_certs":
      return (
        <div className="mt-4 max-w-sm pt-2 border-t border-gray-100">
          <input className="input-field shadow-sm bg-white" placeholder="Name of certifier (if any)" value={answers.additional_certs} onChange={(e) => set("additional_certs", e.target.value)} />
        </div>
      );
    case "business_description":
      return (
        <div className="mt-4 max-w-md pt-2 border-t border-gray-100">
          <textarea className="textarea-field shadow-sm bg-white" rows={3} placeholder="Business description (min 30 chars)" value={answers.business_description} onChange={(e) => set("business_description", e.target.value)} />
        </div>
      );
    case "cert_type":
      return (
        <div className="mt-4 grid grid-cols-2 gap-2 max-w-sm pt-2 border-t border-gray-100">
          <button onClick={() => set("cert_type", "self")} className={cn("rounded-lg border px-3 py-2 text-sm font-medium transition-all shadow-sm bg-white", answers.cert_type === "self" ? "border-brand-purple bg-purple-50 text-brand-purple" : "border-gray-200 hover:border-brand-purple/50")}>Self Certification</button>
          <button onClick={() => set("cert_type", "digital")} className={cn("rounded-lg border px-3 py-2 text-sm font-medium transition-all shadow-sm bg-white", answers.cert_type === "digital" ? "border-brand-purple bg-purple-50 text-brand-purple" : "border-gray-200 hover:border-brand-purple/50")}>Digital Certification</button>
        </div>
      );
    case "assessor":
      return (
        <div className="mt-4 max-w-sm pt-2 border-t border-gray-100">
          <select className="select-field shadow-sm bg-white" value={assessorId} onChange={(e) => setAssessorId(e.target.value)}>
            <option value="">Select an assessor</option>
            {MOCK_ASSESSORS.map((a) => <option key={a.id} value={a.id}>{a.name} (${a.fee_digital})</option>)}
          </select>
        </div>
      );
    case "done":
    default:
      return null;
  }
}
