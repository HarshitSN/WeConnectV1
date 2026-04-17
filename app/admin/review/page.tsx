"use client";
import { useState } from "react";
import Link from "next/link";
import { Clock, CheckCircle, XCircle, MessageSquare, AlertTriangle, Filter, Search, Eye } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import RiskBadge from "@/components/ui/RiskBadge";
import { cn, getStatusLabel } from "@/lib/utils";

type Action = "approve" | "reject" | "request_info";
type ItemStatus = "pending" | "approved" | "rejected" | "info_requested";

interface QueueItem {
  id: string; businessName: string; country: string; certType: string;
  riskScore: number; ageHours: number; status: ItemStatus; aiSummary: string;
  sanctions: string; entity: string; flagReason?: string;
}

const INITIAL_QUEUE: QueueItem[] = [
  { id: "q1", businessName: "Sunrise Consulting LLC", country: "US", certType: "digital", riskScore: 55, ageHours: 3, status: "pending", aiSummary: "Partial OFAC name match (score 72%) on secondary owner. Entity confirmed in Delaware registry. Documents complete.", sanctions: "partial_match", entity: "verified", flagReason: "Partial sanctions match requires manual review" },
  { id: "q2", businessName: "Aurora Textiles Ltd", country: "UK", certType: "self", riskScore: 48, ageHours: 18, status: "pending", aiSummary: "Business registration address differs from submitted address. Entity confirmed with Companies House. Ownership documents uploaded.", sanctions: "clear", entity: "address_mismatch", flagReason: "Address inconsistency — registered vs. submitted differ" },
  { id: "q3", businessName: "Oasis Finance Group", country: "UAE", certType: "digital", riskScore: 32, ageHours: 6, status: "pending", aiSummary: "High-risk jurisdiction. Manual KYC required. Entity lookup requires local registry access. Documents uploaded but OCR incomplete.", sanctions: "pending", entity: "pending", flagReason: "High-risk jurisdiction — UAE requires enhanced due diligence" },
  { id: "q4", businessName: "Nova Health Inc", country: "US", certType: "self", riskScore: 62, ageHours: 1, status: "pending", aiSummary: "Clean sanctions check. Business registered in California. Minor inconsistency in ownership percentages between two documents.", sanctions: "clear", entity: "verified", flagReason: "Document ownership % inconsistency" },
];

export default function AdminReviewPage() {
  const [queue, setQueue]   = useState(INITIAL_QUEUE);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote]     = useState("");
  const [filter, setFilter] = useState<"all" | "pending">("pending");

  const item = queue.find(q => q.id === selected);

  function act(id: string, action: Action) {
    setQueue(prev => prev.map(q => q.id !== id ? q : ({
      ...q,
      status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "info_requested",
    })));
    setSelected(null);
    setNote("");
  }

  const filtered = filter === "pending" ? queue.filter(q => q.status === "pending") : queue;

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-bold text-2xl text-gray-900">Manual Review Queue</h1>
            <p className="text-gray-500 text-sm mt-0.5">Flagged applications requiring compliance review</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input-field pl-9 py-2 text-sm w-56" placeholder="Search businesses..." />
            </div>
            <button className="btn-outline gap-2 py-2 text-sm"><Filter size={14} />Filter</button>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {(["pending","all"] as const).map(f => (
                <button key={f} onClick={()=>setFilter(f)}
                  className={cn("px-4 py-2 text-sm font-medium transition-all", filter===f?"bg-brand-indigo text-white":"bg-white text-gray-600 hover:bg-gray-50")}>
                  {f==="pending" ? `Pending (${queue.filter(q=>q.status==="pending").length})` : "All"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5">
          {/* Queue list */}
          <div className="col-span-5 space-y-3">
            {filtered.map(item => (
              <button key={item.id} onClick={()=>setSelected(item.id)}
                className={cn("w-full text-left rounded-2xl border-2 p-4 transition-all",
                  selected===item.id ? "border-brand-indigo bg-brand-indigo/5" : "border-gray-100 bg-white hover:border-gray-200 shadow-sm")}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{item.businessName}</p>
                    <p className="text-xs text-gray-400">{item.country} · {item.certType === "self" ? "Self-Cert" : "Digital Cert"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <RiskBadge score={item.riskScore} />
                    <span className={cn("badge text-[10px]",
                      item.status==="pending" ? "status-pending" :
                      item.status==="approved" ? "status-active" :
                      item.status==="rejected" ? "status-rejected" : "status-review")}>
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                </div>
                {item.flagReason && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2">
                    <AlertTriangle size={11} />{item.flagReason}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                  <Clock size={11} />{item.ageHours}h ago
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <CheckCircle size={32} className="mx-auto mb-2 text-green-300" />
                <p className="text-sm font-medium">All caught up!</p>
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className="col-span-7">
            {item ? (
              <div className="card sticky top-24 space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-bold text-gray-900 text-lg">{item.businessName}</h2>
                    <p className="text-sm text-gray-400">{item.country} · {item.certType === "self" ? "Self-Certification" : "Digital Certification"}</p>
                  </div>
                  <RiskBadge score={item.riskScore} />
                </div>

                {/* Check results */}
                <div className="space-y-2.5">
                  {[
                    { label: "Sanctions Check", value: item.sanctions, icon: item.sanctions==="clear"?"pass":item.sanctions==="partial_match"?"warn":"pending" },
                    { label: "Entity Verification", value: item.entity, icon: item.entity==="verified"?"pass":item.entity==="pending"?"pending":"warn" },
                  ].map(row => (
                    <div key={row.label} className={cn("flex items-center justify-between p-3 rounded-xl border",
                      row.icon==="pass"?"bg-green-50 border-green-100":row.icon==="warn"?"bg-amber-50 border-amber-100":"bg-gray-50 border-gray-100")}>
                      <span className="text-sm font-medium text-gray-700">{row.label}</span>
                      <div className="flex items-center gap-1.5">
                        {row.icon==="pass"&&<CheckCircle size={14} className="text-green-500"/>}
                        {row.icon==="warn"&&<AlertTriangle size={14} className="text-amber-500"/>}
                        <span className="text-xs font-semibold text-gray-600">{row.value.replace(/_/g," ")}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI Summary */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-brand-blue mb-1.5">AI Analysis Summary</p>
                  <p className="text-sm text-blue-700/80 leading-relaxed">{item.aiSummary}</p>
                </div>

                {/* Documents */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Submitted Documents</p>
                  {["Articles of Incorporation", "Ownership Documents", "Government ID"].map(d => (
                    <div key={d} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-600">{d}</span>
                      <button className="text-xs text-brand-blue font-medium hover:underline flex items-center gap-1"><Eye size={11}/>View</button>
                    </div>
                  ))}
                </div>

                {/* Note */}
                {item.status === "pending" && (
                  <div>
                    <label className="label">Add Note (optional)</label>
                    <textarea className="textarea-field min-h-[70px]" placeholder="Internal note for audit trail..."
                      value={note} onChange={e=>setNote(e.target.value)} />
                  </div>
                )}

                {/* Actions */}
                {item.status === "pending" ? (
                  <div className="flex gap-3">
                    <button onClick={()=>act(item.id,"approve")} className="btn-blue flex-1 gap-2 py-2.5"><CheckCircle size={15}/>Approve</button>
                    <button onClick={()=>act(item.id,"request_info")} className="btn-outline flex-1 gap-2 py-2.5 text-sm"><MessageSquare size={14}/>Request Info</button>
                    <button onClick={()=>act(item.id,"reject")} className="btn-danger flex-1 gap-2 py-2.5"><XCircle size={15}/>Reject</button>
                  </div>
                ) : (
                  <div className={cn("text-center py-3 rounded-xl text-sm font-semibold",
                    item.status==="approved"?"bg-green-100 text-green-700":item.status==="rejected"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700")}>
                    {getStatusLabel(item.status)}
                  </div>
                )}
              </div>
            ) : (
              <div className="card h-64 flex items-center justify-center text-center">
                <div>
                  <Eye size={28} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400 font-medium">Select an application to review</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
