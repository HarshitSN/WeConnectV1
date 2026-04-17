"use client";
import { useState } from "react";
import { Star, CheckCircle, Shield, ArrowRight, DollarSign, Search } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { MOCK_ASSESSORS, CERT_PRICING } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function AssessorPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [certFilter, setCertFilter] = useState<"all" | "self" | "digital">("all");

  const assessor = MOCK_ASSESSORS.find(a => a.id === selected);

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="font-display font-bold text-2xl text-gray-900">Assessor Marketplace</h1>
          <p className="text-gray-500 text-sm mt-0.5">Browse independent certified assessors. WEC retains 15% — assessors receive 85% within 5 business days.</p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input-field pl-9 py-2.5 text-sm" placeholder="Search assessors..." />
          </div>
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {(["all","self","digital"] as const).map(f => (
              <button key={f} onClick={() => setCertFilter(f)}
                className={cn("px-4 py-2 text-sm font-medium transition-all", certFilter===f?"bg-brand-indigo text-white":"bg-white text-gray-600 hover:bg-gray-50")}>
                {f==="all"?"All":f==="self"?"Self-Cert":"Digital Cert"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          {MOCK_ASSESSORS.map(a => (
            <div key={a.id} className={cn("card-hover transition-all", selected === a.id && "ring-2 ring-brand-indigo")}>
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 bg-brand-indigo/10 rounded-xl flex items-center justify-center shrink-0 text-brand-indigo font-bold text-lg">
                  {a.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-gray-900 text-sm truncate">{a.name}</p>
                    {a.verified && <Shield size={13} className="text-brand-blue shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star size={12} className="text-amber-400 fill-amber-400" />
                    <span className="text-xs font-bold text-gray-700">{a.rating}</span>
                    <span className="text-xs text-gray-400">({a.review_count} reviews)</span>
                  </div>
                </div>
              </div>

              {/* Credentials */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {a.credentials.map(c => <span key={c} className="badge bg-blue-50 text-brand-blue">{c}</span>)}
              </div>

              <p className="text-xs text-gray-500 leading-relaxed mb-4">{a.bio}</p>

              {/* Fees */}
              <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
                <p className="text-xs font-bold text-gray-600 mb-2">Fee Structure</p>
                {[
                  { label: "Self-Certification",    fee: a.fee_self },
                  { label: "Digital Certification",  fee: a.fee_digital },
                  { label: "Industry Verification",  fee: a.fee_industry },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{r.label}</span>
                    <span className="text-xs font-bold text-gray-900 flex items-center gap-0.5"><DollarSign size={10}/>{r.fee}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => setSelected(selected === a.id ? null : a.id)}
                className={cn("w-full text-sm font-semibold py-2.5 rounded-xl transition-all",
                  selected===a.id?"bg-brand-indigo text-white":"bg-gray-100 text-gray-700 hover:bg-gray-200")}>
                {selected===a.id?"Selected ✓":"Select Assessor"}
              </button>
            </div>
          ))}
        </div>

        {/* Selected assessor CTA */}
        {assessor && (
          <div className="card border-brand-indigo border-2 bg-brand-indigo/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-brand-indigo" />
                <div>
                  <p className="font-bold text-gray-900">Selected: {assessor.name}</p>
                  <p className="text-sm text-gray-500">Add to your certification application</p>
                </div>
              </div>
              <button className="btn-purple gap-2 py-2.5 px-5 w-auto">
                Proceed with Assessor <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Platform terms */}
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {[
            { icon: Shield, title: "Vetted & Verified", desc: "All assessors are independently credentialed and background-checked by WEConnect." },
            { icon: DollarSign, title: "Transparent Pricing", desc: "15% platform fee. Assessors receive 85% within 5 business days via direct deposit." },
            { icon: CheckCircle, title: "Protected Payments", desc: "Escrow-protected payments released only after assessment completion and review." },
          ].map(item => (
            <div key={item.title} className="card p-4 text-center">
              <item.icon size={20} className="mx-auto text-brand-blue mb-2" />
              <p className="text-sm font-bold text-gray-900 mb-1">{item.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
