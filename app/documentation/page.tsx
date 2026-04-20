import Link from "next/link";
import { BookOpen, FileText, Settings, Cpu, Network, Users, ArrowRight, ExternalLink } from "lucide-react";
import Navbar from "@/components/layout/Navbar";

const DOCS = [
  { icon: FileText, color: "bg-blue-100 text-brand-blue",     tag: "Core",       title: "Product Requirements (PRD)",   desc: "Full product specification for WEConnect Phase 1, including user stories and acceptance criteria." },
  { icon: Settings, color: "bg-gray-100 text-gray-600",       tag: "Technical",  title: "Configuration",                desc: "Platform configuration guide — environment variables, feature flags, and integration settings." },
  { icon: FileText, color: "bg-purple-100 text-brand-purple", tag: "Business",   title: "Configuration BRD",            desc: "Business Requirements Document outlining stakeholder needs and system requirements." },
  { icon: FileText, color: "bg-blue-100 text-brand-blue",     tag: "Core",       title: "Configuration PRD",            desc: "Product requirements scoped to platform configuration and administrative functions." },
  { icon: Cpu,      color: "bg-green-100 text-green-600",     tag: "Technical",  title: "Architecture",                 desc: "System architecture — service topology, data flows, Supabase + QID blockchain integration." },
  { icon: Network,  color: "bg-amber-100 text-amber-600",     tag: "Buyer",      title: "Buyer Portal",                 desc: "Buyer-facing portal documentation — search, filtering, supplier profiles, and RFP workflows." },
  { icon: Users,    color: "bg-rose-100 text-rose-600",       tag: "Ecosystem",  title: "Ecosystem",                    desc: "Ecosystem overview — participant roles, governance, and partner integration points." },
];

const API_ENDPOINTS = [
  { method: "GET",  path: "/api/v1/suppliers",                     desc: "Search & filter certified suppliers" },
  { method: "GET",  path: "/api/v1/suppliers/:id",                  desc: "Get single supplier profile" },
  { method: "GET",  path: "/api/v1/certifications/:num/verify",     desc: "Verify a certification in real-time" },
  { method: "GET",  path: "/api/v1/certifications/:num/blockchain",  desc: "Blockchain provenance chain" },
  { method: "POST", path: "/api/v1/suppliers/bulk-verify",          desc: "Bulk verify up to 100 certifications" },
  { method: "POST", path: "/api/v1/reports/audit-trail",            desc: "Generate exportable audit report" },
  { method: "POST", path: "/api/v1/reports/compliance",             desc: "Compliance gap analysis report" },
];

export default function DocumentationPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center gap-3 mb-8">
          <BookOpen size={24} className="text-brand-indigo" />
          <div>
            <h1 className="font-display font-bold text-xl sm:text-2xl text-gray-900">Documentation</h1>
            <p className="text-gray-500 text-sm">Platform docs, technical specs, and API reference</p>
          </div>
        </div>

        {/* Doc cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {DOCS.map(d => (
            <div key={d.title} className="card-hover group">
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${d.color}`}><d.icon size={20}/></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 text-sm group-hover:text-brand-indigo transition-colors">{d.title}</h3>
                    <ExternalLink size={13} className="text-gray-200 group-hover:text-brand-indigo transition-colors shrink-0"/>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed mb-2">{d.desc}</p>
                  <span className="badge bg-gray-100 text-gray-500">{d.tag}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* API Reference */}
        <div className="card mb-8">
          <h2 className="section-title mb-1">API Reference</h2>
          <p className="text-sm text-gray-500 mb-5">RESTful API for buyer integration. Rate limits: 100/min (Free) · 1,000/min (Professional) · Unlimited (Enterprise)</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-th">Method</th>
                  <th className="table-th">Endpoint</th>
                  <th className="table-th">Description</th>
                </tr>
              </thead>
              <tbody>
                {API_ENDPOINTS.map(ep => (
                  <tr key={ep.path} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td">
                      <span className={`badge font-mono ${ep.method==="GET"?"bg-green-100 text-green-700":"bg-blue-100 text-brand-blue"}`}>{ep.method}</span>
                    </td>
                    <td className="table-td font-mono text-xs text-brand-indigo">{ep.path}</td>
                    <td className="table-td text-gray-500">{ep.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Compliance */}
        <div className="card">
          <h2 className="section-title mb-4">Compliance & Security</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { title: "SOC 2 Type II", timeline: "Months 13–18", desc: "Annual audit for security, availability, and confidentiality." },
              { title: "GDPR & CCPA",   timeline: "Active",       desc: "Data privacy, right to deletion, and data portability." },
              { title: "ISO 27001",     timeline: "Months 13–18", desc: "Information security management system certification." },
            ].map(c => (
              <div key={c.title} className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-bold text-gray-900 text-sm mb-1">{c.title}</h4>
                <span className="badge bg-blue-100 text-brand-blue mb-2">{c.timeline}</span>
                <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
