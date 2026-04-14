import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseEther,
} from "viem";
import { generateQidTxHash } from "./tx-hash";

type AnchorMode = "real" | "demo";
type ChainMode = "real" | "demo" | "auto";

export type AnchorSubmissionResult = {
  txHash: string;
  mode: AnchorMode;
  reason?: string;
  anchorKind: "contract_call" | "tx_data";
  contractAddress?: string;
  digest: `0x${string}`;
};

export type ChainFailureCode =
  | "config_invalid"
  | "rpc_unreachable"
  | "network_timeout"
  | "insufficient_funds"
  | "tx_reverted"
  | "tx_rejected"
  | "receipt_invalid"
  | "unknown";

export class AnchorSubmissionError extends Error {
  code: ChainFailureCode;
  detail: string;

  constructor(code: ChainFailureCode, detail: string) {
    super(`anchor_${code}:${detail}`);
    this.name = "AnchorSubmissionError";
    this.code = code;
    this.detail = detail;
  }
}

export type AnchorPayload = {
  sessionId: string;
  companyName: string;
  certType?: string;
  issuedAtIso: string;
};

type ChainConfig = {
  mode: ChainMode;
  rpcUrl: string;
  privateKey: `0x${string}`;
  chainId: number;
  contractAddress?: `0x${string}`;
};

export type BlockchainHealth = {
  mode: ChainMode;
  chainId: number;
  rpcConfigured: boolean;
  privateKeyConfigured: boolean;
  privateKeyValid: boolean;
  contractConfigured: boolean;
  contractAddress?: string;
  configError?: string;
};

const RECEIPT_RECHECK_ATTEMPTS = 3;
const RECEIPT_RECHECK_DELAY_MS = 1200;

type MinimalReceipt = {
  status: string;
  blockHash?: `0x${string}`;
  blockNumber?: bigint | null;
};

function fallback(reason: string): AnchorSubmissionResult {
  const digest = keccak256(
    encodePacked(["string", "string"], [reason, new Date().toISOString()]),
  );
  return {
    txHash: generateQidTxHash(),
    mode: "demo",
    reason,
    anchorKind: "tx_data",
    digest,
  };
}

function sanitizeReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().slice(0, 200) || "unknown";
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasValidBlockHash(blockHash: `0x${string}` | undefined): boolean {
  if (!blockHash || !/^0x[0-9a-fA-F]{64}$/.test(blockHash)) return false;
  return !/^0x0{64}$/.test(blockHash);
}

function hasValidBlockNumber(blockNumber: bigint | null | undefined): boolean {
  return typeof blockNumber === "bigint" && blockNumber > BigInt(0);
}

function receiptLooksStable(receipt: MinimalReceipt): boolean {
  if (receipt.status !== "success") return false;
  return hasValidBlockNumber(receipt.blockNumber) || hasValidBlockHash(receipt.blockHash);
}

function describeReceipt(receipt: MinimalReceipt): string {
  return `status=${receipt.status};blockNumber=${String(receipt.blockNumber ?? "null")};blockHash=${receipt.blockHash ?? "null"}`;
}

async function ensureStableReceipt(
  pub: ReturnType<typeof createPublicClient>,
  txHash: `0x${string}`,
  initialReceipt: MinimalReceipt,
): Promise<void> {
  let receipt = initialReceipt;
  if (receiptLooksStable(receipt)) return;
  for (let i = 0; i < RECEIPT_RECHECK_ATTEMPTS; i += 1) {
    await waitMs(RECEIPT_RECHECK_DELAY_MS);
    const next = await pub.getTransactionReceipt({ hash: txHash });
    if (next.status !== "success") {
      throw new Error(`receipt_status_${next.status}`);
    }
    receipt = next;
    if (receiptLooksStable(receipt)) return;
  }
  throw new Error(`invalid_receipt:tx_hash=${txHash};${describeReceipt(receipt)}`);
}

function classifyChainFailure(error: unknown): ChainFailureCode {
  const message = sanitizeReason(error).toLowerCase();
  if (
    message.includes("missing chain_rpc_url") ||
    message.includes("invalid chain_private_key") ||
    message.includes("config_error")
  ) {
    return "config_invalid";
  }
  if (
    message.includes("insufficient funds") ||
    message.includes("funds for gas") ||
    message.includes("intrinsic gas too low")
  ) {
    return "insufficient_funds";
  }
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("waitfortransactionreceipt")
  ) {
    return "network_timeout";
  }
  if (
    message.includes("econn") ||
    message.includes("enotfound") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("socket hang up") ||
    message.includes("http request failed")
  ) {
    return "rpc_unreachable";
  }
  if (
    message.includes("reverted") ||
    message.includes("receipt_status_reverted") ||
    message.includes("contract_receipt_status_reverted")
  ) {
    return "tx_reverted";
  }
  if (
    message.includes("nonce too low") ||
    message.includes("replacement transaction underpriced") ||
    message.includes("user rejected") ||
    message.includes("rejected")
  ) {
    return "tx_rejected";
  }
  if (
    message.includes("invalid_receipt_block_hash") ||
    message.includes("invalid_receipt:") ||
    message.includes("receipt_status_") ||
    message.includes("contract_receipt_status_")
  ) {
    return "receipt_invalid";
  }
  return "unknown";
}

function getChainConfig(): ChainConfig {
  const modeRaw = String(process.env.CHAIN_MODE ?? "auto").toLowerCase();
  const mode: ChainMode = modeRaw === "real" || modeRaw === "demo" || modeRaw === "auto" ? modeRaw : "auto";
  const rpcUrl = String(process.env.CHAIN_RPC_URL ?? "").trim();
  const privateKey = String(process.env.CHAIN_PRIVATE_KEY ?? "").trim();
  const chainIdRaw = Number(process.env.CHAIN_ID ?? baseSepolia.id);
  const chainId = Number.isFinite(chainIdRaw) ? chainIdRaw : baseSepolia.id;
  const contractAddressRaw = String(process.env.CHAIN_CONTRACT_ADDRESS ?? "").trim();
  const contractAddress =
    contractAddressRaw && isAddress(contractAddressRaw)
      ? (contractAddressRaw as `0x${string}`)
      : undefined;

  if (mode === "demo") {
    return { mode, rpcUrl: "", privateKey: "0x0", chainId, contractAddress };
  }
  if (!rpcUrl) {
    throw new Error("missing CHAIN_RPC_URL");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("invalid CHAIN_PRIVATE_KEY");
  }
  return {
    mode,
    rpcUrl,
    privateKey: privateKey as `0x${string}`,
    chainId,
    contractAddress,
  };
}

export function getBlockchainHealth(): BlockchainHealth {
  const modeRaw = String(process.env.CHAIN_MODE ?? "auto").toLowerCase();
  const mode: ChainMode = modeRaw === "real" || modeRaw === "demo" || modeRaw === "auto" ? modeRaw : "auto";
  const rpcUrl = String(process.env.CHAIN_RPC_URL ?? "").trim();
  const privateKey = String(process.env.CHAIN_PRIVATE_KEY ?? "").trim();
  const contractAddressRaw = String(process.env.CHAIN_CONTRACT_ADDRESS ?? "").trim();
  const chainIdRaw = Number(process.env.CHAIN_ID ?? baseSepolia.id);
  const chainId = Number.isFinite(chainIdRaw) ? chainIdRaw : baseSepolia.id;
  const privateKeyValid = /^0x[0-9a-fA-F]{64}$/.test(privateKey);
  const contractConfigured = Boolean(contractAddressRaw && isAddress(contractAddressRaw));
  try {
    void getChainConfig();
    return {
      mode,
      chainId,
      rpcConfigured: Boolean(rpcUrl),
      privateKeyConfigured: Boolean(privateKey),
      privateKeyValid,
      contractConfigured,
      contractAddress: contractConfigured ? contractAddressRaw : undefined,
    };
  } catch (error) {
    return {
      mode,
      chainId,
      rpcConfigured: Boolean(rpcUrl),
      privateKeyConfigured: Boolean(privateKey),
      privateKeyValid,
      contractConfigured,
      contractAddress: contractConfigured ? contractAddressRaw : undefined,
      configError: sanitizeReason(error),
    };
  }
}

function buildAnchorDigest(payload: AnchorPayload): `0x${string}` {
  const digest = keccak256(
    encodePacked(
      ["string", "string", "string", "string"],
      [payload.sessionId, payload.companyName, payload.certType ?? "", payload.issuedAtIso],
    ),
  );
  return digest;
}

export async function submitAnchorTx(payload: AnchorPayload): Promise<AnchorSubmissionResult> {
  let config: ChainConfig;
  try {
    config = getChainConfig();
  } catch (error) {
    const detail = sanitizeReason(error);
    if (String(process.env.CHAIN_MODE ?? "auto").toLowerCase() === "real") {
      throw new AnchorSubmissionError("config_invalid", detail);
    }
    return fallback(`config_error:${detail}`);
  }
  if (config.mode === "demo") {
    return fallback("chain_mode_demo");
  }

  try {
    const account = privateKeyToAccount(config.privateKey);
    if (!isAddress(account.address)) {
      throw new Error("invalid account address");
    }
    const chain = config.chainId === baseSepolia.id ? baseSepolia : { ...baseSepolia, id: config.chainId };
    const transport = http(config.rpcUrl);
    const wallet = createWalletClient({
      account,
      chain,
      transport,
    });
    const pub = createPublicClient({
      chain,
      transport,
    });
    const digest = buildAnchorDigest(payload);
    if (config.contractAddress) {
      const contractAbi = parseAbi([
        "function anchorVerification(bytes32 digest, string sessionId, string companyName, string certType, string issuedAtIso)",
      ]);
      const txHash = await wallet.writeContract({
        account,
        chain,
        address: config.contractAddress,
        abi: contractAbi,
        functionName: "anchorVerification",
        args: [digest, payload.sessionId, payload.companyName, payload.certType ?? "", payload.issuedAtIso],
      });
      const receipt = await pub.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
        timeout: 45_000,
      });
      if (receipt.status !== "success") {
        throw new Error(`contract_receipt_status_${receipt.status}`);
      }
      await ensureStableReceipt(pub, txHash, receipt);
      return {
        txHash,
        mode: "real",
        anchorKind: "contract_call",
        contractAddress: config.contractAddress,
        digest,
      };
    }
    const txHash = await wallet.sendTransaction({
      account,
      chain,
      to: account.address,
      value: parseEther("0"),
      data: digest,
    });
    const receipt = await pub.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 45_000,
    });
    if (receipt.status !== "success") {
      throw new Error(`receipt_status_${receipt.status}`);
    }
    await ensureStableReceipt(pub, txHash, receipt);
    return {
      txHash,
      mode: "real",
      anchorKind: "tx_data",
      digest,
    };
  } catch (error) {
    if (config.mode === "real") {
      const detail = sanitizeReason(error);
      const code = classifyChainFailure(error);
      throw new AnchorSubmissionError(code, detail);
    }
    return fallback(`auto_fallback:${sanitizeReason(error)}`);
  }
}
