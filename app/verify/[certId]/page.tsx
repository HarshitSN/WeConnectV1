"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Cert = {
  id: string;
  revoked: boolean;
  revokedReason?: string;
  txHash: string;
  companyName: string;
  primaryOwner: string;
  ownershipFemalePct: number;
  issuedAt: string;
  manualReviewSuggested?: boolean;
  provenanceSummary?: {
    certType?: string;
    paidAtIssuance?: boolean;
    anchorMode?: "real" | "demo";
    anchorFallbackReason?: string;
    anchorKind?: "contract_call" | "tx_data";
    anchorContractAddress?: string;
    anchorDigest?: string;
    discoveryProvider?: string;
    selectedCandidateTitle?: string;
    visionIdPassed?: boolean;
    ownershipEvidenceSource?: "prefill_registry" | "prefill_web";
    ownershipVisionVerified?: boolean;
  };
};

export default function VerifyPage() {
  const params = useParams();
  const certId = params.certId as string;
  const [cert, setCert] = useState<Cert | null | undefined>(undefined);
  const verifyUrl =
    typeof window !== "undefined" ? `${window.location.origin}/verify/${certId}` : "";
  const certApiUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/certificate/${certId}` : "";
  const txUrl = cert ? `https://sepolia.basescan.org/tx/${cert.txHash}` : "";

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
    return (
      <div className="flex min-h-full items-center justify-center p-8 text-zinc-500">
        Loading verification…
      </div>
    );
  }

  if (cert === null) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-rose-400">Certificate not found (demo store may have reset).</p>
        <Link href="/" className="mt-4 inline-block text-cyan-400 hover:underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-8">
      <h1 className="text-lg font-semibold text-white">Public verify</h1>
      <div
        className={`rounded-2xl border p-6 ${
          cert.revoked ? "border-rose-500/40 bg-rose-950/30" : "border-emerald-500/30 bg-emerald-950/20"
        }`}
      >
        <p className="text-xs uppercase tracking-widest text-zinc-500">Status</p>
        <p className={`mt-1 text-2xl font-semibold ${cert.revoked ? "text-rose-400" : "text-emerald-400"}`}>
          {cert.revoked ? "Revoked" : "Valid"}
        </p>
        {cert.revoked && cert.revokedReason && (
          <p className="mt-2 text-sm text-rose-200/90">{cert.revokedReason}</p>
        )}
        <p className="mt-4 text-sm text-zinc-400">{cert.companyName}</p>
        <p className="text-sm text-zinc-500">Owner: {cert.primaryOwner}</p>
        <p className="mt-2 font-mono text-[11px] text-zinc-600 break-all">{cert.txHash}</p>
        <div className="mt-3 space-y-1 text-xs">
          <p className="text-zinc-500">Direct links:</p>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noreferrer"
            className="block break-all text-cyan-400 hover:underline"
          >
            Verify URL: {verifyUrl}
          </a>
          <a
            href={certApiUrl}
            target="_blank"
            rel="noreferrer"
            className="block break-all text-cyan-400 hover:underline"
          >
            Certificate API: {certApiUrl}
          </a>
          <a href={txUrl} target="_blank" rel="noreferrer" className="block break-all text-cyan-400 hover:underline">
            BaseScan tx: {txUrl}
          </a>
        </div>
        {cert.provenanceSummary && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
            <p>Certification type: {cert.provenanceSummary.certType ?? "unspecified"}</p>
            <p>Payment status at issuance: {cert.provenanceSummary.paidAtIssuance ? "paid" : "unpaid"}</p>
            <p>Anchor mode: {cert.provenanceSummary.anchorMode ?? "demo"}</p>
            <p>Anchor path: {cert.provenanceSummary.anchorKind ?? "tx_data"}</p>
            {cert.provenanceSummary.anchorContractAddress ? (
              <p>Contract: {cert.provenanceSummary.anchorContractAddress}</p>
            ) : null}
            {cert.provenanceSummary.anchorDigest ? (
              <p className="font-mono break-all">Digest: {cert.provenanceSummary.anchorDigest}</p>
            ) : null}
            {cert.provenanceSummary.anchorFallbackReason ? (
              <p>Anchor fallback reason: {cert.provenanceSummary.anchorFallbackReason}</p>
            ) : null}
            <p>Discovery source: {cert.provenanceSummary.discoveryProvider ?? "unknown"}</p>
            <p>Selected entity: {cert.provenanceSummary.selectedCandidateTitle ?? cert.companyName}</p>
            <p>
              Vision checks: ID {cert.provenanceSummary.visionIdPassed ? "pass" : "review"} · Ownership{" "}
              {cert.provenanceSummary.ownershipVisionVerified ? "vision-verified" : "prefill only"}
            </p>
            <p>Ownership evidence source: {cert.provenanceSummary.ownershipEvidenceSource ?? "prefill_registry"}</p>
          </div>
        )}
        {cert.manualReviewSuggested && !cert.revoked && (
          <p className="mt-3 text-xs text-amber-400">Flagged for manual review (demo heuristic).</p>
        )}
      </div>
      <p className="text-xs text-zinc-600">
        Buyer Portal hook (PRD p.9): in production this endpoint would mirror on-chain QID state.
      </p>
      <Link href="/" className="text-sm text-cyan-400 hover:underline">
        WEC home
      </Link>
    </div>
  );
}
