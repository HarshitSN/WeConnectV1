import Link from "next/link";
import { ArrowRight, Network, Cpu, Globe, Users, TrendingUp, Shield, CheckCircle } from "lucide-react";
import Navbar from "@/components/layout/Navbar";

const NODES = [
  { icon: Users,     color: "bg-zinc-800 text-zinc-100",   title: "Suppliers",    count: "2,400+", desc: "Women-owned businesses & SMEs seeking certification and buyer connections." },
  { icon: Network,   color: "bg-zinc-800 text-zinc-100",   title: "Buyers",       count: "180+",   desc: "Corporate procurement teams searching for verified diverse suppliers." },
  { icon: Cpu,       color: "bg-zinc-800 text-zinc-100",   title: "Certifiers",   count: "34",     desc: "Accredited bodies and assessors validating supplier credentials." },
  { icon: Globe,     color: "bg-zinc-800 text-zinc-100",   title: "Markets",      count: "12",     desc: "Industry and geographic marketplaces powered by verified supplier data." },
];

const NEWCO = [
  "WOB Certification (Current)",
  "MBE (Minority-Owned Business)",
  "LGBTQ+-Owned Business",
  "Veteran-Owned Business",
  "Small Business Certification",
  "Global Certifier Equivalents",
];

export default function EcosystemPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-zinc-50 mb-2">Ecosystem</h1>
          <p className="text-zinc-400 max-w-xl">WEConnect brings together suppliers, buyers, certifiers, and markets into one interconnected platform for inclusive procurement.</p>
        </div>

        {/* Nodes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-10">
          {NODES.map(n => (
            <div key={n.title} className="rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-50 shadow p-6 hover:shadow-md hover:bg-zinc-800/50 transition-all flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-zinc-700 ${n.color}`}><n.icon size={22}/></div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-zinc-100">{n.title}</h3>
                  <span className="font-bold text-zinc-500 text-lg">{n.count}</span>
                </div>
                <p className="text-sm text-zinc-400">{n.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Data moat */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-50 shadow p-6 mb-8">
          <h2 className="font-display font-bold text-xl text-zinc-100 mb-5">Platform Data Moat</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
            {[
              { icon: Users,   title: "Proprietary WOB Database", type: "Network Effects + Switching Costs", defensibility: "HIGH", desc: "100K+ verified WOB profiles (Year 3 target). Blockchain-anchored provenance cannot be forged." },
              { icon: Cpu,     title: "AI Training Data",          type: "Data Flywheel + Proprietary Tech", defensibility: "VERY HIGH", desc: "Millions of labeled documents for fraud detection. Models improve with scale — compounding advantage." },
              { icon: Shield,  title: "Blockchain Audit Trail",    type: "Regulatory + Technical",           defensibility: "VERY HIGH", desc: "Immutable provenance from day 1. Cannot replicate without full history. Becomes industry standard." },
            ].map(m => (
              <div key={m.title} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors">
                <m.icon size={20} className="text-zinc-100 mb-3" />
                <h4 className="font-bold text-zinc-100 text-sm mb-1">{m.title}</h4>
                <p className="text-xs text-zinc-400 font-semibold mb-2">{m.type}</p>
                <p className="text-xs text-zinc-500 leading-relaxed mb-3">{m.desc}</p>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.defensibility === "VERY HIGH" ? "bg-zinc-100 text-zinc-950 border-zinc-200" : "bg-zinc-800 text-zinc-300 border-zinc-700"}`}>
                  Defensibility: {m.defensibility}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* NewCo Expansion */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-50 shadow p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="font-display font-bold text-xl text-zinc-100">NewCo Ecosystem Expansion</h2>
              <p className="text-sm text-zinc-400 mt-1">WEC as blueprint for multi-certification global community</p>
            </div>
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-zinc-800 text-zinc-300 border-zinc-700">Phase 2</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {NEWCO.map((item, i) => (
              <div key={item} className={`flex items-center gap-2 p-3 rounded-xl border text-sm ${i===0?"border-zinc-700 bg-zinc-800 font-semibold text-zinc-100":"border-zinc-800 text-zinc-400"}`}>
                <CheckCircle size={13} className={i===0?"text-zinc-100":"text-zinc-600"}/>{item}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-10 text-center">
          <h2 className="font-display font-bold text-2xl text-zinc-50 mb-3">Join the WEConnect Ecosystem</h2>
          <p className="text-zinc-400 mb-6 max-w-md mx-auto">Get certified and start connecting with procurement teams from global corporations.</p>
          <Link href="/dashboard" className="inline-flex items-center justify-center rounded-md text-sm transition-colors bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-bold px-6 py-3 gap-2">
            Start Your Journey <ArrowRight size={16}/>
          </Link>
        </div>
      </main>
    </div>
  );
}
