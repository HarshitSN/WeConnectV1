"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { trustLevelLabel } from "@/lib/domains/contracts";

type Cert = {
  id: string;
  revoked: boolean;
  revokedReason?: string;
  txHash: string;
  companyName: string;
  issuedAt: string;
  certificationType: "none" | "self" | "digital";
  trustLevel: "self_declared" | "self_certified" | "digitally_certified";
  status: "active" | "revoked";
  trustScore: number;
  riskLevel: "low" | "medium" | "high";
  blockchainHash: string;
  validTill: string;
  verificationSummary?: {
    ownershipVerified: boolean;
    identityMatch: "high" | "medium" | "low";
    documentConsistency: "clean" | "minor_flag" | "major_flag";
  };
};

export default function VerifyPage() {
  const params = useParams();
  const certId = params.certId as string;
  const [cert, setCert] = useState<Cert | null | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/certificate/${certId}`);
      if (!r.ok) {
        setCert(null);
        return;
      }
      setCert((await r.json()) as Cert);
    })();
  }, [certId]);

  if (cert === undefined) {
    return <div className="flex min-h-full items-center justify-center p-8 text-zinc-500">Loading verification…</div>;
  }

  if (cert === null) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-rose-400">Certificate not found (demo store may have reset).</p>
        <Link href="/" className="mt-4 inline-block text-cyan-400 hover:underline">Back</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-8">
      <h1 className="text-lg font-semibold text-white">Public Verification Page</h1>
      <div className={`rounded-2xl border p-6 ${cert.revoked ? "border-rose-500/40 bg-rose-950/30" : "border-emerald-500/30 bg-emerald-950/20"}`}>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Status</p>
        <p className={`mt-1 text-2xl font-semibold ${cert.revoked ? "text-rose-400" : "text-emerald-400"}`}>{cert.status}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-zinc-500">Company</p>
            <p className="text-sm text-zinc-100">{cert.companyName}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-zinc-500">Certification Type</p>
            <p className="text-sm text-zinc-100">{cert.certificationType}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-zinc-500">Trust Score</p>
            <p className="text-sm text-zinc-100">{cert.trustScore}/100</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-zinc-500">Risk Level</p>
            <p className="text-sm text-zinc-100">{cert.riskLevel}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-zinc-500">Blockchain Hash</p>
            <p className="break-all font-mono text-xs text-zinc-200">{cert.blockchainHash}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-zinc-500">Validity</p>
            <p className="text-sm text-zinc-100">{new Date(cert.validTill).toLocaleDateString()}</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-cyan-200">{trustLevelLabel(cert.trustLevel)}</p>

        {cert.verificationSummary && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
            <p>Ownership Verified: {cert.verificationSummary.ownershipVerified ? "Yes" : "No"}</p>
            <p>Identity Match: {cert.verificationSummary.identityMatch}</p>
            <p>Document Consistency: {cert.verificationSummary.documentConsistency}</p>
          </div>
        )}
      </div>
      <Link href="/" className="text-sm text-cyan-400 hover:underline">WEC home</Link>
    </div>
  );
}
