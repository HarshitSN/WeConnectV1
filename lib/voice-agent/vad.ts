export interface VADConfig {
  analysisIntervalMs: number;
  minRmsBase: number;
  noiseMultiplier: number;
  onsetFramesRequired: number;
  releaseFramesRequired: number;
  bargeInCooldownMs: number;
  silenceDurationMs: number;
  noiseFloorAlpha: number;
  noiseFloorMargin: number;
  minSpeechBandRatio: number;
  minZcr: number;
  maxZcr: number;
  maxActiveSpeechMs: number;
  maxIdleRecordingMs: number;
  minIdleRotateQualifiedFrames: number;
  preSpeechThresholdMultiplier: number;
  preSpeechBandRatioMultiplier: number;
  preSpeechMinZcr: number;
  preSpeechMaxZcr: number;
  preSpeechFramesRequired: number;
  preBargeInCooldownMs: number;
}

export interface VADFrameMetrics {
  rms: number;
  speechBandRatio: number;
  zcr: number;
}

export interface VADState {
  hasSpeech: boolean;
  speechFrameCount: number;
  releaseFrameCount: number;
  noiseFloorRms: number;
  silentSinceMs: number | null;
  lastBargeInTs: number;
  segmentStartedAtMs: number;
  speechActiveSinceMs: number | null;
  qualifiedVoicedFrames: number;
  lastPreBargeInTs: number;
  preSpeechFrameCount: number;
}

export type VADEvent = "none" | "pre_speech_start" | "speech_start" | "commit_silence" | "force_commit_noise" | "rotate_idle";

export function createVADState(initialNoiseFloor = 0.003, nowMs = 0): VADState {
  return {
    hasSpeech: false,
    speechFrameCount: 0,
    releaseFrameCount: 0,
    noiseFloorRms: initialNoiseFloor,
    silentSinceMs: null,
    lastBargeInTs: Number.NEGATIVE_INFINITY,
    segmentStartedAtMs: nowMs,
    speechActiveSinceMs: null,
    qualifiedVoicedFrames: 0,
    lastPreBargeInTs: Number.NEGATIVE_INFINITY,
    preSpeechFrameCount: 0,
  };
}

export function getDynamicSpeechThreshold(noiseFloorRms: number, config: VADConfig): number {
  return Math.max(config.minRmsBase, noiseFloorRms * config.noiseMultiplier);
}

function isSpeechLikeFrame(metrics: VADFrameMetrics, dynamicThreshold: number, config: VADConfig): boolean {
  return (
    metrics.rms >= dynamicThreshold
    && metrics.speechBandRatio >= config.minSpeechBandRatio
    && metrics.zcr >= config.minZcr
    && metrics.zcr <= config.maxZcr
  );
}

function isSpeechLikeHoldFrame(metrics: VADFrameMetrics, releaseThreshold: number, config: VADConfig): boolean {
  return (
    metrics.rms >= releaseThreshold
    && metrics.speechBandRatio >= config.minSpeechBandRatio * 0.85
    && metrics.zcr >= config.minZcr
    && metrics.zcr <= config.maxZcr
  );
}

function isPreSpeechLikeFrame(metrics: VADFrameMetrics, dynamicThreshold: number, config: VADConfig): boolean {
  const preThreshold = Math.max(config.minRmsBase * 0.9, dynamicThreshold * config.preSpeechThresholdMultiplier);
  return (
    metrics.rms >= preThreshold
    && metrics.speechBandRatio >= config.minSpeechBandRatio * config.preSpeechBandRatioMultiplier
    && metrics.zcr >= config.preSpeechMinZcr
    && metrics.zcr <= config.preSpeechMaxZcr
  );
}

export function stepVAD(
  state: VADState,
  metricsInput: number | VADFrameMetrics,
  nowMs: number,
  config: VADConfig,
): VADEvent {
  const metrics: VADFrameMetrics =
    typeof metricsInput === "number"
      ? { rms: metricsInput, speechBandRatio: 1, zcr: 0.08 }
      : metricsInput;

  if (state.segmentStartedAtMs === 0) {
    state.segmentStartedAtMs = nowMs;
  }

  const dynamicThreshold = getDynamicSpeechThreshold(state.noiseFloorRms, config);
  const releaseThreshold = Math.max(config.minRmsBase * 0.85, dynamicThreshold * 0.9);

  // Update ambient noise floor only when safely under decision boundary.
  if (metrics.rms < dynamicThreshold * config.noiseFloorMargin) {
    state.noiseFloorRms =
      config.noiseFloorAlpha * state.noiseFloorRms + (1 - config.noiseFloorAlpha) * metrics.rms;
  }

  const onsetSpeechLike = isSpeechLikeFrame(metrics, dynamicThreshold, config);
  const holdSpeechLike = isSpeechLikeHoldFrame(metrics, releaseThreshold, config);
  const preSpeechLike = isPreSpeechLikeFrame(metrics, dynamicThreshold, config);

  if (!state.hasSpeech) {
    if (
      nowMs - state.segmentStartedAtMs >= config.maxIdleRecordingMs
      && state.qualifiedVoicedFrames < config.minIdleRotateQualifiedFrames
    ) {
      return "rotate_idle";
    }

    if (onsetSpeechLike) {
      state.speechFrameCount += 1;
      state.qualifiedVoicedFrames += 1;
      state.releaseFrameCount = 0;
      if (state.speechFrameCount >= config.onsetFramesRequired) {
        state.hasSpeech = true;
        state.silentSinceMs = null;
        state.speechFrameCount = 0;
        state.releaseFrameCount = 0;
        state.preSpeechFrameCount = 0;
        state.speechActiveSinceMs = nowMs;

        if (nowMs - state.lastBargeInTs >= config.bargeInCooldownMs) {
          state.lastBargeInTs = nowMs;
          return "speech_start";
        }
      }
    } else {
      state.speechFrameCount = 0;
    }

    if (preSpeechLike) {
      state.preSpeechFrameCount += 1;
    } else {
      state.preSpeechFrameCount = 0;
    }

    if (
      state.preSpeechFrameCount >= config.preSpeechFramesRequired
      && nowMs - state.lastPreBargeInTs >= config.preBargeInCooldownMs
    ) {
      state.lastPreBargeInTs = nowMs;
      state.preSpeechFrameCount = 0;
      return "pre_speech_start";
    }
    return "none";
  }

  if (holdSpeechLike) {
    state.qualifiedVoicedFrames += 1;
    state.releaseFrameCount = 0;
    state.silentSinceMs = null;
  } else {
    state.releaseFrameCount += 1;
    if (state.releaseFrameCount >= config.releaseFramesRequired) {
      if (state.silentSinceMs === null) {
        state.silentSinceMs = nowMs;
      } else if (nowMs - state.silentSinceMs >= config.silenceDurationMs) {
        return "commit_silence";
      }
    }
  }

  if (state.speechActiveSinceMs !== null && nowMs - state.speechActiveSinceMs >= config.maxActiveSpeechMs) {
    return "force_commit_noise";
  }

  return "none";
}
