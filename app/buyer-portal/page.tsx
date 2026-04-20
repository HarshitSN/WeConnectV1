"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Globe, CheckCircle, Shield, Link2, Download, X, Sparkles } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { NAICS_CODES } from "@/lib/constants";
import { cn, getCertTypeLabel } from "@/lib/utils";
import { trustLevelLabel, type RiskLevel } from "@/lib/domains/contracts";
import type { CertType, CertStatus } from "@/types";

type ResultRow = {
  supplier: {
    id: string;
    business_name: string;
    country: string;
    industry_codes: string[];
    category_codes: string[];
    designations: string[];
    cert_type: CertType;
    cert_status: CertStatus;
    trust_score: number;
    blockchain_verified: boolean;
    women_owned: boolean;
    last_verified?: string;
    business_summary?: string;
    clients_worked_with?: string;
  };
  profile: {
    trustLevel: "self_declared" | "self_certified" | "digitally_certified";
    trustScore: number;
    riskLevel: RiskLevel;
    lastVerified: string;
    verificationSummary?: {
      ownershipVerified: boolean;
      identityMatch: "high" | "medium" | "low";
      documentConsistency: "clean" | "minor_flag" | "major_flag";
      sanctionsCheck: "clear" | "flagged" | "pending";
      entityVerification: "verified" | "pending" | "mismatch";
    };
  };
  match: {
    matchScore: number;
    certificationPriority: number;
    rankReason: string;
  };
};

type CertificateListItem = {
  id: string;
  companyName: string;
  revoked: boolean;
};

interface Filters {
  query: string;
  cert_type: CertType | "";
  cert_status: CertStatus | "";
  naics: string;
  country: string;
  women_owned: boolean | null;
}

const EMPTY_FILTERS: Filters = {
  query: "",
  cert_type: "",
  cert_status: "",
  naics: "",
  country: "",
  women_owned: null,
};

export default function BuyerPortalPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [recommendations, setRecommendations] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"verify" | "rfp" | "audit" | null>(null);
  const [actionMessage, setActionMessage] = useState<string>("");

  const set = (key: keyof Filters, val: unknown) => setFilters((f) => ({ ...f, [key]: val }));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const qs = new URLSearchParams();
      if (filters.query) qs.set("query", filters.query);
      if (filters.cert_type) qs.set("cert_type", filters.cert_type);
      if (filters.country) qs.set("country", filters.country);
      if (filters.naics) qs.set("naics", filters.naics);
      if (filters.women_owned !== null) qs.set("women_owned", String(filters.women_owned));

      const res = await fetch(`/api/buyer/search?${qs.toString()}`);
      const json = (await res.json()) as { results?: ResultRow[]; recommendations?: ResultRow[] };
      const resultRows = (json.results ?? []).filter((r) =>
        filters.cert_status ? r.supplier.cert_status === filters.cert_status : true,
      );
      setRows(resultRows);
      setRecommendations((json.recommendations ?? []).slice(0, 6));
      setLoading(false);
    };
    void load();
  }, [filters]);

  const supplier = useMemo(() => rows.find((s) => s.supplier.id === selected) ?? null, [rows, selected]);
  const activeFilterCount = Object.entries(filters).filter(([, v]) => v !== "" && v !== null).length;
  const naicsLabelByCode = useMemo(
    () =>
      new Map(
        NAICS_CODES.map((entry) => [
          entry.code,
          `${entry.code} - ${entry.label.split(",")[0]}`,
        ]),
      ),
    [],
  );

  const runVerifyCert = async () => {
    if (!supplier) return;
    setActionLoading("verify");
    setActionMessage("");
    try {
      const res = await fetch("/api/certificate");
      const json = (await res.json()) as { certificates?: CertificateListItem[] };
      const byName = (json.certificates ?? []).find(
        (cert) =>
          !cert.revoked &&
          cert.companyName.trim().toLowerCase() === supplier.supplier.business_name.trim().toLowerCase(),
      );

      if (byName) {
        window.location.href = `/verify/${byName.id}`;
        return;
      }

      setActionMessage(
        supplier.supplier.cert_status === "active"
          ? "No active certificate record found yet for this supplier. Please try again after issuance sync."
          : "This supplier does not have an active certificate yet.",
      );
    } catch {
      setActionMessage("Could not verify certificate right now. Please retry.");
    } finally {
      setActionLoading(null);
    }
  };

  const runInviteRfp = async () => {
    if (!supplier) return;
    setActionLoading("rfp");
    setActionMessage("");
    try {
      const res = await fetch("/api/buyer/rfp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier.supplier.id,
          supplierName: supplier.supplier.business_name,
          buyerQuery: filters.query,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; inviteId?: string; message?: string };
      if (!res.ok || !json.ok) {
        setActionMessage(json.message ?? "Failed to send RFP invite.");
        return;
      }
      setActionMessage(`RFP invite sent successfully (${json.inviteId}).`);
    } catch {
      setActionMessage("Could not send RFP invite. Please retry.");
    } finally {
      setActionLoading(null);
    }
  };

  const runAuditReport = async () => {
    if (!supplier) return;
    setActionLoading("audit");
    setActionMessage("");
    try {
      const res = await fetch("/api/buyer/audit-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier,
          query: filters.query,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        fileName?: string;
        content?: string;
        message?: string;
      };
      if (!res.ok || !json.ok || !json.content || !json.fileName) {
        setActionMessage(json.message ?? "Failed to generate audit report.");
        return;
      }
      const blob = new Blob([json.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = json.fileName;
      a.click();
      URL.revokeObjectURL(url);
      setActionMessage(`Audit report downloaded (${json.fileName}).`);
    } catch {
      setActionMessage("Could not generate audit report. Please retry.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-zinc-50">Buyer Portal</h1>
            <p className="mt-0.5 text-sm text-zinc-400">Certification-prioritized supplier discovery with AI match scoring</p>
          </div>
          <button className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-800 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800 hover:text-zinc-50">
            <Download size={14} />Export CSV
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-xs text-cyan-100">
          Ranking policy: <strong>Digital Certified</strong> → <strong>Self-Certified</strong> → <strong>Self-Declared</strong>
        </div>

        {recommendations.length > 0 && (
          <section className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Sparkles size={14} className="text-cyan-400" /> Top recommended suppliers based on your requirement
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              {recommendations.map((row) => (
                <button
                  key={row.supplier.id}
                  onClick={() => setSelected(row.supplier.id)}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-left hover:border-cyan-500/50"
                >
                  <p className="text-sm font-semibold text-zinc-100">{row.supplier.business_name}</p>
                  <p className="text-xs text-zinc-500">Match Score: {row.match.matchScore}%</p>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mb-4 flex gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              className="flex h-9 w-full rounded-md border border-zinc-800 bg-transparent px-3 py-1 pl-10 text-sm shadow-sm transition-colors placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
              placeholder="Natural language search (e.g. Women-owned textile suppliers in India)"
              value={filters.query}
              onChange={(e) => set("query", e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "relative inline-flex items-center justify-center gap-2 rounded-md border border-zinc-800 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800 hover:text-zinc-50",
              showFilters && "border-zinc-700 bg-zinc-800 text-zinc-50",
            )}
          >
            <Filter size={14} />Filters
            {activeFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100 text-[9px] font-bold text-zinc-950">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-50 shadow">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-zinc-50">Filters</p>
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:underline"
              >
                <X size={11} />Clear all
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4 lg:grid-cols-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Cert Type</label>
                <select className="flex h-9 w-full cursor-pointer appearance-none rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300" value={filters.cert_type} onChange={(e) => set("cert_type", e.target.value)}>
                  <option value="">Any</option>
                  <option value="digital">Digital-Certified</option>
                  <option value="self">Self-Certified</option>
                  <option value="none">Self-Declared</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Cert Status</label>
                <select className="flex h-9 w-full cursor-pointer appearance-none rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300" value={filters.cert_status} onChange={(e) => set("cert_status", e.target.value)}>
                  <option value="">Any</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Industry (NAICS)</label>
                <select className="flex h-9 w-full cursor-pointer appearance-none rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300" value={filters.naics} onChange={(e) => set("naics", e.target.value)}>
                  <option value="">Any</option>
                  {NAICS_CODES.map((n) => (
                    <option key={n.code} value={n.code}>{n.code} - {n.label.split(",")[0]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Country</label>
                <input className="flex h-9 w-full rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300" placeholder="e.g. India" value={filters.country} onChange={(e) => set("country", e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">Women-Owned</label>
                <select className="flex h-9 w-full cursor-pointer appearance-none rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300" value={filters.women_owned === null ? "" : String(filters.women_owned)} onChange={(e) => set("women_owned", e.target.value === "" ? null : e.target.value === "true")}>
                  <option value="">Any</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <p className="mb-4 text-sm text-zinc-500">
          {loading ? "Loading..." : `${rows.length} supplier${rows.length !== 1 ? "s" : ""} found`}
        </p>

        <div className="grid grid-cols-12 gap-5">
          <div className={cn("space-y-3", supplier ? "col-span-7" : "col-span-12 grid grid-cols-1 gap-4 space-y-0 md:grid-cols-2 lg:grid-cols-3")}>
            {rows.map((row) => (
              <div key={row.supplier.id} onClick={() => setSelected(row.supplier.id === selected ? null : row.supplier.id)} className={cn("cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-50 shadow transition-all hover:bg-zinc-800/50 hover:shadow-md", selected === row.supplier.id && "ring-2 ring-zinc-500")}>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">{row.supplier.business_name}</h3>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                      <Globe size={11} />{row.supplier.country}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-zinc-100">{row.profile.trustScore}</p>
                    <p className="text-[10px] text-zinc-500">Trust Score</p>
                  </div>
                </div>
                <p className="mb-2 text-xs text-cyan-300">{trustLevelLabel(row.profile.trustLevel)}</p>
                <p className="mb-2 text-xs text-zinc-400">Match Score: <span className="font-semibold text-zinc-200">{row.match.matchScore}%</span></p>
                <p className="mb-1 text-xs text-zinc-400">
                  Category (NAICS):{" "}
                  <span className="text-zinc-200">
                    {row.supplier.industry_codes.length
                      ? naicsLabelByCode.get(row.supplier.industry_codes[0]) ?? row.supplier.industry_codes[0]
                      : "N/A"}
                  </span>
                </p>
                <p className="mb-1 text-xs text-zinc-400">
                  Risk Level: <span className="text-zinc-200">{row.profile.riskLevel}</span>
                </p>
                <p className="mb-2 text-xs text-zinc-400">
                  Last Verified: <span className="text-zinc-200">{row.profile.lastVerified || "N/A"}</span>
                </p>
                <p className="mb-2 text-xs text-zinc-500">{row.supplier.business_summary ?? "Business summary unavailable."}</p>
                <p className="mb-2 text-xs text-zinc-400">{row.supplier.clients_worked_with ?? "Worked with 5 clients (mock)"}</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", row.supplier.cert_type === "digital" ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "border-zinc-800 bg-transparent text-zinc-400")}>{getCertTypeLabel(row.supplier.cert_type)}</span>
                  {row.supplier.blockchain_verified && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold text-zinc-300"><Link2 size={9} />Blockchain</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", row.supplier.cert_status === "active" ? "border-zinc-200 bg-zinc-100 text-zinc-900" : "border-zinc-700 bg-zinc-800 text-zinc-300")}>{row.supplier.cert_status}</span>
                  <button className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100">View Profile</button>
                </div>
              </div>
            ))}

            {!loading && rows.length === 0 && (
              <div className={cn("py-16 text-center text-zinc-500", !supplier && "col-span-3")}>
                <Search size={32} className="mx-auto mb-2 text-zinc-700" />
                <p className="text-sm font-medium">No suppliers match your filters</p>
              </div>
            )}
          </div>

          {supplier && (
            <div className="col-span-5">
              <div className="sticky top-24 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-50 shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-bold text-zinc-100">{supplier.supplier.business_name}</h2>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-400"><Globe size={13} />{supplier.supplier.country}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-zinc-100">{supplier.profile.trustScore}</div>
                    <div className="text-xs text-zinc-500">Trust Score</div>
                  </div>
                </div>

                <p className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">{trustLevelLabel(supplier.profile.trustLevel)}</p>
                <p className="text-xs text-zinc-400">Match Score: <span className="font-semibold text-zinc-200">{supplier.match.matchScore}%</span> · {supplier.match.rankReason}</p>
                <p className="text-xs text-zinc-500">{supplier.supplier.business_summary ?? "Business summary unavailable."}</p>
                <p className="text-xs text-zinc-400">{supplier.supplier.clients_worked_with ?? "Worked with 5 clients (mock)"}</p>
                <div className="rounded-xl border border-zinc-700 bg-zinc-800 p-3 text-xs text-zinc-300">
                  <p className="font-semibold text-zinc-100">Full Details</p>
                  <p className="mt-1">Industry (NAICS): {supplier.supplier.industry_codes.join(", ") || "N/A"}</p>
                  <p>Category (UNSPSC): {supplier.supplier.category_codes.join(", ") || "N/A"}</p>
                  <p>Women-owned: {supplier.supplier.women_owned ? "Yes" : "No"}</p>
                  <p>Blockchain verified: {supplier.supplier.blockchain_verified ? "Yes" : "No"}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Certification", value: getCertTypeLabel(supplier.supplier.cert_type) },
                    { label: "Status", value: supplier.supplier.cert_status },
                    { label: "Risk Level", value: supplier.profile.riskLevel },
                    { label: "Last Verified", value: supplier.profile.lastVerified || "N/A" },
                  ].map((row) => (
                    <div key={row.label} className="rounded-xl border border-zinc-700 bg-zinc-800 p-3">
                      <p className="text-xs text-zinc-400">{row.label}</p>
                      <p className="mt-0.5 text-sm font-bold text-zinc-100">{row.value}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-zinc-300">Designations</p>
                  <div className="flex flex-wrap gap-1.5">
                    {supplier.supplier.designations.map((d) => (
                      <span key={d} className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold text-zinc-300">{d}</span>
                    ))}
                  </div>
                </div>
                {supplier.profile.verificationSummary && (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-800 p-3 text-xs text-zinc-300">
                    <p className="font-semibold text-zinc-100">Verification summary</p>
                    <p>Sanctions: {supplier.profile.verificationSummary.sanctionsCheck}</p>
                    <p>Entity: {supplier.profile.verificationSummary.entityVerification}</p>
                    <p>Identity match: {supplier.profile.verificationSummary.identityMatch}</p>
                    <p>Document consistency: {supplier.profile.verificationSummary.documentConsistency}</p>
                  </div>
                )}
                <div className="rounded-xl border border-zinc-700 bg-zinc-800 p-3 text-xs text-zinc-300">
                  <p className="font-semibold text-zinc-100">Trust report</p>
                  <p>Trust score: {supplier.profile.trustScore}</p>
                  <p>Risk level: {supplier.profile.riskLevel}</p>
                  <p>Trust level: {trustLevelLabel(supplier.profile.trustLevel)}</p>
                  <p>Last verified: {supplier.profile.lastVerified || "N/A"}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void runVerifyCert()}
                    disabled={actionLoading !== null}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle size={14} />
                    {actionLoading === "verify" ? "Verifying..." : "Verify Cert"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runInviteRfp()}
                    disabled={actionLoading !== null}
                    className="inline-flex flex-1 items-center justify-center rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === "rfp" ? "Sending..." : "Invite to RFP"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void runAuditReport()}
                  disabled={actionLoading !== null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Shield size={13} />
                  {actionLoading === "audit" ? "Generating report..." : "Request Audit Report"}
                </button>
                {actionMessage ? (
                  <p className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                    {actionMessage}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
