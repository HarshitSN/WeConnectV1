import { randomBytes } from "crypto";

export function generateQidTxHash(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}
