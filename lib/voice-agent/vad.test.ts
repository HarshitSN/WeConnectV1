import test from "node:test";
import assert from "node:assert/strict";

import {
  createVADState,
  getDynamicSpeechThreshold,
  stepVAD,
  type VADConfig,
  type VADFrameMetrics,
} from "@/lib/voice-agent/vad";

const BASE_CONFIG: VADConfig = {
  analysisIntervalMs: 100,
  minRmsBase: 0.012,
  noiseMultiplier: 2.4,
  onsetFramesRequired: 3,
  releaseFramesRequired: 2,
  bargeInCooldownMs: 1500,
  silenceDurationMs: 1800,
  noiseFloorAlpha: 0.92,
  noiseFloorMargin: 0.85,
  minSpeechBandRatio: 0.3,
  minZcr: 0.015,
  maxZcr: 0.22,
  maxActiveSpeechMs: 8000,
  maxIdleRecordingMs: 7000,
  minIdleRotateQualifiedFrames: 3,
  preSpeechThresholdMultiplier: 0.82,
  preSpeechBandRatioMultiplier: 0.78,
  preSpeechMinZcr: 0.01,
  preSpeechMaxZcr: 0.28,
  preSpeechFramesRequired: 2,
  preBargeInCooldownMs: 900,
};

function m(rms: number, speechBandRatio: number, zcr: number): VADFrameMetrics {
  return { rms, speechBandRatio, zcr };
}

function feedFrames(
  state: ReturnType<typeof createVADState>,
  frames: VADFrameMetrics[],
  config: VADConfig = BASE_CONFIG,
): Array<ReturnType<typeof stepVAD>> {
  let nowMs = state.segmentStartedAtMs;
  const events: Array<ReturnType<typeof stepVAD>> = [];
  for (const frame of frames) {
    nowMs += config.analysisIntervalMs;
    events.push(stepVAD(state, frame, nowMs, config));
  }
  return events;
}

test("rustling-like high RMS with low speech-band ratio does not trigger speech_start", () => {
  const state = createVADState(0.004, 0);
  const events = feedFrames(state, [
    m(0.02, 0.1, 0.01),
    m(0.021, 0.12, 0.012),
    m(0.019, 0.11, 0.011),
    m(0.022, 0.09, 0.009),
    m(0.02, 0.1, 0.01),
  ]);
  assert.equal(events.includes("speech_start"), false);
  assert.equal(events.includes("pre_speech_start"), false);
  assert.equal(state.hasSpeech, false);
});

test("single-frame transient does not trigger pre_speech_start", () => {
  const state = createVADState(0.003, 0);
  const events = feedFrames(state, [m(0.013, 0.28, 0.03)]);
  assert.equal(events.includes("pre_speech_start"), false);
});

test("pre_speech_start triggers after required consecutive pre-speech frames", () => {
  const state = createVADState(0.003, 0);
  const events = feedFrames(state, [m(0.013, 0.28, 0.03), m(0.013, 0.29, 0.03)]);
  assert.equal(events.includes("pre_speech_start"), true);
});

test("noise burst does not spam pre_speech_start due to cooldown", () => {
  const state = createVADState(0.003, 0);
  const events = feedFrames(
    state,
    Array.from({ length: 10 }, () => m(0.013, 0.29, 0.03)),
  );
  assert.equal(events.filter((event) => event === "pre_speech_start").length, 1);
});

test("soft speech profile triggers onset with relaxed balanced thresholds", () => {
  const state = createVADState(0.003, 0);
  const events = feedFrames(state, [
    m(0.013, 0.34, 0.035),
    m(0.014, 0.33, 0.04),
    m(0.015, 0.35, 0.038),
    m(0.014, 0.32, 0.036),
  ]);

  assert.equal(events.filter((event) => event === "speech_start").length, 1);
  assert.equal(state.hasSpeech, true);
});

test("dynamic threshold still increases with elevated ambient noise", () => {
  const state = createVADState(0.01, 0);
  const threshold = getDynamicSpeechThreshold(state.noiseFloorRms, BASE_CONFIG);
  assert.ok(threshold > BASE_CONFIG.minRmsBase);
});

test("continuous speech-like noise hits watchdog and force-commits", () => {
  const state = createVADState(0.003, 0);
  const events: Array<ReturnType<typeof stepVAD>> = [];
  let nowMs = 0;

  for (let i = 0; i < 110; i += 1) {
    nowMs += BASE_CONFIG.analysisIntervalMs;
    events.push(stepVAD(state, m(0.02, 0.6, 0.07), nowMs, BASE_CONFIG));
  }

  assert.equal(events.includes("speech_start"), true);
  assert.equal(events.includes("force_commit_noise"), true);
});

test("idle no-speech segment rotates when qualified speech hints stay below threshold", () => {
  const state = createVADState(0.003, 0);
  const events = feedFrames(
    state,
    Array.from({ length: 80 }, () => m(0.003, 0.12, 0.01)),
  );
  assert.equal(events.includes("rotate_idle"), true);
  assert.equal(state.hasSpeech, false);
});

test("partial speech hints before idle timeout do not trigger rotate_idle", () => {
  const state = createVADState(0.003, 0);
  const events = feedFrames(
    state,
    [
      m(0.013, 0.34, 0.04),
      m(0.014, 0.35, 0.04),
      m(0.013, 0.33, 0.035),
      ...Array.from({ length: 80 }, () => m(0.004, 0.14, 0.01)),
    ],
  );
  assert.equal(events.includes("rotate_idle"), false);
  assert.ok(state.qualifiedVoicedFrames >= BASE_CONFIG.minIdleRotateQualifiedFrames);
});

test("after confirmed speech, sustained silence returns commit_silence", () => {
  const state = createVADState(0.003, 0);
  const events: Array<ReturnType<typeof stepVAD>> = [];
  let nowMs = 0;

  for (const frame of [m(0.016, 0.56, 0.08), m(0.017, 0.57, 0.09), m(0.018, 0.58, 0.08), m(0.019, 0.6, 0.09)]) {
    nowMs += BASE_CONFIG.analysisIntervalMs;
    events.push(stepVAD(state, frame, nowMs, BASE_CONFIG));
  }

  for (let i = 0; i < 30; i += 1) {
    nowMs += BASE_CONFIG.analysisIntervalMs;
    events.push(stepVAD(state, m(0.002, 0.1, 0.01), nowMs, BASE_CONFIG));
  }

  assert.equal(events.includes("speech_start"), true);
  assert.equal(events.includes("commit_silence"), true);
});
