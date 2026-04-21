import { NextResponse } from "next/server";
import {
  AnchorSubmissionError,
  getBlockchainHealth,
  type AnchorSubmissionResult,
  type ChainFailureCode,
} from "@/lib/blockchain";
import { getCompanyById } from "@/lib/registry";
import { submitAnchorTx } from "@/lib/blockchain";
import { verificationReadiness } from "@/lib/verification-readiness";
import { getDomainState, patchDomainState, pushGovernanceNotification } from "@/lib/store/domain-store";
import { trustLevelFromCertification } from "@/lib/domains/contracts";
import { generateTrustReport } from "@/lib/domains/trust-report";
import { upsertCertifiedSupplierFromSession } from "@/lib/store/buyer-catalog";
import {
  appendTerminal,
  ensureSession,
  getSession,
  issueCertificate,
  setSessionAnchorError,
  setSessionStage,
} from "@/lib/session-store";

function anchorHint(reasonCode: ChainFailureCode): string {
  switch (reasonCode) {
    case "config_invalid":
      return "Check CHAIN_RPC_URL, CHAIN_PRIVATE_KEY, and CHAIN_ID configuration.";
    case "insufficient_funds":
      return "Fund the anchoring wallet on Base Sepolia for gas and retry.";
    case "rpc_unreachable":
      return "RPC is unreachable. Verify provider endpoint/network and retry.";
    case "network_timeout":
      return "Chain confirmation timed out. Retry or use a more reliable RPC provider.";
    case "tx_reverted":
      return "Transaction reverted on-chain. Verify contract/network parameters.";
    case "tx_rejected":
      return "Transaction rejected (nonce/fee/user). Retry after checking wallet state.";
    case "receipt_invalid":
      return "Invalid receipt returned by provider. Retry and check RPC health.";
    default:
      return "Unknown chain error. Inspect server logs and provider diagnostics.";
  }
}

function extractTxHashFromDetail(detail: string): string | null {
  const match = detail.match(/0x[0-9a-fA-F]{64}/);
  return match?.[0] ?? null;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    sessionId?: string;
  };
  const sessionId = body.sessionId;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  ensureSession(sessionId);
  // Keep server session stage aligned with explicit "Issue certificate" CTA flow.
  setSessionStage(sessionId, "anchoring");
  const anchoringSession = getSession(sessionId);
  if (!anchoringSession) {
    return NextResponse.json({ error: "session unavailable after restore" }, { status: 400 });
  }
  const company = anchoringSession.companyId
    ? (getCompanyById(anchoringSession.companyId) ?? anchoringSession.companySnapshot ?? null)
    : (anchoringSession.companySnapshot ?? null);
  if (!company) {
    return NextResponse.json({ error: "no company on session" }, { status: 400 });
  }
  const readiness = verificationReadiness(anchoringSession);
  if (!readiness.isReady) {
    return NextResponse.json(
      { error: "verification not ready", blockers: readiness.blockers },
      { status: 400 },
    );
  }

  appendTerminal(sessionId, "[QID_CHAIN] anchoring_soulbound_token start");
  const chainHealth = getBlockchainHealth();
  appendTerminal(
    sessionId,
    `[QID_CHAIN] config mode=${chainHealth.mode} chainId=${chainHealth.chainId} rpc_configured=${chainHealth.rpcConfigured} private_key_valid=${chainHealth.privateKeyValid} contract_configured=${chainHealth.contractConfigured}`,
  );
  const issuedAt = new Date().toISOString();
  const workflow = getDomainState(sessionId);
  let anchorResult: AnchorSubmissionResult;
  try {
    anchorResult = await submitAnchorTx({
      sessionId,
      companyName: company.companyName,
      certType: anchoringSession.registration?.cert_type,
      issuedAtIso: issuedAt,
    });
  } catch (error) {
    const reasonCode: ChainFailureCode =
      error instanceof AnchorSubmissionError ? error.code : "unknown";
    const reasonDetail =
      error instanceof AnchorSubmissionError
        ? error.detail
        : error instanceof Error
          ? error.message
          : "chain submission failed";
    const operatorHint = anchorHint(reasonCode);
    const diagnostics = error instanceof AnchorSubmissionError ? error.diagnostics : undefined;
    appendTerminal(sessionId, `[QID_CHAIN] mode=real`);
    appendTerminal(sessionId, `[QID_CHAIN] error_code=${reasonCode}`);
    appendTerminal(sessionId, `[QID_CHAIN] error_detail=${reasonDetail}`);
    if (diagnostics) {
      appendTerminal(
        sessionId,
        `[QID_CHAIN] diagnostics attempt=${diagnostics.attemptId} stage=${diagnostics.stage} elapsed_ms=${diagnostics.elapsedMs ?? "n/a"} rpc_host=${diagnostics.rpcHost ?? "n/a"} kind=${diagnostics.anchorKind ?? "n/a"}`,
      );
    }
    const errorTxHash = extractTxHashFromDetail(reasonDetail);
    if (errorTxHash) {
      appendTerminal(sessionId, `[QID_CHAIN] error_tx_hash=${errorTxHash}`);
    }
    appendTerminal(sessionId, `[QID_CHAIN] operator_hint=${operatorHint}`);
    console.error("[QID_CHAIN] anchor_failed", {
      sessionId,
      reasonCode,
      reasonDetail,
      diagnostics,
      stack: error instanceof Error ? error.stack : undefined,
    });
    setSessionAnchorError(sessionId, {
      at: new Date().toISOString(),
      reasonCode,
      reasonDetail,
      operatorHint,
    });
    return NextResponse.json(
      {
        error: "on-chain anchoring failed",
        blockers: ["chain_submit_failed"],
        reasonCode,
        reasonDetail,
        operatorHint,
        diagnostics,
      },
      { status: 502 },
    );
  }
  appendTerminal(sessionId, `[QID_CHAIN] mode=${anchorResult.mode}`);
  appendTerminal(sessionId, `[QID_CHAIN] anchor_kind=${anchorResult.anchorKind}`);
  appendTerminal(sessionId, `[QID_CHAIN] tx_submitted hash=${anchorResult.txHash.slice(0, 10)}…`);
  appendTerminal(sessionId, `[QID_CHAIN] digest=${anchorResult.digest.slice(0, 14)}…`);
  if (anchorResult.diagnostics) {
    appendTerminal(
      sessionId,
      `[QID_CHAIN] diagnostics attempt=${anchorResult.diagnostics.attemptId} stage=${anchorResult.diagnostics.stage} elapsed_ms=${anchorResult.diagnostics.elapsedMs ?? "n/a"} rpc_host=${anchorResult.diagnostics.rpcHost ?? "n/a"}`,
    );
  }
  if (anchorResult.contractAddress) {
    appendTerminal(sessionId, `[QID_CHAIN] contract=${anchorResult.contractAddress}`);
  }
  if (anchorResult.reason) {
    appendTerminal(sessionId, `[QID_CHAIN] fallback_reason=${anchorResult.reason}`);
  }

  const cert = issueCertificate(sessionId, {
    sessionId,
    txHash: anchorResult.txHash,
    companyName: company.companyName,
    primaryOwner: company.primaryOwner,
    ownershipFemalePct: company.ownershipFemalePct,
    issuedAt,
    attestationSummary: anchoringSession.attestation?.rationale,
    manualReviewSuggested: anchoringSession.attestation?.manualReview,
    provenanceSummary: {
      certType: anchoringSession.registration?.cert_type,
      paidAtIssuance: readiness.paid,
      discoveryProvider: anchoringSession.discoveryMeta?.provider,
      selectedCandidateTitle: anchoringSession.selectedCandidate?.title,
      visionIdPassed: anchoringSession.visionChecks?.idPassed,
      ownershipEvidenceSource: anchoringSession.discoveryMeta?.provider ? "prefill_web" : "prefill_registry",
      ownershipVisionVerified: false,
      anchorMode: anchorResult.mode,
      anchorFallbackReason: anchorResult.reason,
      anchorKind: anchorResult.anchorKind,
      anchorContractAddress: anchorResult.contractAddress,
      anchorDigest: anchorResult.digest,
      readinessBlockers: [],
    },
  });

  const report = generateTrustReport(sessionId, anchoringSession);
  const validTillIso = new Date(new Date(issuedAt).setFullYear(new Date(issuedAt).getFullYear() + 3)).toISOString();
  const resolvedCertificationType =
    workflow.certificationType === "none"
      ? ((anchoringSession.registration?.cert_type as "self" | "digital" | undefined) ?? "self")
      : workflow.certificationType;
  const shouldCapturePayment = resolvedCertificationType === "digital";
  patchDomainState(sessionId, {
    trustLevel: trustLevelFromCertification(resolvedCertificationType),
    certificationType: resolvedCertificationType,
    certificationStage: "completed",
    verificationStatus: "passed",
    trustReport: report,
    payment: {
      ...workflow.payment,
      state: workflow.payment.state === "refunded" ? "refunded" : shouldCapturePayment ? "captured" : workflow.payment.state,
      captureAt: shouldCapturePayment ? new Date().toISOString() : workflow.payment.captureAt,
    },
    governance: {
      ...workflow.governance,
      validTill: validTillIso,
      notifications: workflow.governance.notifications,
      auditTrail: workflow.governance.auditTrail,
    },
  });
  pushGovernanceNotification(
    sessionId,
    shouldCapturePayment
      ? "Certification approved and payment captured"
      : "Self-certification approved (no payment capture required)",
  );
  upsertCertifiedSupplierFromSession({
    id: `live-${cert.id}`,
    businessName: company.companyName,
    country: anchoringSession.registration?.country || "Unknown",
    naicsCodes: anchoringSession.registration?.naics_codes ?? [],
    unspscCodes: anchoringSession.registration?.unspsc_codes ?? [],
    designations: anchoringSession.registration?.designations ?? [],
    certType: resolvedCertificationType,
    trustScore: report.trustScore,
    blockchainVerified: anchorResult.mode === "real",
    womenOwned: Boolean(anchoringSession.registration?.women_owned),
    businessSummary: anchoringSession.registration?.business_description,
    clientsWorkedWith: workflow.questionnaireAnswers.clients_worked_with,
    lastVerified: report.generatedAt,
  });

  setSessionStage(sessionId, "complete");
  setSessionAnchorError(sessionId, null);
  appendTerminal(sessionId, "[BUYER_PORTAL] certificate_active=true");
  appendTerminal(sessionId, `[CERTIFICATE] id=${cert.id} SBT_MINTED (demo)`);

  return NextResponse.json({
    certificate: cert,
    verifyPath: `/verify/${cert.id}`,
    anchorMode: anchorResult.mode,
    anchorFallbackReason: anchorResult.reason,
    anchorKind: anchorResult.anchorKind,
    anchorContractAddress: anchorResult.contractAddress,
    anchorDigest: anchorResult.digest,
  });
}
