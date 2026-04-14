export type RegistryCompany = {
  id: string;
  companyName: string;
  aliases: string[];
  websiteUrl: string;
  jurisdiction: string;
  registrySnippet: string;
  primaryOwner: string;
  ownershipFemalePct: number;
  directors: string[];
  riskFlags: string[];
};

export type SessionStage =
  | "idle"
  | "discovered"
  | "voice_confirm"
  | "vision_id"
  | "voice_attestation"
  | "anchoring"
  | "complete";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type CertificateRecord = {
  id: string;
  sessionId: string;
  revoked: boolean;
  revokedReason?: string;
  txHash: string;
  companyName: string;
  primaryOwner: string;
  ownershipFemalePct: number;
  issuedAt: string;
  attestationSummary?: string;
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
    readinessBlockers?: string[];
    ownershipEvidenceSource?: "prefill_registry" | "prefill_web";
    ownershipVisionVerified?: boolean;
  };
};
