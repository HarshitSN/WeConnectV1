"use client";

import { QRCodeSVG } from "qrcode.react";

export type CertDisplay = {
  id: string;
  companyName: string;
  primaryOwner: string;
  ownershipFemalePct: number;
  issuedAt: string;
  txHash: string;
  revoked?: boolean;
};

type Props = {
  cert: CertDisplay;
  verifyUrl: string;
};

export function CertificateCard({ cert, verifyUrl }: Props) {
  const txUrl = cert.txHash ? `https://sepolia.basescan.org/tx/${cert.txHash}` : "";
  let apiUrl = "";
  try {
    const verify = new URL(verifyUrl);
    apiUrl = `${verify.origin}/api/certificate/${cert.id}`;
  } catch {
    apiUrl = "";
  }

  return (
    <div
      className={`rounded-2xl border p-6 shadow-xl ${
        cert.revoked
          ? "border-rose-500/40 bg-rose-950/40"
          : "border-cyan-500/30 bg-gradient-to-br from-zinc-900 to-zinc-950"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-500/90">
            WEC · Live soulbound certificate
          </p>
          <h3 className="mt-1 text-xl font-semibold text-white">{cert.companyName}</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Primary owner: <span className="text-zinc-200">{cert.primaryOwner}</span>
          </p>
          <p className="text-sm text-zinc-400">
            Female ownership (filed, prefill only):{" "}
            <span className="text-emerald-400">{cert.ownershipFemalePct}%</span>
          </p>
          <p className="mt-3 font-mono text-[11px] text-zinc-500 break-all">
            QID tx: {cert.txHash}
          </p>
          <p className="mt-1 text-xs text-zinc-600">Issued {new Date(cert.issuedAt).toLocaleString()}</p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3">
          <QRCodeSVG value={verifyUrl} size={120} level="M" />
          <span className="text-[10px] text-zinc-600">Scan to verify</span>
        </div>
      </div>
      <div className="mt-4 space-y-1 text-xs">
        <p className="text-zinc-400">Direct links:</p>
        <a href={verifyUrl} target="_blank" rel="noreferrer" className="block break-all text-cyan-400 hover:underline">
          Verify URL: {verifyUrl}
        </a>
        {apiUrl ? (
          <a href={apiUrl} target="_blank" rel="noreferrer" className="block break-all text-cyan-400 hover:underline">
            Certificate API: {apiUrl}
          </a>
        ) : null}
        {txUrl ? (
          <a href={txUrl} target="_blank" rel="noreferrer" className="block break-all text-cyan-400 hover:underline">
            BaseScan tx: {txUrl}
          </a>
        ) : null}
      </div>
    </div>
  );
}
