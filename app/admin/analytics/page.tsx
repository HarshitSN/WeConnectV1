"use client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import Navbar from "@/components/layout/Navbar";

const FUNNEL = [
  { stage: "Registered",      count: 1240, pct: 100 },
  { stage: "Verified",        count: 1058, pct: 85  },
  { stage: "Self-Certified",  count: 672,  pct: 54  },
  { stage: "Digital-Certified",count: 389, pct: 31  },
  { stage: "Renewed",         count: 201,  pct: 16  },
];

const MONTHLY = [
  { month: "Oct", registrations: 92,  certifications: 41 },
  { month: "Nov", registrations: 117, certifications: 58 },
  { month: "Dec", registrations: 88,  certifications: 39 },
  { month: "Jan", registrations: 143, certifications: 72 },
  { month: "Feb", registrations: 168, certifications: 94 },
  { month: "Mar", registrations: 201, certifications: 118 },
];

const CERT_DIST = [
  { name: "Self-Certified",    value: 58, color: "#7C3AED" },
  { name: "Digital-Certified", value: 33, color: "#2563EB" },
  { name: "Auditor-Certified", value: 9,  color: "#059669" },
];

const KPI = [
  { label: "Total Registered",    value: "1,240", delta: "+18%",  pos: true },
  { label: "Active Certifications",value: "1,061", delta: "+22%", pos: true },
  { label: "Avg Risk Score",       value: "74",    delta: "+3pts", pos: true },
  { label: "Manual Review Rate",   value: "8.3%",  delta: "-2.1%", pos: true },
  { label: "Auto-Approval Rate",   value: "91.7%", delta: "+2.1%", pos: true },
  { label: "Avg Time to Cert",     value: "18h",   delta: "-4h",  pos: true },
];

export default function AdminAnalyticsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="font-display font-bold text-2xl text-gray-900">Platform Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">Certification funnel, KPIs, and conversion metrics</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-6 gap-4 mb-8">
          {KPI.map(k => (
            <div key={k.label} className="card p-4 text-center">
              <p className="font-display font-bold text-2xl text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5 mb-1">{k.label}</p>
              <span className={`text-xs font-semibold ${k.pos?"text-green-600":"text-red-500"}`}>{k.delta}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-5 mb-5">
          {/* Conversion Funnel */}
          <div className="col-span-5 card">
            <h3 className="section-title mb-1">Certification Funnel</h3>
            <p className="text-xs text-gray-400 mb-5">Registration → Verification → Certification</p>
            <div className="space-y-3">
              {FUNNEL.map((s,i) => (
                <div key={s.stage}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{s.stage}</span>
                    <span className="text-gray-500">{s.count.toLocaleString()} <span className="text-gray-300">({s.pct}%)</span></span>
                  </div>
                  <div className="h-7 bg-gray-100 rounded-lg overflow-hidden">
                    <div className="h-full rounded-lg transition-all duration-700 flex items-center pl-3"
                      style={{ width:`${s.pct}%`, background:`hsl(${230 + i*20},70%,${60 - i*4}%)` }}>
                      {s.pct > 20 && <span className="text-xs font-bold text-white">{s.pct}%</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly trend */}
          <div className="col-span-7 card">
            <h3 className="section-title mb-1">Monthly Activity</h3>
            <p className="text-xs text-gray-400 mb-5">Registrations vs Certifications over 6 months</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={MONTHLY}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="registrations" stroke="#4F46E5" strokeWidth={2} dot={false} name="Registrations" />
                <Line type="monotone" dataKey="certifications" stroke="#7C3AED" strokeWidth={2} dot={false} name="Certifications" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5">
          {/* Cert distribution */}
          <div className="col-span-4 card">
            <h3 className="section-title mb-5">Certification Distribution</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={CERT_DIST} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                  {CERT_DIST.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-3">
              {CERT_DIST.map(d => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                    <span className="text-gray-600">{d.name}</span>
                  </div>
                  <span className="font-semibold text-gray-900">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Certifications bar */}
          <div className="col-span-8 card">
            <h3 className="section-title mb-1">Certifications by Month</h3>
            <p className="text-xs text-gray-400 mb-5">Self-cert vs Digital-cert breakdown</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={MONTHLY}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="certifications" fill="#7C3AED" radius={[4,4,0,0]} name="Total Certs" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </div>
  );
}
