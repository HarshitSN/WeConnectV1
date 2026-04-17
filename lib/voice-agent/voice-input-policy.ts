export type SegmentDropReason = "none" | "idle_rotate" | "forced_noise";

export interface SegmentDecisionInput {
  dropReason: SegmentDropReason;
  hadSpeech: boolean;
  qualifiedVoicedFrames: number;
  qualifiedSpeechMs: number;
  minSttQualifiedVoicedFrames: number;
  minSttQualifiedSpeechMs: number;
  minIdleRotateQualifiedFrames: number;
}

export interface SegmentDecision {
  shouldDrop: boolean;
  skippedByQualityGate: boolean;
}

const ALLOWED_SHORT_WORDS = new Set(["yes", "no", "ok", "okay", "yeah", "yep", "nope"]);
const NOISE_TOKENS = new Set(["uh", "um", "hmm", "huh", "mm", "ah", "oh", "eh"]);

export function shouldDropSegment(input: SegmentDecisionInput): SegmentDecision {
  if (input.dropReason === "forced_noise") {
    return { shouldDrop: true, skippedByQualityGate: false };
  }

  if (input.dropReason === "idle_rotate" && input.qualifiedVoicedFrames < input.minIdleRotateQualifiedFrames) {
    return { shouldDrop: true, skippedByQualityGate: false };
  }

  // Never send STT unless strict speech confirmation happened in VAD.
  if (!input.hadSpeech) {
    return { shouldDrop: true, skippedByQualityGate: false };
  }

  const skippedByQualityGate =
    input.qualifiedVoicedFrames < input.minSttQualifiedVoicedFrames
    || input.qualifiedSpeechMs < input.minSttQualifiedSpeechMs;

  return { shouldDrop: skippedByQualityGate, skippedByQualityGate };
}

export function isNoiseLikeTranscript(input: string): boolean {
  const text = input.trim().toLowerCase();
  if (!text) return true;
  if (!/[a-z0-9]/i.test(text)) return true;

  const compact = text.replace(/\s+/g, " ");
  if (ALLOWED_SHORT_WORDS.has(compact)) return false;

  const tokens = compact.split(" ").filter(Boolean);
  if (tokens.length === 1 && NOISE_TOKENS.has(tokens[0])) return true;

  return compact.length < 2;
}
