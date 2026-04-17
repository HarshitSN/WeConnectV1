"use client";
import { useState } from "react";
import { AlertTriangle, Search, Eye, Ban, FileSearch, Clock, TrendingUp, Shield } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import RiskBadge from "@/components/ui/RiskBadge";
import { cn } from "@/lib/utils";

interface FraudAlert {
  id: string; type: "duplicate" | "doc_forgery" | "ownership_mismatch" | "rapid_changes";
  businessName: string; severity: "high" | "medium";
  description: string; detectedAt: string; status: "open" | "investigating" | "resolved";
  score: number;
}

const ALERTS: FraudAlert[] = [
  { id: "f1", type: "duplicate", businessName: "Sunrise Services LLC", severity: "high", description: "92% similarity match with existing certified business 'Sunrise Business LLC' (ID: BUS-1042). Same EIN detected.", detectedAt: "2 hours ago", status: "open", score: 18 },
  { id: "f2", type: "doc_forgery", businessName: "Pacific Ventures Inc", severity: "high", description: "Document metadata analysis detected inconsistent creation dates. PDF properties suggest modification after issuance.", detectedAt: "5 hours ago", status: "investigating", score: 22 },
  { id: "f3", type: "ownership_mismatch", businessName: "Bloom Consulting", severity: "medium", description: "Ownership percentages in Articles of Incorporation (45% female) conflict with self-attested value (65% female).", detectedAt: "1 day ago", status: "open", score: 38 },
  { id: "f4", type: "rapid_changes", businessName: "Nova Enterprises", severity: "medium", description: "3 address changes and 2 ownership structure updates within 30 days. Unusual activity pattern flagged by ML model.", detectedAt: "2 days ago", status: "resolved", score: 45 },
];

const TYPE_LABELS: Record<FraudAlert["type"], string> = {
  duplicate: "Duplicate Business",
  doc_forgery: "Document Forgery",
  ownership_mismatch: "Ownership Mismatch",
  rapid_changes: "Rapid Profile Changes",
};

const TYPE_ICONS: Record<FraudAlert["type"], React.ComponentType<any>> = {
  duplicate: Search, doc_forgery: FileSearch, ownership_mismatch: AlertTriangle, rapid_changes: TrendingUp,
};

export default function AdminFraudPage() {
  const [alerts, setAlerts] = useState(ALERTS);
  const [selected, setSelected] = useState<string | null>(null);

  const item = alerts.find(a => a.id === selected);
  const open  = alerts.filter(a => a.status !== "resolved").length;

  function resolve(id: string) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: "resolved" } : a));
    setSelected(null);
  }

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-bold text-2xl text-gray-900">Fraud Monitoring</h1>
            <p className="text-gray-500 text-sm mt-0.5">ML-powered fraud detection and investigation workflow</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              <AlertTriangle size={15} className="text-red-500" />
              <span className="text-sm font-bold text-red-700">{open} Open Alerts</span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Alerts (30d)", value: "24", icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50" },
            { label: "Duplicates Detected", value: "8",  icon: Search,       color: "text-orange-500", bg: "bg-orange-50" },
            { label: "Doc Forgeries",       value: "3",  icon: FileSearch,   color: "text-purple-500", bg: "bg-purple-50" },
            { label: "Resolved",            value: "13", icon: Shield,       color: "text-green-500", bg: "bg-green-50" },
          ].map(s => (
            <div key={s.label} className="card flex items-center gap-3 p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon size={18} className={s.color} />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-xl">{s.value}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-5">
          {/* Alerts list */}
          <div className="col-span-5 space-y-3">
            {alerts.map(alert => {
              const Icon = TYPE_ICONS[alert.type];
              return (
                <button key={alert.id} onClick={() => setSelected(alert.id)}
                  className={cn("w-full text-left rounded-2xl border-2 p-4 transition-all",
                    selected === alert.id ? "border-brand-indigo bg-brand-indigo/5" :
                    alert.status === "resolved" ? "border-gray-100 bg-gray-50 opacity-60" :
                    "border-gray-100 bg-white hover:border-gray-200 shadow-sm")}>
                  <div className="flex items-start gap-3">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                      alert.severity === "high" ? "bg-red-100" : "bg-amber-100")}>
                      <Icon size={16} className={alert.severity === "high" ? "text-red-500" : "text-amber-500"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-sm text-gray-900 truncate">{alert.businessName}</p>
                        <RiskBadge score={alert.score} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{TYPE_LABELS[alert.type]}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn("badge text-[10px]",
                          alert.status === "open" ? "status-rejected" :
                          alert.status === "investigating" ? "status-review" : "status-active")}>
                          {alert.status}
                        </span>
                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Clock size={9} />{alert.detectedAt}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          <div className="col-span-7">
            {item ? (
              <div className="card space-y-5 sticky top-24">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-bold text-gray-900 text-lg">{item.businessName}</h2>
                    <p className="text-sm text-gray-400">{TYPE_LABELS[item.type]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskBadge score={item.score} />
                    <span className={cn("badge", item.severity === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                      {item.severity} severity
                    </span>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-red-700 mb-1.5">Fraud Signal Details</p>
                  <p className="text-sm text-red-700/80 leading-relaxed">{item.description}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Investigation Actions</p>
                  <div className="space-y-2">
                    {["View submitted documents", "Check document metadata", "Cross-reference registry", "View audit log"].map(a => (
                      <button key={a} className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 text-sm text-gray-700 transition-all">
                        <span>{a}</span>
                        <Eye size={14} className="text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>

                {item.status !== "resolved" && (
                  <div className="flex gap-3">
                    <button onClick={() => resolve(item.id)} className="btn-blue flex-1 gap-2 py-2.5 text-sm">
                      <Shield size={14} />Mark Resolved
                    </button>
                    <button className="btn-danger flex-1 gap-2 py-2.5 text-sm">
                      <Ban size={14} />Revoke Certification
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="card h-64 flex items-center justify-center text-center">
                <div>
                  <AlertTriangle size={28} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400">Select an alert to investigate</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
