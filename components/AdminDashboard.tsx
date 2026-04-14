"use client";

import { useCallback, useEffect, useState } from "react";
import { TerminalFeed } from "./TerminalFeed";

type SessionRow = {
  id: string;
  stage: string;
  companyId: string | null;
  certId: string | null;
  updatedAt: number;
  terminalLineCount: number;
};

type CertRow = {
  id: string;
  revoked: boolean;
  companyName: string;
  txHash: string;
  provenanceSummary?: {
    anchorMode?: "real" | "demo";
    anchorKind?: "contract_call" | "tx_data";
  };
};

type Health = {
  ai?: {
    geminiKeyConfigured?: boolean;
    geminiModel?: string;
    fallbackChainConfigured?: boolean;
    effectiveModelOrder?: string[];
    guardrailWarning?: string | null;
    degraded?: boolean;
    recentFallbackCount?: number;
    recentModelFallbackSuccessCount?: number;
    lastSuccessfulModelUsed?: string | null;
    lastFallback?: {
      at: string;
      reason: string;
      quotaSubtype?: "capacity" | "quota";
      model?: string;
      selectedModel?: string;
      attemptedModels?: string[];
      retryAfterSec?: number;
      quotaMetric?: string;
      quotaId?: string;
      channel?: string;
    } | null;
  };
  chain?: {
    mode?: string;
    chainId?: number;
    rpcConfigured?: boolean;
    privateKeyConfigured?: boolean;
    privateKeyValid?: boolean;
    contractConfigured?: boolean;
    contractAddress?: string;
    configError?: string;
  };
  stats?: {
    sessions?: number;
    certificates?: number;
    activeCertificates?: number;
    manualReviewSuggested?: number;
  };
  lastCertificate?: {
    id: string;
    txHash: string;
    revoked: boolean;
    anchorMode: string;
    anchorKind: string;
  } | null;
  lastAnchorError?: {
    at: string;
    reasonCode: string;
    reasonDetail: string;
    operatorHint?: string;
  } | null;
};

export function AdminDashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [pickSession, setPickSession] = useState<string>("");
  const [lines, setLines] = useState<string[]>([]);
  const [revokeId, setRevokeId] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [tickInfo, setTickInfo] = useState<string>("");

  const refresh = useCallback(async () => {
    const [sRes, cRes] = await Promise.all([
      fetch("/api/session/list"),
      fetch("/api/certificate"),
    ]);
    const sj = (await sRes.json()) as { sessions?: SessionRow[] };
    const cj = (await cRes.json()) as { certificates?: CertRow[] };
    setSessions(sj.sessions ?? []);
    setCerts(cj.certificates ?? []);
    const hRes = await fetch("/api/admin/health");
    if (hRes.ok) {
      setHealth((await hRes.json()) as Health);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => void refresh(), 0);
    const t = window.setInterval(() => void refresh(), 3000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(t);
    };
  }, [refresh]);

  const loadTerminal = async (id: string) => {
    setPickSession(id);
    const r = await fetch(`/api/session?id=${id}`);
    const j = (await r.json()) as { terminalLines?: string[] };
    setLines(j.terminalLines ?? []);
  };

  useEffect(() => {
    if (!pickSession) return;
    const t = setInterval(() => void loadTerminal(pickSession), 2000);
    return () => clearInterval(t);
  }, [pickSession]);

  const revoke = async () => {
    if (!revokeId.trim()) return;
    await fetch("/api/certificate/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certId: revokeId.trim() }),
    });
    setRevokeId("");
    void refresh();
    if (pickSession) void loadTerminal(pickSession);
  };

  const runRevocationTick = async () => {
    const r = await fetch("/api/admin/revocation-tick", { method: "POST" });
    const j = (await r.json()) as { revoked?: string[]; scanned?: number };
    setTickInfo(`Scanned ${j.scanned ?? 0} certs · revoked ${(j.revoked ?? []).length}`);
    void refresh();
    if (pickSession) void loadTerminal(pickSession);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-medium text-zinc-300">Sessions (in-memory)</h2>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => void loadTerminal(s.id)}
                  className={`w-full rounded px-2 py-1 text-left hover:bg-white/5 ${
                    pickSession === s.id ? "bg-cyan-500/10 text-cyan-200" : "text-zinc-400"
                  }`}
                >
                  <span className="font-mono text-xs">{s.id.slice(0, 10)}…</span> · {s.stage}
                  {s.certId ? ` · cert ${s.certId.slice(0, 6)}…` : ""}
                </button>
              </li>
            ))}
            {sessions.length === 0 && (
              <li className="text-zinc-600">No active sessions yet. Open the user flow.</li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-medium text-zinc-300">Certificates</h2>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-500">
            {certs.map((c) => (
              <li key={c.id} className="flex justify-between gap-2 font-mono">
                <span className="truncate text-zinc-400">
                  {c.id} · {c.provenanceSummary?.anchorMode ?? "demo"} /{" "}
                  {c.provenanceSummary?.anchorKind ?? "tx_data"}
                </span>
                <span className={c.revoked ? "text-rose-400" : "text-emerald-500"}>
                  {c.revoked ? "revoked" : "valid"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <h2 className="text-sm font-medium text-cyan-200">Demo Health</h2>
          <div className="mt-2 space-y-1 text-xs text-zinc-400">
            <p>
              Gemini: {health?.ai?.geminiKeyConfigured ? "key configured" : "missing key"} · model{" "}
              {health?.ai?.geminiModel ?? "n/a"}
            </p>
            <p>
              Gemini fallback chain:{" "}
              {health?.ai?.fallbackChainConfigured ? "env-configured" : "built-in defaults"} · order{" "}
              {(health?.ai?.effectiveModelOrder ?? []).join(" -> ") || "n/a"}
            </p>
            {health?.ai?.guardrailWarning ? (
              <p className="text-amber-300">Guardrail: {health.ai.guardrailWarning}</p>
            ) : null}
            <p className={health?.ai?.degraded ? "text-amber-300" : "text-zinc-400"}>
              Gemini status: {health?.ai?.degraded ? "degraded (fallback active)" : "healthy"} · recent fallbacks{" "}
              {health?.ai?.recentFallbackCount ?? 0}
            </p>
            <p>
              Model fallback successes (15m): {health?.ai?.recentModelFallbackSuccessCount ?? 0} · last successful
              model {health?.ai?.lastSuccessfulModelUsed ?? "n/a"}
            </p>
            {health?.ai?.lastFallback ? (
              <p className="text-amber-300">
                Last Gemini fallback: {health.ai.lastFallback.reason} via {health.ai.lastFallback.channel ?? "unknown"}
                {health.ai.lastFallback.quotaSubtype ? ` · subtype ${health.ai.lastFallback.quotaSubtype}` : ""}
                {health.ai.lastFallback.selectedModel ? ` · selected ${health.ai.lastFallback.selectedModel}` : ""}
                {health.ai.lastFallback.model ? ` · model ${health.ai.lastFallback.model}` : ""}
                {typeof health.ai.lastFallback.retryAfterSec === "number"
                  ? ` · retry ${health.ai.lastFallback.retryAfterSec}s`
                  : ""}
                {health.ai.lastFallback.quotaMetric ? ` · ${health.ai.lastFallback.quotaMetric}` : ""}
              </p>
            ) : (
              <p>Last Gemini fallback: none</p>
            )}
            <p>
              Chain: mode {health?.chain?.mode ?? "n/a"} · chain {health?.chain?.chainId ?? "n/a"} · rpc{" "}
              {health?.chain?.rpcConfigured ? "ok" : "missing"} · pk{" "}
              {health?.chain?.privateKeyValid ? "valid" : "invalid"}
            </p>
            <p>
              Contract: {health?.chain?.contractConfigured ? health.chain?.contractAddress : "not configured"}
            </p>
            {health?.chain?.configError ? <p className="text-amber-300">Config error: {health.chain.configError}</p> : null}
            <p>
              Stats: sessions {health?.stats?.sessions ?? 0} · certs {health?.stats?.certificates ?? 0} · active{" "}
              {health?.stats?.activeCertificates ?? 0}
            </p>
            {health?.lastCertificate ? (
              <p>
                Last cert: {health.lastCertificate.id.slice(0, 8)}… · {health.lastCertificate.anchorMode} /{" "}
                {health.lastCertificate.anchorKind}
              </p>
            ) : (
              <p>Last cert: none</p>
            )}
            {health?.lastAnchorError ? (
              <p className="text-amber-300">
                Last anchor error: {health.lastAnchorError.reasonCode} ·{" "}
                {health.lastAnchorError.operatorHint ?? health.lastAnchorError.reasonDetail}
              </p>
            ) : (
              <p>Last anchor error: none</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void runRevocationTick()}
            className="mt-3 rounded border border-cyan-500/50 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-500/10"
          >
            Run registry watcher tick
          </button>
          {tickInfo ? <p className="mt-2 text-xs text-zinc-500">{tickInfo}</p> : null}
        </section>

        <section className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <h2 className="text-sm font-medium text-rose-200">Simulate registry delta</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Revokes the soulbound certificate and emits Buyer Portal notification lines on that
            session.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs"
              placeholder="certificate id"
              value={revokeId}
              onChange={(e) => setRevokeId(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void revoke()}
              className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-500"
            >
              Revoke
            </button>
          </div>
        </section>
      </div>

      <div>
        <TerminalFeed
          lines={lines}
          className="min-h-[320px]"
          viewportClassName="min-h-[280px] h-[55vh]"
        />
      </div>
    </div>
  );
}
